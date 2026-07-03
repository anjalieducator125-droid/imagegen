import { logger } from "./logger";

const NVIDIA_NIM_API_KEY = process.env.NVIDIA_NIM_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

const NVIDIA_NIM_TEXT_MODEL = "meta/llama-3.1-8b-instruct";
const NVIDIA_NIM_VISION_MODEL = "meta/llama-3.2-11b-vision-instruct";
const GEMINI_MODEL = "gemini-2.0-flash";
// FREE OpenRouter models only — never a paid model. Tried in order; if one is
// rate-limited upstream we fall through to the next before giving up on OpenRouter.
const OPENROUTER_FREE_MODELS = [
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
  "google/gemma-4-26b-a4b-it:free",
];

export type AIProviderName = "nvidia_nim" | "gemini" | "openrouter" | "none";

export interface AICallResult<T> {
  success: boolean;
  provider: AIProviderName;
  model: string | null;
  executionMs: number;
  retryCount: number;
  finalFallback: boolean;
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

async function callNvidiaNimText(prompt: string): Promise<{ text: string; error: null } | { text: null; error: string }> {
  if (!NVIDIA_NIM_API_KEY) return { text: null, error: "NVIDIA_NIM_API_KEY is not configured" };
  try {
    const response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${NVIDIA_NIM_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: NVIDIA_NIM_TEXT_MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.4,
        response_format: { type: "json_object" },
      }),
    });
    if (!response.ok) {
      let msg = `HTTP ${response.status}`;
      try {
        const body = (await response.json()) as { error?: { message?: string } | string };
        const errMsg = typeof body.error === "string" ? body.error : body.error?.message;
        if (errMsg) msg = `HTTP ${response.status} — ${errMsg}`;
      } catch {
        // ignore
      }
      return { text: null, error: msg };
    }
    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = data.choices?.[0]?.message?.content ?? null;
    if (!text) return { text: null, error: "NVIDIA NIM returned an empty response" };
    return { text, error: null };
  } catch (err) {
    return { text: null, error: `Network/fetch error: ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function callOpenRouterTextWithModel(prompt: string, model: string): Promise<{ text: string; error: null } | { text: null; error: string }> {
  if (!OPENROUTER_API_KEY) return { text: null, error: "OPENROUTER_API_KEY is not configured" };
  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
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

// Tries each free OpenRouter model in order until one succeeds. Returns the
// model that worked (or the last attempted model on total failure) plus a
// per-model attempt count so callers can report retries accurately.
async function callOpenRouterText(prompt: string): Promise<{ text: string; error: null; model: string; attempts: number } | { text: null; error: string; model: string; attempts: number }> {
  if (!OPENROUTER_API_KEY) return { text: null, error: "OPENROUTER_API_KEY is not configured", model: OPENROUTER_FREE_MODELS[0], attempts: 0 };
  let lastError = "OpenRouter: no free models attempted";
  for (let i = 0; i < OPENROUTER_FREE_MODELS.length; i++) {
    const model = OPENROUTER_FREE_MODELS[i];
    const res = await callOpenRouterTextWithModel(prompt, model);
    if (res.text) return { text: res.text, error: null, model, attempts: i + 1 };
    lastError = res.error ?? "Unknown error";
  }
  return { text: null, error: lastError, model: OPENROUTER_FREE_MODELS[OPENROUTER_FREE_MODELS.length - 1], attempts: OPENROUTER_FREE_MODELS.length };
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

async function callNvidiaNimVision(prompt: string, imageUrl: string): Promise<{ text: string; error: null } | { text: null; error: string }> {
  if (!NVIDIA_NIM_API_KEY) return { text: null, error: "NVIDIA_NIM_API_KEY is not configured" };
  try {
    const response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${NVIDIA_NIM_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: NVIDIA_NIM_VISION_MODEL,
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
        max_tokens: 300,
      }),
    });
    if (!response.ok) {
      let msg = `HTTP ${response.status}`;
      try {
        const body = (await response.json()) as { error?: { message?: string } | string };
        const errMsg = typeof body.error === "string" ? body.error : body.error?.message;
        if (errMsg) msg = `HTTP ${response.status} — ${errMsg}`;
      } catch {
        // ignore
      }
      return { text: null, error: msg };
    }
    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = data.choices?.[0]?.message?.content ?? null;
    if (!text) return { text: null, error: "NVIDIA NIM vision returned an empty response" };
    return { text, error: null };
  } catch (err) {
    return { text: null, error: `Network/fetch error: ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function callOpenRouterVisionWithModel(prompt: string, imageUrl: string, model: string): Promise<{ text: string; error: null } | { text: null; error: string }> {
  if (!OPENROUTER_API_KEY) return { text: null, error: "OPENROUTER_API_KEY is not configured" };
  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
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

// Tries each free OpenRouter model in order until one succeeds (vision variant).
async function callOpenRouterVision(prompt: string, imageUrl: string): Promise<{ text: string; error: null; model: string; attempts: number } | { text: null; error: string; model: string; attempts: number }> {
  if (!OPENROUTER_API_KEY) return { text: null, error: "OPENROUTER_API_KEY is not configured", model: OPENROUTER_FREE_MODELS[0], attempts: 0 };
  let lastError = "OpenRouter: no free models attempted";
  for (let i = 0; i < OPENROUTER_FREE_MODELS.length; i++) {
    const model = OPENROUTER_FREE_MODELS[i];
    const res = await callOpenRouterVisionWithModel(prompt, imageUrl, model);
    if (res.text) return { text: res.text, error: null, model, attempts: i + 1 };
    lastError = res.error ?? "Unknown error";
  }
  return { text: null, error: lastError, model: OPENROUTER_FREE_MODELS[OPENROUTER_FREE_MODELS.length - 1], attempts: OPENROUTER_FREE_MODELS.length };
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

// AI provider priority chain for both script analysis and image verification:
//   1. NVIDIA NIM   2. OpenRouter (free models only)   3. Gemini   4. rule-based fallback (handled by the caller)
// Every provider failure automatically retries the next provider — storyboard
// generation never stops just because one (or all) AI providers are down.
export async function analyzeScriptLineAI(lineText: string): Promise<AICallResult<ScriptLineContext>> {
  const prompt = buildAnalysisPrompt(lineText);
  let retryCount = 0;
  const errors: string[] = [];
  let totalMs = 0;

  // Priority 1: NVIDIA NIM
  const nimStart = Date.now();
  const nimRes = await callNvidiaNimText(prompt);
  totalMs += Date.now() - nimStart;
  retryCount++;
  if (nimRes.text) {
    const parsed = extractJson<ScriptLineContext>(nimRes.text);
    if (parsed && Array.isArray(parsed.queries) && parsed.queries.length > 0) {
      return { success: true, provider: "nvidia_nim", model: NVIDIA_NIM_TEXT_MODEL, executionMs: totalMs, retryCount, finalFallback: false, error: null, data: parsed };
    }
    logger.warn({ raw: nimRes.text.slice(0, 200) }, "NVIDIA NIM analysis returned unparsable JSON — falling back to OpenRouter");
    errors.push("NVIDIA NIM: unparsable JSON response");
  } else {
    logger.warn({ error: nimRes.error }, "NVIDIA NIM script analysis failed — falling back to OpenRouter");
    errors.push(`NVIDIA NIM: ${nimRes.error}`);
  }

  // Priority 2: OpenRouter (free models only, tried in order internally)
  const orStart = Date.now();
  const orRes = await callOpenRouterText(prompt);
  totalMs += Date.now() - orStart;
  retryCount += orRes.attempts || 1;
  if (orRes.text) {
    const parsed = extractJson<ScriptLineContext>(orRes.text);
    if (parsed && Array.isArray(parsed.queries) && parsed.queries.length > 0) {
      return { success: true, provider: "openrouter", model: orRes.model, executionMs: totalMs, retryCount, finalFallback: false, error: null, data: parsed };
    }
    logger.warn({ raw: orRes.text.slice(0, 200) }, "OpenRouter analysis returned unparsable JSON — falling back to Gemini");
    errors.push("OpenRouter: unparsable JSON response");
  } else {
    logger.warn({ error: orRes.error }, "OpenRouter script analysis failed — falling back to Gemini");
    errors.push(`OpenRouter: ${orRes.error}`);
  }

  // Priority 3: Gemini
  const geminiStart = Date.now();
  const geminiRes = await callGeminiText(prompt);
  totalMs += Date.now() - geminiStart;
  retryCount++;
  if (geminiRes.text) {
    const parsed = extractJson<ScriptLineContext>(geminiRes.text);
    if (parsed && Array.isArray(parsed.queries) && parsed.queries.length > 0) {
      return { success: true, provider: "gemini", model: GEMINI_MODEL, executionMs: totalMs, retryCount, finalFallback: false, error: null, data: parsed };
    }
    errors.push("Gemini: unparsable JSON response");
  } else {
    errors.push(`Gemini: ${geminiRes.error}`);
  }

  // Priority 4: all AI providers exhausted — caller falls back to the rule-based heuristic pipeline
  logger.warn({ errors }, "All AI providers failed for script analysis — using rule-based fallback");
  return {
    success: false,
    provider: "none",
    model: null,
    executionMs: totalMs,
    retryCount,
    finalFallback: true,
    error: errors.join(" | "),
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
  let retryCount = 0;
  const errors: string[] = [];
  let totalMs = 0;

  // Priority 1: NVIDIA NIM
  const nimStart = Date.now();
  const nimRes = await callNvidiaNimVision(prompt, imageUrl);
  totalMs += Date.now() - nimStart;
  retryCount++;
  if (nimRes.text) {
    const parsed = extractJson<ImageVerification>(nimRes.text);
    if (parsed && typeof parsed.score === "number") {
      return { success: true, provider: "nvidia_nim", model: NVIDIA_NIM_VISION_MODEL, executionMs: totalMs, retryCount, finalFallback: false, error: null, data: parsed };
    }
    errors.push("NVIDIA NIM: unparsable JSON response");
  } else {
    logger.warn({ error: nimRes.error }, "NVIDIA NIM image verification failed — falling back to OpenRouter");
    errors.push(`NVIDIA NIM: ${nimRes.error}`);
  }

  // Priority 2: OpenRouter (free models only, tried in order internally)
  const orStart = Date.now();
  const orRes = await callOpenRouterVision(prompt, imageUrl);
  totalMs += Date.now() - orStart;
  retryCount += orRes.attempts || 1;
  if (orRes.text) {
    const parsed = extractJson<ImageVerification>(orRes.text);
    if (parsed && typeof parsed.score === "number") {
      return { success: true, provider: "openrouter", model: orRes.model, executionMs: totalMs, retryCount, finalFallback: false, error: null, data: parsed };
    }
    errors.push("OpenRouter: unparsable verification JSON");
  } else {
    logger.warn({ error: orRes.error }, "OpenRouter image verification failed — falling back to Gemini");
    errors.push(`OpenRouter: ${orRes.error}`);
  }

  // Priority 3: Gemini
  const geminiStart = Date.now();
  const geminiRes = await callGeminiVision(prompt, imageUrl);
  totalMs += Date.now() - geminiStart;
  retryCount++;
  if (geminiRes.text) {
    const parsed = extractJson<ImageVerification>(geminiRes.text);
    if (parsed && typeof parsed.score === "number") {
      return { success: true, provider: "gemini", model: GEMINI_MODEL, executionMs: totalMs, retryCount, finalFallback: false, error: null, data: parsed };
    }
    errors.push("Gemini: unparsable verification JSON");
  } else {
    errors.push(`Gemini: ${geminiRes.error}`);
  }

  // Priority 4: all AI providers exhausted — caller falls back to unverified top-scored results
  logger.warn({ errors }, "All AI providers failed for image verification — using unverified fallback");
  return {
    success: false,
    provider: "none",
    model: null,
    executionMs: totalMs,
    retryCount,
    finalFallback: true,
    error: errors.join(" | "),
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
  return Boolean(NVIDIA_NIM_API_KEY || GEMINI_API_KEY || OPENROUTER_API_KEY);
}
