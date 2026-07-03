import { Router, type IRouter } from "express";
import { SearchImagesBody, SearchImagesResponse, GetImageSettingsResponse } from "@workspace/api-zod";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const PEXELS_API_KEY = process.env.PEXELS_API_KEY;
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const GOOGLE_CX = process.env.GOOGLE_CX;
const UNSPLASH_ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY;
const PIXABAY_API_KEY = process.env.PIXABAY_API_KEY;

// ---------------------------------------------------------------------------
// In-memory result cache (10-minute TTL)
// ---------------------------------------------------------------------------
interface CacheEntry {
  result: unknown;
  timestamp: number;
}
const resultCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 10 * 60 * 1000;

function getCacheKey(lineText: string, perPage: number, orientation: string, provider: string): string {
  return `${lineText.trim().toLowerCase()}:${perPage}:${orientation}:${provider}`;
}

function getFromCache(key: string): unknown | null {
  const entry = resultCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    resultCache.delete(key);
    return null;
  }
  return entry.result;
}

function setCache(key: string, result: unknown): void {
  resultCache.set(key, { result, timestamp: Date.now() });
  if (resultCache.size > 500) {
    const now = Date.now();
    for (const [k, v] of resultCache) {
      if (now - v.timestamp > CACHE_TTL_MS) resultCache.delete(k);
    }
  }
}

// ---------------------------------------------------------------------------
// Language detection (Unicode range-based)
// ---------------------------------------------------------------------------
const DEVANAGARI_RE = /[\u0900-\u097F]/;
const ARABIC_RE = /[\u0600-\u06FF]/;
const CHINESE_RE = /[\u4E00-\u9FFF]/;
const CYRILLIC_RE = /[\u0400-\u04FF]/;
const GREEK_RE = /[\u0370-\u03FF]/;

function detectLanguage(text: string): { code: string; name: string } {
  if (DEVANAGARI_RE.test(text)) return { code: "hi", name: "Hindi" };
  if (ARABIC_RE.test(text)) return { code: "ar", name: "Arabic" };
  if (CHINESE_RE.test(text)) return { code: "zh", name: "Chinese" };
  if (CYRILLIC_RE.test(text)) return { code: "ru", name: "Russian" };
  if (GREEK_RE.test(text)) return { code: "el", name: "Greek" };
  return { code: "en", name: "English" };
}

// ---------------------------------------------------------------------------
// Google Cloud Translation API
// ---------------------------------------------------------------------------
interface GoogleTranslateResponse {
  data: {
    translations: Array<{
      translatedText: string;
      detectedSourceLanguage?: string;
    }>;
  };
}

