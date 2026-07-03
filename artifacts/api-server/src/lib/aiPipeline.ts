import { logger } from "./logger";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

const GEMINI_MODEL = "gemini-2.0-flash";
const OPENROUTER_MODEL = "openai/gpt-4o-mini";

export type AIProviderName = "gemini" | "openrouter" | "none";

export interface AICallResult<T> {
  success: boolean;
  provider: AIProviderName;
  model: string | null;
  executionMs: number;
  error: string | null;
  data: T | null;
}

// ---------------------------------------------------------------------------
// Low-level text generation calls
// ---------------------------------------------------------------------------
async function callGeminiText(prompt: string): Promise<{ text: string; error: null } | { text: null; error: string }> {
  if (!GEMINI_API_KEY) return { text: null, error: "GEMINI_API_KEY is not configured" };
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.4 },
      }),
    });
    if (!response.ok) {
      let msg = `HTTP ${response.status}`;
      try {
        const body = (await response.json()) as { error?: { message?: string } };
        if (body.error?.message) msg = `HTTP ${response.status} — ${body.error.message}`;
      } catch {
        // ignore
      }
      return { text: null, error: msg };
    }
    const data = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
    if (!text) return { text: null, error: "Gemini returned an empty response" };
    return { text, error: null };
  } catch (err) {
    return { text: null, error: `Network/fetch error: ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function callOpenRouterText(prompt: string): Promise<{ text: string; error: null } | { text: null; error: string }> {
  if (!OPENROUTER_API_KEY) return { text: null, error: "OPENROUTER_API_KEY is not configured" };
  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.4,
      }),
    });
    if (!response.ok) {
      let msg = `HTTP ${response.status}`;
      try {
        const body = (await response.json()) as { error?: { message?: string } };
        if (body.error?.message) msg = `HTTP ${response.status} — ${body.error.message}`;
      } catch {
        // ignore
      }
      return { text: null, error: msg };
    }
    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = data.choices?.[0]?.message?.content ?? null;
    if (!text) return { text: null, error: "OpenRouter returned an empty response" };
    return { text, error: null };
  } catch (err) {
    return { text: null, error: `Network/fetch error: ${err instanceof Error ? err.message : String(err)}` };
  }
}

// ---------------------------------------------------------------------------
// Low-level vision calls
// ---------------------------------------------------------------------------
async function fetchImageAsBase64(imageUrl: string): Promise<{ data: string; mimeType: string } | null> {
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) return null;
    const mimeType = response.headers.get("content-type") || "image/jpeg";
    const arrayBuffer = await response.arrayBuffer();
    const data = Buffer.from(arrayBuffer).toString("base64");
    return { data, mimeType };
  } catch {
    return null;
  }
}

async function callGeminiVision(prompt: string, imageUrl: string): Promise<{ text: string; error: null } | { text: null; error: string }> {
  if (!GEMINI_API_KEY) return { text: null, error: "GEMINI_API_KEY is not configured" };
  const img = await fetchImageAsBase64(imageUrl);
  if (!img) return { text: null, error: "Failed to download image for verification" };
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              { inline_data: { mime_type: img.mimeType, data: img.data } },
            ],
          },
        ],
        generationConfig: { temperature: 0.2 },
      }),
    });
    if (!response.ok) {
      let msg = `HTTP ${response.status}`;
      try {
        const body = (await response.json()) as { error?: { message?: string } };
        if (body.error?.message) msg = `HTTP ${response.status} — ${body.error.message}`;
      } catch {
        // ignore
      }
      return { text: null, error: msg };
    }
    const data = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
    if (!text) return { text: null, error: "Gemini vision returned an empty response" };
    return { text, error: null };
  } catch (err) {
    return { text: null, error: `Network/fetch error: ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function callOpenRouterVision(prompt: string, imageUrl: string): Promise<{ text: string; error: null } | { text: null; error: string }> {
  if (!OPENROUTER_API_KEY) return { text: null, error: "OPENROUTER_API_KEY is not configured" };
  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: imageUrl } },
            ],
          },
        ],
        temperature: 0.2,
      }),
    });
    if (!response.ok) {
      let msg = `HTTP ${response.status}`;
      try {
        const body = (await response.json()) as { error?: { message?: string } };
        if (body.error?.message) msg = `HTTP ${response.status} — ${body.error.message}`;
      } catch {
        // ignore
      }
      return { text: null, error: msg };
    }
    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = data.choices?.[0]?.message?.content ?? null;
    if (!text) return { text: null, error: "OpenRouter vision returned an empty response" };
    return { text, error: null };
  } catch (err) {
    return { text: null, error: `Network/fetch error: ${err instanceof Error ? err.message : String(err)}` };
  }
}

