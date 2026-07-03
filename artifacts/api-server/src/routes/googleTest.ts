import { Router, type IRouter } from "express";

const router: IRouter = Router();

router.get("/google-test", async (_req, res): Promise<void> => {
  const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
  const GOOGLE_CX = process.env.GOOGLE_CX;

  const keyLoaded = Boolean(GOOGLE_API_KEY);
  const cxLoaded = Boolean(GOOGLE_CX);

  if (!keyLoaded || !cxLoaded) {
    res.json({
      keyLoaded,
      cxLoaded,
      requestUrl: null,
      httpStatus: null,
      responseJson: null,
      imageCount: 0,
      firstImageUrl: null,
      error: `Missing env vars: ${[!keyLoaded && "GOOGLE_API_KEY", !cxLoaded && "GOOGLE_CX"].filter(Boolean).join(", ")}`,
    });
    return;
  }

  const query = "Ayodhya Ram Mandir";

  const params = new URLSearchParams({
    key: GOOGLE_API_KEY as string,
    cx: GOOGLE_CX as string,
    q: query,
    searchType: "image",
    num: "10",
    imgType: "photo",
  });

  const rawUrl = `https://www.googleapis.com/customsearch/v1?${params.toString()}`;
  const redactedUrl = rawUrl.replace(/([?&]key=)[^&]*/g, "$1[REDACTED]");

  let httpStatus: number | null = null;
  let responseJson: unknown = null;
  let imageCount = 0;
  let firstImageUrl: string | null = null;
  let error: string | null = null;

  try {
    const response = await fetch(rawUrl);
    httpStatus = response.status;

    const text = await response.text();
    try {
      responseJson = JSON.parse(text);
    } catch {
      responseJson = text;
    }

    if (!response.ok) {
      const body = responseJson as Record<string, unknown>;
      const googleError = (body?.error as Record<string, unknown>)?.message as string | undefined;
      error = googleError
        ? `HTTP ${httpStatus}: ${googleError}`
        : `HTTP ${httpStatus} ${response.statusText}`;
    } else {
      const body = responseJson as { items?: Array<{ link: string }> };
      const items = body?.items ?? [];
      imageCount = items.length;
      firstImageUrl = items[0]?.link ?? null;
      if (imageCount === 0) {
        error = "Request succeeded but Google returned 0 image results. Check that your CX is set to search the entire web with Image search enabled.";
      }
    }
  } catch (err) {
    error = `Network error: ${err instanceof Error ? err.message : String(err)}`;
  }

  res.json({
    keyLoaded,
    cxLoaded,
    requestUrl: redactedUrl,
    httpStatus,
    responseJson,
    imageCount,
    firstImageUrl,
    error,
  });
});

export default router;