async function translateToEnglish(text: string): Promise<string | null> {
  if (GOOGLE_API_KEY) {
    try {
      const url = `https://translation.googleapis.com/language/translate/v2?key=${GOOGLE_API_KEY}`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q: text, target: "en", format: "text" }),
      });
      if (response.ok) {
        const data = (await response.json()) as GoogleTranslateResponse;
        const translated = data.data?.translations?.[0]?.translatedText ?? null;
        if (translated) return translated;
      } else {
        logger.warn({ status: response.status }, "Google Cloud Translate returned error — trying free endpoint");
      }
    } catch (err) {
      logger.warn({ err }, "Google Cloud Translate call failed — trying free endpoint");
    }
  }

  try {
    const encoded = encodeURIComponent(text);
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encoded}`;
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!response.ok) {
      logger.warn({ status: response.status }, "Free translate endpoint failed");
      return null;
    }
    const data = (await response.json()) as Array<Array<Array<string>>>;
    const sentences = data?.[0];
    if (!Array.isArray(sentences)) return null;
    const translation = sentences
      .map((chunk) => (Array.isArray(chunk) ? chunk[0] : ""))
      .join("")
      .trim();
    return translation || null;
  } catch (err) {
    logger.warn({ err }, "Free translate endpoint call failed");
    return null;
  }
}

// ---------------------------------------------------------------------------
// Keyword extraction
// ---------------------------------------------------------------------------
const STOPWORDS = new Set([
  "a","an","the","is","was","were","it","he","she","they","his","her",
  "their","its","this","that","those","these","and","or","but","in","on",
  "at","to","for","of","from","with","by","has","had","have","be","been",
  "being","do","does","did","will","would","could","should","may","might",
  "shall","can","am","are","there","here","where","when","what","which",
  "who","whom","how","why","very","just","also","some","any","all","each",
  "as","if","while","then","than","so","up","out","down","into","through",
  "after","before","over","under","about","around","like","one","two",
  "three","four","five","six","seven","eight","nine","ten","i","me","my",
  "we","our","you","your","him","her","us","them","its","was","were",
  "time","slowly","quickly","little","slowly","started","began","went",
  "came","said","going","coming","looking","looked","saw","seen","see",
  "get","got","take","took","give","gave","put","let","make","made",
  "know","knew","think","thought","back","back","well","still","even",
  "much","more","most","only","own","same","other","another"
]);

const CONTEXT_EXPANDERS: [RegExp, string][] = [
  [/sunrise|sunset|dawn|dusk|morning|golden hour/i, "golden hour lighting"],
  [/mountain|hill|peak|range/i, "landscape scenic"],
  [/school|classroom|student|teacher/i, "education"],
  [/rain|rainy|monsoon/i, "rainy weather"],
  [/snow|winter|cold/i, "winter snow"],
  [/beach|ocean|sea|waves/i, "beach seascape"],
  [/forest|jungle|tree|woods/i, "nature forest"],
  [/city|urban|street|road|building/i, "urban photography"],
  [/child|kid|children|boy|girl/i, "childhood"],
  [/family|mother|father|parent/i, "family"],
  [/food|meal|eat|restaurant/i, "food photography"],
  [/happy|joy|laugh|smile/i, "joyful"],
  [/sad|cry|tears|grief/i, "emotional"],
  [/festival|celebrate|party|event/i, "celebration"],
];

function buildSearchQuery(englishText: string, maxWords = 7): string {
  const words = englishText
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));

  const seen = new Set<string>();
  const unique: string[] = [];
  for (const w of words) {
    if (!seen.has(w)) { seen.add(w); unique.push(w); }
  }

  const query = unique.slice(0, maxWords).join(" ");

  for (const [pattern, suffix] of CONTEXT_EXPANDERS) {
    if (pattern.test(query) || pattern.test(englishText)) {
      const extra = suffix.split(" ").filter((w) => !unique.includes(w)).join(" ");
      if (extra) return `${query} ${extra}`.trim();
      return query;
    }
  }

  return query;
}

// ---------------------------------------------------------------------------
// Semantic extraction
// ---------------------------------------------------------------------------
interface SemanticAnalysis {
  subject: string | null;
  action: string | null;
  location: string | null;
  objects: string | null;
  emotion: string | null;
  timeOfDay: string | null;
}

const TIME_PATTERNS: [RegExp, string][] = [
  [/\b(sunrise|dawn|early morning|morning)\b/i, "morning"],
  [/\b(sunset|dusk|evening|twilight)\b/i, "evening"],
  [/\b(night|midnight|dark)\b/i, "night"],
  [/\b(noon|midday|afternoon)\b/i, "afternoon"],
];

const EMOTION_PATTERNS: [RegExp, string][] = [
  [/\b(happy|joy|laugh|smile|cheerful|gleeful)\b/i, "joyful"],
  [/\b(sad|cry|tears|sorrow|grief|mourn)\b/i, "sorrowful"],
  [/\b(peaceful|calm|quiet|serene|tranquil)\b/i, "peaceful"],
  [/\b(excited|thrill|adventure|energetic)\b/i, "energetic"],
  [/\b(romantic|love|affection|tender)\b/i, "romantic"],
  [/\b(fearful|scared|afraid|horror|dark)\b/i, "tense"],
];

function extractSemantics(text: string): SemanticAnalysis {
  const lower = text.toLowerCase();

  let timeOfDay: string | null = null;
  for (const [pat, label] of TIME_PATTERNS) {
    if (pat.test(lower)) { timeOfDay = label; break; }
  }

  let emotion: string | null = null;
  for (const [pat, label] of EMOTION_PATTERNS) {
    if (pat.test(lower)) { emotion = label; break; }
  }

  const locationMatch = lower.match(/\b(?:in|at|near|by|inside|outside|on|behind|through)\s+(?:the\s+)?([a-z]+(?:\s+[a-z]+)?)/);
  const location = locationMatch ? locationMatch[1].trim() : null;

  return { subject: null, action: null, location, objects: null, emotion, timeOfDay };
}

// ---------------------------------------------------------------------------
// Image scoring
// ---------------------------------------------------------------------------
interface RawImage {
  id: string;
  url: string;
  thumbnailUrl: string;
  mediumUrl?: string | null;
  photographer: string;
  photographerUrl: string;
  source: string;
  width: number;
  height: number;
  alt: string | null;
  _rank: number;
}

function scoreImage(img: RawImage, orientation: string): number {
  const positionScore = Math.max(5, 100 - img._rank * 7);
  const megapixels = (img.width * img.height) / 1_000_000;
  const sizeBonus = Math.min(15, megapixels * 4);
  const ar = img.width / (img.height || 1);
  let orientBonus = 0;
  if (orientation === "landscape" && ar > 1.2) orientBonus = 10;
  else if (orientation === "portrait" && ar < 0.85) orientBonus = 10;
  else if (orientation === "square" && ar >= 0.85 && ar <= 1.2) orientBonus = 10;
  return Math.min(100, Math.round(positionScore + sizeBonus + orientBonus));
}

// ---------------------------------------------------------------------------
// Debug info type
// ---------------------------------------------------------------------------
interface ProviderDebugInfo {
  provider: string;
  query: string;
  requestUrl: string;
  rawCount: number;
  filteredCount: number;
  executionMs: number;
  error: string | null;
  sampleUrls: string[];
}

// ---------------------------------------------------------------------------
// Google Custom Search (image search)
// ---------------------------------------------------------------------------
interface GoogleCSEItem {
  title: string;
  link: string;
  mime?: string;
  image: {
    contextLink: string;
    height: number;
    width: number;
    byteSize: number;
    thumbnailLink: string;
    thumbnailHeight: number;
    thumbnailWidth: number;
  };
}

interface GoogleCSEResponse {
  items?: GoogleCSEItem[];
  searchInformation?: { totalResults: string };
  error?: { message: string; status: string; code: number };
}

function redactKey(url: string): string {
  return url.replace(/([?&]key=)[^&]*/g, "$1[REDACTED]");
}

async function searchGoogle(
  query: string,
  num: number,
  orientation: string,
  safeSearch: boolean
): Promise<{ images: RawImage[]; debug: ProviderDebugInfo }> {
  const startMs = Date.now();

  if (!GOOGLE_API_KEY || !GOOGLE_CX) {
    return {
      images: [],
      debug: {
        provider: "google",
        query,
        requestUrl: "(not configured — GOOGLE_API_KEY or GOOGLE_CX missing)",
        rawCount: 0,
        filteredCount: 0,
        executionMs: 0,
        error: "Google Custom Search is not configured: GOOGLE_API_KEY and/or GOOGLE_CX environment variable is missing.",
        sampleUrls: [],
      },
    };
  }

  const imgSize =
    orientation === "landscape" ? "xxlarge" :
    orientation === "portrait"  ? "large"   : "large";

  const params = new URLSearchParams({
    key:        GOOGLE_API_KEY,
    cx:         GOOGLE_CX,
    q:          query,
    searchType: "image",
    num:        String(Math.min(num * 2, 10)),
    imgType:    "photo",
    imgSize,
    safe:       safeSearch ? "active" : "off",
    rights:     "cc_publicdomain|cc_attribute|cc_sharealike",
  });

  if (orientation === "landscape") params.set("imgAspectRatio", "wide");
  if (orientation === "portrait")  params.set("imgAspectRatio", "tall");

  const rawUrl = `https://www.googleapis.com/customsearch/v1?${params.toString()}`;
  const redactedUrl = redactKey(rawUrl);

  try {
    const response = await fetch(rawUrl);
    const executionMs = Date.now() - startMs;

    if (!response.ok) {
      let errorMsg: string;
      try {
        const body = (await response.json()) as GoogleCSEResponse;
        errorMsg = body.error?.message
          ? `HTTP ${response.status} — ${body.error.message}`
          : `HTTP ${response.status} ${response.statusText}`;
      } catch {
        errorMsg = `HTTP ${response.status} ${response.statusText}`;
      }

      logger.warn({ status: response.status, errorMsg }, "Google CSE returned error");
      return {
        images: [],
        debug: {
          provider: "google",
          query,
          requestUrl: redactedUrl,
          rawCount: 0,
          filteredCount: 0,
          executionMs,
          error: errorMsg,
          sampleUrls: [],
        },
      };
    }

    const data = (await response.json()) as GoogleCSEResponse;
    const items = data.items ?? [];
    const images: RawImage[] = items.map((item, idx) => ({
      id:              `google_${idx}_${encodeURIComponent(item.link).slice(0, 20)}`,
      url:             item.link,
      thumbnailUrl:    item.image.thumbnailLink,
      mediumUrl:       item.link,
      photographer:    (() => { try { return new URL(item.image.contextLink).hostname.replace("www.", ""); } catch { return item.image.contextLink; } })(),
      photographerUrl: item.image.contextLink,
      source:          "google",
      width:           item.image.width  || 1280,
      height:          item.image.height || 720,
      alt:             item.title ?? null,
      _rank:           idx,
    }));

    return {
      images,
      debug: {
        provider: "google",
        query,
        requestUrl: redactedUrl,
        rawCount: images.length,
        filteredCount: images.length,
        executionMs,
        error: null,
        sampleUrls: images.slice(0, 10).map((img) => img.url),
      },
    };
  } catch (err) {
    const executionMs = Date.now() - startMs;
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.warn({ err }, "Google CSE search failed");
    return {
      images: [],
      debug: {
        provider: "google",
        query,
        requestUrl: redactedUrl,
        rawCount: 0,
        filteredCount: 0,
        executionMs,
        error: `Network/fetch error: ${errorMsg}`,
        sampleUrls: [],
      },
    };
  }
}