// ---------------------------------------------------------------------------
// JSON extraction helper
// ---------------------------------------------------------------------------
function extractJson<T>(raw: string): T | null {
  let cleaned = raw.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1) return null;
  cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Script line analysis (text → context + optimized search queries)
// ---------------------------------------------------------------------------
export interface ScriptLineContext {
  country: string | null;
  city: string | null;
  religion: string | null;
  culture: string | null;
  language: string | null;
  timePeriod: string | null;
  environment: string | null;
  people: string | null;
  objects: string | null;
  eventType: string | null;
  emotion: string | null;
  queries: string[];
}

function buildAnalysisPrompt(lineText: string): string {
  return `You are a script-to-image search assistant for a video storyboard tool. Analyze the following script line (it may be in any language, including Hindi).

Script line: "${lineText}"

Tasks:
1. Detect these attributes from the line (use null if not determinable from the text):
   - country
   - city
   - religion
   - culture
   - language (name of the language the line is written in)
   - timePeriod (e.g. "ancient", "modern", "medieval", specific era if mentioned)
   - environment (e.g. "rural village", "urban city", "indoor classroom", "farm field")
   - people (description of any people mentioned, e.g. "poor village boy", "farmer", "devotees")
   - objects (key physical objects/items mentioned)
   - eventType (e.g. "religious ceremony", "prayer", "festival", "daily life", "education")
   - emotion (mood/emotion conveyed, e.g. "devotional", "joyful", "hardship")
2. IMPORTANT CONTEXT RULE: if the script line is in Hindi (or otherwise culturally ambiguous) and no country is explicitly mentioned, assume the country is "India" by default, and infer culture/religion accordingly when contextually implied (e.g. a temple implies Hindu unless stated otherwise).
3. Generate 3 to 5 optimized ENGLISH image-search queries suitable for stock photo APIs (Unsplash, Pexels, Pixabay, Wikimedia, Google Images) that would find REAL, contextually accurate photographs matching this exact scene. Never translate literally word-for-word — describe the real-world scene, and add country/location/culture keywords when appropriate (e.g. "India", "Uttar Pradesh", "Ayodhya", "Hindu temple", "Indian village").

Example:
Input: "राम मंदिर में श्रद्धालु पूजा कर रहे हैं।"
Output queries:
- "Ayodhya Ram Mandir devotees praying"
- "Hindu devotees worship inside Ram Mandir"
- "Ram Mandir Ayodhya temple prayer ceremony"
- "Indian Hindu temple worship real photo"
- "Ram Mandir interior real photo"

Respond with ONLY strict JSON (no markdown fences, no commentary), in exactly this shape:
{
  "country": string|null,
  "city": string|null,
  "religion": string|null,
  "culture": string|null,
  "language": string|null,
  "timePeriod": string|null,
  "environment": string|null,
  "people": string|null,
  "objects": string|null,
  "eventType": string|null,
  "emotion": string|null,
  "queries": string[]
}`;
}

export async function analyzeScriptLineAI(lineText: string): Promise<AICallResult<ScriptLineContext>> {
  const prompt = buildAnalysisPrompt(lineText);

  // Priority 1: Gemini
  const geminiStart = Date.now();
  const geminiRes = await callGeminiText(prompt);
  const geminiMs = Date.now() - geminiStart;
  if (geminiRes.text) {
    const parsed = extractJson<ScriptLineContext>(geminiRes.text);
    if (parsed && Array.isArray(parsed.queries) && parsed.queries.length > 0) {
      return { success: true, provider: "gemini", model: GEMINI_MODEL, executionMs: geminiMs, error: null, data: parsed };
    }
    logger.warn({ raw: geminiRes.text.slice(0, 200) }, "Gemini analysis returned unparsable JSON — falling back to OpenRouter");
  } else {
    logger.warn({ error: geminiRes.error }, "Gemini script analysis failed — falling back to OpenRouter");
  }

  // Priority 2: OpenRouter
  const orStart = Date.now();
  const orRes = await callOpenRouterText(prompt);
  const orMs = Date.now() - orStart;
  if (orRes.text) {
    const parsed = extractJson<ScriptLineContext>(orRes.text);
    if (parsed && Array.isArray(parsed.queries) && parsed.queries.length > 0) {
      return { success: true, provider: "openrouter", model: OPENROUTER_MODEL, executionMs: geminiMs + orMs, error: null, data: parsed };
    }
    return {
      success: false,
      provider: "openrouter",
      model: OPENROUTER_MODEL,
      executionMs: geminiMs + orMs,
      error: "OpenRouter returned unparsable JSON",
      data: null,
    };
  }

  return {
    success: false,
    provider: "none",
    model: null,
    executionMs: geminiMs + orMs,
    error: `Gemini: ${geminiRes.error ?? "unavailable"} | OpenRouter: ${orRes.error ?? "unavailable"}`,
    data: null,
  };
}

