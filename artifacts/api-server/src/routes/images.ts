import { Router, type IRouter } from "express";
import { SearchImagesBody, SearchImagesResponse, GetImageSettingsResponse } from "@workspace/api-zod";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const PEXELS_API_KEY = process.env.PEXELS_API_KEY;
const UNSPLASH_ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY;

function getAvailableProviders(): string[] {
  const providers: string[] = [];
  if (PEXELS_API_KEY) providers.push("pexels");
  if (UNSPLASH_ACCESS_KEY) providers.push("unsplash");
  return providers;
}

function getDefaultProvider(): string {
  const available = getAvailableProviders();
  return available[0] ?? "pexels";
}

function cleanQuery(text: string): string {
  return text
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

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
    portrait: string;
    landscape: string;
    tiny: string;
  };
}

interface PexelsResponse {
  total_results: number;
  page: number;
  per_page: number;
  photos: PexelsPhoto[];
}

async function searchPexels(
  query: string,
  perPage: number,
  orientation: string,
  safeSearch: boolean
): Promise<{ images: ReturnType<typeof mapPexelsPhoto>[]; totalResults: number }> {
  if (!PEXELS_API_KEY) {
    throw new Error("Pexels API key not configured");
  }

  const params = new URLSearchParams({
    query,
    per_page: String(perPage),
    orientation,
    size: "large",
  });

  const url = `https://api.pexels.com/v1/search?${params.toString()}`;
  const response = await fetch(url, {
    headers: {
      Authorization: PEXELS_API_KEY,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    logger.error({ status: response.status, body: text }, "Pexels API error");
    throw new Error(`Pexels API error: ${response.status}`);
  }

  const data = (await response.json()) as PexelsResponse;

  return {
    images: (data.photos ?? []).map(mapPexelsPhoto),
    totalResults: data.total_results ?? 0,
  };
}

function mapPexelsPhoto(photo: PexelsPhoto) {
  return {
    id: String(photo.id),
    url: photo.src.original,
    thumbnailUrl: photo.src.medium,
    mediumUrl: photo.src.large,
    photographer: photo.photographer,
    photographerUrl: photo.photographer_url,
    source: "pexels",
    width: photo.width,
    height: photo.height,
    alt: photo.alt ?? null,
  };
}

interface UnsplashPhoto {
  id: string;
  width: number;
  height: number;
  alt_description: string | null;
  user: {
    name: string;
    links: { html: string };
  };
  urls: {
    full: string;
    regular: string;
    small: string;
    thumb: string;
  };
  links: {
    html: string;
    download: string;
  };
}

interface UnsplashSearchResponse {
  total: number;
  results: UnsplashPhoto[];
}

async function searchUnsplash(
  query: string,
  perPage: number,
  orientation: string,
  _safeSearch: boolean
): Promise<{ images: ReturnType<typeof mapUnsplashPhoto>[]; totalResults: number }> {
  if (!UNSPLASH_ACCESS_KEY) {
    throw new Error("Unsplash API key not configured");
  }

  const params = new URLSearchParams({
    query,
    per_page: String(perPage),
    orientation,
    content_filter: "high",
  });

  const url = `https://api.unsplash.com/search/photos?${params.toString()}`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}`,
      "Accept-Version": "v1",
    },
  });

  if (!response.ok) {
    const text = await response.text();
    logger.error({ status: response.status, body: text }, "Unsplash API error");
    throw new Error(`Unsplash API error: ${response.status}`);
  }

  const data = (await response.json()) as UnsplashSearchResponse;

  return {
    images: (data.results ?? []).map(mapUnsplashPhoto),
    totalResults: data.total ?? 0,
  };
}

function mapUnsplashPhoto(photo: UnsplashPhoto) {
  return {
    id: photo.id,
    url: photo.urls.full,
    thumbnailUrl: photo.urls.small,
    mediumUrl: photo.urls.regular,
    photographer: photo.user.name,
    photographerUrl: photo.user.links.html,
    source: "unsplash",
    width: photo.width,
    height: photo.height,
    alt: photo.alt_description ?? null,
  };
}

router.post("/images/search", async (req, res): Promise<void> => {
  const parsed = SearchImagesBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const {
    query: rawQuery,
    lineNumber,
    lineText,
    provider = "pexels",
    perPage = 4,
    orientation = "landscape",
    safeSearch = true,
  } = parsed.data;

  const query = cleanQuery(rawQuery || lineText);
  if (!query) {
    res.status(400).json({ error: "Empty query" });
    return;
  }

  const availableProviders = getAvailableProviders();
  const resolvedProvider = availableProviders.includes(provider)
    ? provider
    : getDefaultProvider();

  if (!resolvedProvider) {
    res.status(500).json({ error: "No image providers configured. Please add PEXELS_API_KEY or UNSPLASH_ACCESS_KEY." });
    return;
  }

  try {
    let result: { images: unknown[]; totalResults: number };

    if (resolvedProvider === "pexels") {
      result = await searchPexels(query, perPage, orientation, safeSearch);
    } else if (resolvedProvider === "unsplash") {
      result = await searchUnsplash(query, perPage, orientation, safeSearch);
    } else {
      res.status(400).json({ error: `Unknown provider: ${resolvedProvider}` });
      return;
    }

    const response = SearchImagesResponse.parse({
      lineNumber,
      lineText,
      query,
      images: result.images,
      provider: resolvedProvider,
      totalResults: result.totalResults,
    });

    res.json(response);
  } catch (err) {
    req.log.error({ err, query, provider: resolvedProvider }, "Image search failed");
    const message = err instanceof Error ? err.message : "Image search failed";
    res.status(500).json({ error: message });
  }
});

router.get("/images/settings", async (_req, res): Promise<void> => {
  const availableProviders = getAvailableProviders();
  const response = GetImageSettingsResponse.parse({
    availableProviders,
    defaultProvider: getDefaultProvider(),
    maxPerPage: 8,
  });
  res.json(response);
});

export default router;