// ---------------------------------------------------------------------------
// Pexels search
// ---------------------------------------------------------------------------
interface PexelsPhoto {
  id: number;
  width: number;
  height: number;
  url: string;
  photographer: string;
  photographer_url: string;
  alt: string;
  src: {
    original: string;
    large2x: string;
    large: string;
    medium: string;
    small: string;
  };
}

interface PexelsResponse {
  total_results: number;
  photos: PexelsPhoto[];
}

async function searchPexels(
  query: string,
  num: number,
  orientation: string,
  safeSearch: boolean
): Promise<{ images: RawImage[]; debug: ProviderDebugInfo }> {
  const startMs = Date.now();

  if (!PEXELS_API_KEY) {
    return {
      images: [],
      debug: {
        provider: "pexels",
        query,
        requestUrl: "(not configured — PEXELS_API_KEY missing)",
        rawCount: 0,
        filteredCount: 0,
        executionMs: 0,
        error: "Pexels is not configured: PEXELS_API_KEY environment variable is missing.",
        sampleUrls: [],
      },
    };
  }

  const params = new URLSearchParams({
    query,
    per_page: String(Math.min(num * 2, 15)),
    orientation,
    size: "large",
  });
  const url = `https://api.pexels.com/v1/search?${params.toString()}`;

  try {
    const response = await fetch(url, {
      headers: { Authorization: PEXELS_API_KEY },
    });
    const executionMs = Date.now() - startMs;

    if (!response.ok) {
      const errorMsg = `HTTP ${response.status} ${response.statusText}`;
      logger.warn({ status: response.status }, "Pexels API returned error");
      return {
        images: [],
        debug: {
          provider: "pexels",
          query,
          requestUrl: url,
          rawCount: 0,
          filteredCount: 0,
          executionMs,
          error: errorMsg,
          sampleUrls: [],
        },
      };
    }

    const data = (await response.json()) as PexelsResponse;
    const images: RawImage[] = (data.photos ?? []).map((photo, idx) => ({
      id:              String(photo.id),
      url:             photo.src.original,
      thumbnailUrl:    photo.src.medium,
      mediumUrl:       photo.src.large,
      photographer:    photo.photographer,
      photographerUrl: photo.photographer_url,
      source:          "pexels",
      width:           photo.width,
      height:          photo.height,
      alt:             photo.alt ?? null,
      _rank:           idx,
    }));

    return {
      images,
      debug: {
        provider: "pexels",
        query,
        requestUrl: url,
        rawCount: images.length,
        filteredCount: images.length,
        executionMs,
        error: null,
        sampleUrls: images.slice(0, 10).map((img) => img.url),
      },
    };
  } catch (err) {
    const executionMs = Date.now() - startMs;
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.warn({ err }, "Pexels search failed");
    return {
      images: [],
      debug: {
        provider: "pexels",
        query,
        requestUrl: url,
        rawCount: 0,
        filteredCount: 0,
        executionMs,
        error: `Network/fetch error: ${errorMsg}`,
        sampleUrls: [],
      },
    };
  }
}