// ---------------------------------------------------------------------------
// AI image verification (vision → similarity/context score)
// ---------------------------------------------------------------------------
export interface ImageVerification {
  score: number;
  matches: boolean;
  reason: string;
}

function buildVerificationPrompt(lineText: string, context: Partial<ScriptLineContext> | null): string {
  const ctx = context
    ? `country=${context.country ?? "unspecified"}, religion=${context.religion ?? "unspecified"}, culture=${context.culture ?? "unspecified"}, city/location=${context.city ?? "unspecified"}, people=${context.people ?? "unspecified"}, eventType=${context.eventType ?? "unspecified"}, objects=${context.objects ?? "unspecified"}`
    : "no additional context available";

  return `Compare this image against the following video script scene and reject it if it does not truly match.

Script line: "${lineText}"
Detected context: ${ctx}

Reject the image (low score) if it depicts:
- The wrong country (e.g. a non-Indian scene when India was implied)
- The wrong religion (e.g. a Christian church, Buddhist temple, Japanese/Thai temple when a Hindu Indian temple was expected)
- The wrong culture, landmark, person, event, or object relative to the context above
- Generic/irrelevant stock photography unrelated to the scene

Only give a high score (80-100) if the image's country, religion, culture, people, and objects genuinely match the script line and context.

Respond with ONLY strict JSON (no markdown fences, no commentary), in exactly this shape:
{ "score": number (0-100), "matches": boolean (true only if score >= 80), "reason": string (short explanation, max 20 words) }`;
}

export async function verifyImageWithAI(
  imageUrl: string,
  lineText: string,
  context: Partial<ScriptLineContext> | null
): Promise<AICallResult<ImageVerification>> {
  const prompt = buildVerificationPrompt(lineText, context);

  const geminiStart = Date.now();
  const geminiRes = await callGeminiVision(prompt, imageUrl);
  const geminiMs = Date.now() - geminiStart;
  if (geminiRes.text) {
    const parsed = extractJson<ImageVerification>(geminiRes.text);
    if (parsed && typeof parsed.score === "number") {
      return { success: true, provider: "gemini", model: GEMINI_MODEL, executionMs: geminiMs, error: null, data: parsed };
    }
  } else {
    logger.warn({ error: geminiRes.error }, "Gemini image verification failed — falling back to OpenRouter");
  }

  const orStart = Date.now();
  const orRes = await callOpenRouterVision(prompt, imageUrl);
  const orMs = Date.now() - orStart;
  if (orRes.text) {
    const parsed = extractJson<ImageVerification>(orRes.text);
    if (parsed && typeof parsed.score === "number") {
      return { success: true, provider: "openrouter", model: OPENROUTER_MODEL, executionMs: geminiMs + orMs, error: null, data: parsed };
    }
    return {
      success: false,
      provider: "openrouter",
      model: OPENROUTER_MODEL,
      executionMs: geminiMs + orMs,
      error: "OpenRouter returned unparsable verification JSON",
      data: null,
    };
  }

  return {
    success: false,
    provider: "none",
    model: null,
    executionMs: geminiMs + orMs,
    error: `Gemini: ${geminiRes.error ?? "unavailable"} | OpenRouter: ${orRes.error ?? "unavailable"}`,
    data: null,
  };
}

// ---------------------------------------------------------------------------
// Concurrency-limited pool helper
// ---------------------------------------------------------------------------
export async function runWithConcurrency<T, R>(
  items: T[],
  worker: (item: T, index: number) => Promise<R>,
  concurrency: number
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function runNext(): Promise<void> {
    while (cursor < items.length) {
      const idx = cursor++;
      results[idx] = await worker(items[idx], idx);
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => runNext());
  await Promise.all(workers);
  return results;
}

export function isAIConfigured(): boolean {
  return Boolean(GEMINI_API_KEY || OPENROUTER_API_KEY);
}
