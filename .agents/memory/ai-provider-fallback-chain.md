---
name: AI provider fallback chain (script-to-image)
description: Priority order, model choices, and quirks for the AI text/vision pipeline in artifacts/api-server (aiPipeline.ts)
---

Provider priority for both script analysis (text) and image verification (vision) is:
1. NVIDIA NIM (primary)
2. OpenRouter — FREE models only, tried in list order internally before counting as one fallback hop
3. Gemini
4. Rule-based / unverified fallback (never blocks storyboard generation)

**Why:** user explicitly required NVIDIA NIM as primary with automatic fallback, and forbade ever blocking storyboard generation on AI failure. OpenRouter must only use free-tier models (verified `:free` suffix models that return `cost: 0`).

**How to apply:** When adding/changing AI providers in this pipeline, preserve this exact order and always keep a working non-AI fallback path. Track `retryCount` (number of provider attempts) and `finalFallback` (true only when every AI provider failed) per stage — these are surfaced in the `AIDebugInfo` API schema and rendered in the frontend debug panel (ResultCard.tsx `AIDebugPanel`).

NVIDIA NIM endpoint: `https://integrate.api.nvidia.com/v1/chat/completions` (OpenAI-compatible). Confirmed working models: `meta/llama-3.1-8b-instruct` (text, supports `response_format: json_object`) and `meta/llama-3.2-11b-vision-instruct` (vision, accepts `image_url` content parts like OpenAI format).

Do not integrate "OpenCode" as a provider — its endpoint was never verified/confirmed working during investigation; explicitly excluded per user instruction.