// ---------------------------------------------------------------------------
// Unsplash search
// ---------------------------------------------------------------------------
interface UnsplashPhoto {
  id: string;
  width: number;
  height: number;
  urls: { raw: string; full: string; regular: string; small: string; thumb: string };
  links: { html: string };
  user: { name: string; links: { html: string } };
  alt_description: string | null;
}

interface UnsplashResponse {
  total: number;
  results: UnsplashPhoto[];
}

async function searchUnsplash(
  query: string,
  num: number,
  orientation: string,
  _safeSearch: boolean
): Promise<{ images: RawImage[]; debug: ProviderDebugInfo }> {
  const startMs = Date.now();

  if (!UNSPLASH_ACCESS_KEY) {
    return {
      images: [],
      debug: {
        provider: "unsplash",
        query,
        requestUrl: "(not configured — UNSPLASH_ACCESS_KEY missing)",
        rawCount: 0,
        filteredCount: 0,
        executionMs: 0,
        error: "Unsplash is not configured: UNSPLASH_ACCESS_KEY environment variable is missing.",
        sampleUrls: [],
      },
    };
  }

  const unsplashOrientation =
    orientation === "landscape" ? "landscape" :
    orientation === "portrait"  ? "portrait"  : "squarish";

  const params = new URLSearchParams({
    query,
    per_page: String(Math.min(num * 2, 15)),
    orientation: unsplashOrientation,
  });
  const url = `https://api.unsplash.com/search/photos?${params.toString()}`;

  try {
    const response = await fetch(url, {
      headers: { Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}` },
    });
    const executionMs = Date.now() - startMs;

    if (!response.ok) {
      let errorMsg = `HTTP ${response.status} ${response.statusText}`;
      try {
        const body = (await response.json()) as { errors?: string[] };
        if (body.errors?.length) errorMsg = `HTTP ${response.status} — ${body.errors.join(", ")}`;
      } catch {
        // ignore parse errors, keep default message
      }
      logger.warn({ status: response.status }, "Unsplash API returned error");
      return {
        images: [],
        debug: {
          provider: "unsplash",
          query,
          requestUrl: url,
          rawCount: 0,
          filteredCount: 0,
          executionMs,
          error: errorMsg,
          sampleUrls: [],
        },
      };
    }

    const data = (await response.json()) as UnsplashResponse;
    const images: RawImage[] = (data.results ?? []).map((photo, idx) => ({
      id:              photo.id,
      url:             photo.urls.full,
      thumbnailUrl:    photo.urls.small,
      mediumUrl:       photo.urls.regular,
      photographer:    photo.user.name,
      photographerUrl: photo.user.links.html,
      source:          "unsplash",
      width:           photo.width,
      height:          photo.height,
      alt:             photo.alt_description ?? null,
      _rank:           idx,
    }));

    return {
      images,
      debug: {
        provider: "unsplash",
        query,
        requestUrl: url,
        rawCount: images.length,
        filteredCount: images.length,
        executionMs,
        error: null,
        sampleUrls: images.slice(0, 10).map((img) => img.url),
      },
    };
  } catch (err) {
    const executionMs = Date.now() - startMs;
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.warn({ err }, "Unsplash search failed");
    return {
      images: [],
      debug: {
        provider: "unsplash",
        query,
        requestUrl: url,
        rawCount: 0,
        filteredCount: 0,
        executionMs,
        error: `Network/fetch error: ${errorMsg}`,
        sampleUrls: [],
      },
    };
  }
}

// ---------------------------------------------------------------------------
// Pixabay search
// ---------------------------------------------------------------------------
interface PixabayHit {
  id: number;
  pageURL: string;
  largeImageURL: string;
  webformatURL: string;
  previewURL: string;
  imageWidth: number;
  imageHeight: number;
  user: string;
  tags: string;
}

interface PixabayResponse {
  totalHits: number;
  hits: PixabayHit[];
}

async function searchPixabay(
  query: string,
  num: number,
  orientation: string,
  safeSearch: boolean
): Promise<{ images: RawImage[]; debug: ProviderDebugInfo }> {
  const startMs = Date.now();

  if (!PIXABAY_API_KEY) {
    return {
      images: [],
      debug: {
        provider: "pixabay",
        query,
        requestUrl: "(not configured — PIXABAY_API_KEY missing)",
        rawCount: 0,
        filteredCount: 0,
        executionMs: 0,
        error: "Pixabay is not configured: PIXABAY_API_KEY environment variable is missing.",
        sampleUrls: [],
      },
    };
  }

  const pixabayOrientation = orientation === "portrait" ? "vertical" : "horizontal";

  const params = new URLSearchParams({
    key: PIXABAY_API_KEY,
    q: query,
    image_type: "photo",
    orientation: pixabayOrientation,
    safesearch: safeSearch ? "true" : "false",
    per_page: String(Math.min(Math.max(num * 2, 3), 20)),
  });
  const rawUrl = `https://pixabay.com/api/?${params.toString()}`;
  const redactedUrl = rawUrl.replace(/([?&]key=)[^&]*/g, "$1[REDACTED]");

  try {
    const response = await fetch(rawUrl);
    const executionMs = Date.now() - startMs;

    if (!response.ok) {
      const errorMsg = `HTTP ${response.status} ${response.statusText}`;
      logger.warn({ status: response.status }, "Pixabay API returned error");
      return {
        images: [],
        debug: {
          provider: "pixabay",
          query,
          requestUrl: redactedUrl,
          rawCount: 0,
          filteredCount: 0,
          executionMs,
          error: errorMsg,
          sampleUrls: [],
        },
      };
    }

    const data = (await response.json()) as PixabayResponse;
    const images: RawImage[] = (data.hits ?? []).map((hit, idx) => ({
      id:              String(hit.id),
      url:             hit.largeImageURL,
      thumbnailUrl:    hit.previewURL,
      mediumUrl:       hit.webformatURL,
      photographer:    hit.user,
      photographerUrl: hit.pageURL,
      source:          "pixabay",
      width:           hit.imageWidth,
      height:          hit.imageHeight,
      alt:             hit.tags ?? null,
      _rank:           idx,
    }));

    return {
      images,
      debug: {
        provider: "pixabay",
        query,
        requestUrl: redactedUrl,
        rawCount: images.length,
        filteredCount: images.length,
        executionMs,
        error: null,
        sampleUrls: images.slice(0, 10).map((img) => img.url),
      },
    };
  } catch (err) {
    const executionMs = Date.now() - startMs;
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.warn({ err }, "Pixabay search failed");
    return {
      images: [],
      debug: {
        provider: "pixabay",
        query,
        requestUrl: redactedUrl,
        rawCount: 0,
        filteredCount: 0,
        executionMs,
        error: `Network/fetch error: ${errorMsg}`,
        sampleUrls: [],
      },
    };
  }
}

// ---------------------------------------------------------------------------
// Wikimedia Commons search (no API key required)
// ---------------------------------------------------------------------------
interface WikimediaImageInfo {
  url: string;
  width: number;
  height: number;
  mime: string;
  thumburl?: string;
  extmetadata?: {
    Artist?: { value: string };
    LicenseShortName?: { value: string };
  };
}

interface WikimediaPage {
  pageid: number;
  title: string;
  imageinfo?: WikimediaImageInfo[];
}

interface WikimediaResponse {
  query?: { pages?: Record<string, WikimediaPage> };
  error?: { code: string; info: string };
}

const REJECTED_TITLE_PATTERN = /logo|icon|flag|map|symbol|coat_of_arms|seal_of|emblem|diagram|chart|graph/i;
const MIN_DIMENSION = 500;

async function searchWikimedia(
  query: string,
  num: number,
  orientation: string,
  _safeSearch: boolean
): Promise<{ images: RawImage[]; debug: ProviderDebugInfo }> {
  const startMs = Date.now();

  const searchLimit = Math.min(Math.max(num * 3, 10), 30);
  const params = new URLSearchParams({
    action: "query",
    generator: "search",
    gsrnamespace: "6",
    gsrsearch: `filetype:bitmap ${query}`,
    gsrlimit: String(searchLimit),
    prop: "imageinfo",
    iiprop: "url|size|mime|extmetadata",
    iiurlwidth: "800",
    format: "json",
    origin: "*",
  });
  const url = `https://commons.wikimedia.org/w/api.php?${params.toString()}`;

  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "ScriptToImageFinder/1.0 (Replit app)" },
    });
    const executionMs = Date.now() - startMs;

    if (!response.ok) {
      const errorMsg = `HTTP ${response.status} ${response.statusText}`;
      logger.warn({ status: response.status }, "Wikimedia Commons API returned error");
      return {
        images: [],
        debug: {
          provider: "wikimedia",
          query,
          requestUrl: url,
          rawCount: 0,
          filteredCount: 0,
          executionMs,
          error: errorMsg,
          sampleUrls: [],
        },
      };
    }

    const data = (await response.json()) as WikimediaResponse;

    if (data.error) {
      return {
        images: [],
        debug: {
          provider: "wikimedia",
          query,
          requestUrl: url,
          rawCount: 0,
          filteredCount: 0,
          executionMs,
          error: `${data.error.code}: ${data.error.info}`,
          sampleUrls: [],
        },
      };
    }

    const pages = Object.values(data.query?.pages ?? {});
    const rawCount = pages.length;

    const filtered = pages.filter((page) => {
      const info = page.imageinfo?.[0];
      if (!info) return false;
      if (info.mime !== "image/jpeg" && info.mime !== "image/png") return false;
      if (info.width < MIN_DIMENSION || info.height < MIN_DIMENSION) return false;
      if (REJECTED_TITLE_PATTERN.test(page.title)) return false;
      return true;
    });

    const images: RawImage[] = filtered.map((page, idx) => {
      const info = page.imageinfo![0];
      const cleanTitle = page.title.replace(/^File:/, "").replace(/\.[a-zA-Z]+$/, "");
      return {
        id:              `wikimedia_${page.pageid}`,
        url:             info.url,
        thumbnailUrl:    info.thumburl ?? info.url,
        mediumUrl:       info.thumburl ?? info.url,
        photographer:    info.extmetadata?.Artist?.value?.replace(/<[^>]+>/g, "").trim() || "Wikimedia Commons",
        photographerUrl: `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title)}`,
        source:          "wikimedia",
        width:           info.width,
        height:          info.height,
        alt:             cleanTitle,
        _rank:           idx,
      };
    });

    return {
      images,
      debug: {
        provider: "wikimedia",
        query,
        requestUrl: url,
        rawCount,
        filteredCount: images.length,
        executionMs,
        error: null,
        sampleUrls: images.slice(0, 10).map((img) => img.url),
      },
    };
  } catch (err) {
    const executionMs = Date.now() - startMs;
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.warn({ err }, "Wikimedia Commons search failed");
    return {
      images: [],
      debug: {
        provider: "wikimedia",
        query,
        requestUrl: url,
        rawCount: 0,
        filteredCount: 0,
        executionMs,
        error: `Network/fetch error: ${errorMsg}`,
        sampleUrls: [],
      },
    };
  }
}

// ---------------------------------------------------------------------------
// Multi-provider search + merge
// ---------------------------------------------------------------------------
type ProviderPref = "auto" | "google" | "wikimedia" | "unsplash" | "pixabay" | "pexels";

// Priority order used to break score ties in "auto" mode:
// 1. Google  2. Wikimedia Commons  3. Unsplash  4. Pixabay  5. Pexels
const PROVIDER_PRIORITY: Record<string, number> = {
  google: 0,
  wikimedia: 1,
  unsplash: 2,
  pixabay: 3,
  pexels: 4,
};

async function searchAllProviders(
  query: string,
  perPage: number,
  orientation: string,
  safeSearch: boolean,
  providerPref: ProviderPref
): Promise<{
  images: (RawImage & { score: number })[];
  primaryProvider: string;
  providerDebug: ProviderDebugInfo[];
}> {
  const shouldAttempt = (name: ProviderPref) => providerPref === name || providerPref === "auto";

  // Run every configured provider in parallel — continue even if one fails.
  const [googleResult, wikimediaResult, unsplashResult, pixabayResult, pexelsResult] = await Promise.all([
    shouldAttempt("google")
      ? searchGoogle(query, perPage, orientation, safeSearch)
      : Promise.resolve<{ images: RawImage[]; debug: ProviderDebugInfo } | null>(null),
    shouldAttempt("wikimedia")
      ? searchWikimedia(query, perPage, orientation, safeSearch)
      : Promise.resolve<{ images: RawImage[]; debug: ProviderDebugInfo } | null>(null),
    shouldAttempt("unsplash")
      ? searchUnsplash(query, perPage, orientation, safeSearch)
      : Promise.resolve<{ images: RawImage[]; debug: ProviderDebugInfo } | null>(null),
    shouldAttempt("pixabay")
      ? searchPixabay(query, perPage, orientation, safeSearch)
      : Promise.resolve<{ images: RawImage[]; debug: ProviderDebugInfo } | null>(null),
    shouldAttempt("pexels")
      ? searchPexels(query, perPage, orientation, safeSearch)
      : Promise.resolve<{ images: RawImage[]; debug: ProviderDebugInfo } | null>(null),
  ]);

  const results = [
    { name: "google", result: googleResult },
    { name: "wikimedia", result: wikimediaResult },
    { name: "unsplash", result: unsplashResult },
    { name: "pixabay", result: pixabayResult },
    { name: "pexels", result: pexelsResult },
  ];

  const debugList: ProviderDebugInfo[] = [];
  for (const { result } of results) {
    if (result) debugList.push(result.debug);
  }

  let merged: (RawImage & { score: number })[];

  if (providerPref === "auto") {
    // Merge all providers, score for relevance, then break ties using the
    // fixed priority order (Google > Unsplash > Pixabay > Pexels).
    const allScored = results.flatMap(({ result }) =>
      (result?.images ?? []).map((img) => ({ ...img, score: scoreImage(img, orientation) }))
    );
    merged = allScored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (PROVIDER_PRIORITY[a.source] ?? 99) - (PROVIDER_PRIORITY[b.source] ?? 99);
    });
  } else {
    // Single-provider mode — no silent fallback, use only that provider's results.
    const chosen = results.find(({ name }) => name === providerPref)?.result;
    merged = (chosen?.images ?? []).map((img) => ({ ...img, score: scoreImage(img, orientation) }));
  }

  const seen = new Set<string>();
  const deduped = merged.filter((img) => {
    if (seen.has(img.url)) return false;
    seen.add(img.url);
    return true;
  });

  const final = deduped.slice(0, perPage);

  // Update filteredCount in debug to reflect post-dedup/slice counts
  for (const dbg of debugList) {
    const fromThisProvider = final.filter((img) => img.source === dbg.provider);
    dbg.filteredCount = fromThisProvider.length;
  }

  const activeSources = new Set(final.map((img) => img.source));
  const primaryProvider =
    activeSources.size > 1 ? "multi" :
    activeSources.size === 1 ? [...activeSources][0] :
    "unknown";

  return { images: final, primaryProvider, providerDebug: debugList };
}

// ---------------------------------------------------------------------------
// Available providers
// ---------------------------------------------------------------------------
function getAvailableProviders(): string[] {
  const providers: string[] = ["auto"];
  if (GOOGLE_API_KEY && GOOGLE_CX) providers.push("google");
  providers.push("wikimedia");
  if (UNSPLASH_ACCESS_KEY) providers.push("unsplash");
  if (PIXABAY_API_KEY) providers.push("pixabay");
  if (PEXELS_API_KEY) providers.push("pexels");
  return providers;
}

// ---------------------------------------------------------------------------
// Route: POST /images/search
// ---------------------------------------------------------------------------
router.post("/images/search", async (req, res): Promise<void> => {
  const parsed = SearchImagesBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const {
    lineNumber,
    lineText,
    provider = "auto",
    perPage = 4,
    orientation = "landscape",
    safeSearch = true,
  } = parsed.data;

  if (!lineText || !lineText.trim()) {
    res.status(400).json({ error: "Empty line text" });
    return;
  }

  const cacheKey = getCacheKey(lineText, perPage, orientation, provider);
  const cached = getFromCache(cacheKey);
  if (cached) {
    res.json(cached);
    return;
  }

  const lang = detectLanguage(lineText);

  let translatedText: string | null = null;
  let englishBase: string = lineText;

  if (lang.code !== "en") {
    translatedText = await translateToEnglish(lineText);
    if (translatedText) {
      englishBase = translatedText;
    }
  }

  const englishQuery = buildSearchQuery(englishBase);

  if (!englishQuery) {
    res.status(400).json({ error: "Could not generate a search query from the provided text" });
    return;
  }

  const semantics = extractSemantics(englishBase);

  const providerPref: ProviderPref =
    provider === "google" || provider === "wikimedia" || provider === "unsplash" || provider === "pixabay" || provider === "pexels"
      ? provider
      : "auto";

  try {
    const { images, primaryProvider, providerDebug } = await searchAllProviders(
      englishQuery,
      perPage,
      orientation,
      safeSearch,
      providerPref
    );

    const analysis = {
      detectedLanguage:     lang.code,
      detectedLanguageName: lang.name,
      translatedText:       translatedText,
      englishQuery,
      subject:   semantics.subject,
      action:    semantics.action,
      location:  semantics.location,
      objects:   semantics.objects,
      emotion:   semantics.emotion,
      timeOfDay: semantics.timeOfDay,
    };

    const responseBody = {
      lineNumber,
      lineText,
      query:        englishQuery,
      images:       images.map(({ _rank: _r, ...rest }) => rest),
      provider:     primaryProvider,
      totalResults: images.length,
      analysis,
      providerDebug,
    };

    const response = SearchImagesResponse.parse(responseBody);
    setCache(cacheKey, response);
    res.json(response);
  } catch (err) {
    req.log.error({ err, lineText }, "Image search pipeline failed");
    const message = err instanceof Error ? err.message : "Image search failed";
    res.status(500).json({ error: message });
  }
});

// ---------------------------------------------------------------------------
// Route: GET /images/settings
// ---------------------------------------------------------------------------
router.get("/images/settings", async (_req, res): Promise<void> => {
  const availableProviders = getAvailableProviders();
  const response = GetImageSettingsResponse.parse({
    availableProviders,
    defaultProvider: "auto",
    maxPerPage: 8,
  });
  res.json(response);
});

export default router;
