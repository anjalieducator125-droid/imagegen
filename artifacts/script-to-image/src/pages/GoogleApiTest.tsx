import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Link } from "wouter";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Clapperboard,
  ArrowLeft,
  FlaskConical,
} from "lucide-react";

interface TestResult {
  keyLoaded: boolean;
  cxLoaded: boolean;
  requestUrl: string | null;
  httpStatus: number | null;
  responseJson: unknown;
  imageCount: number;
  firstImageUrl: string | null;
  error: string | null;
}

function StatusRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {ok
        ? <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
        : <XCircle className="w-4 h-4 text-destructive shrink-0" />}
      <span className={ok ? "text-green-600 dark:text-green-400 font-medium" : "text-destructive font-medium"}>
        {label}
      </span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">{title}</p>
      {children}
    </div>
  );
}

export function GoogleApiTest() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);

  const runTest = async () => {
    setLoading(true);
    setResult(null);
    try {
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const resp = await fetch(`${base}/api/google-test`);
      const data: TestResult = await resp.json();
      setResult(data);
    } catch (err) {
      setResult({
        keyLoaded: false,
        cxLoaded: false,
        requestUrl: null,
        httpStatus: null,
        responseJson: null,
        imageCount: 0,
        firstImageUrl: null,
        error: `Failed to reach API server: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      setLoading(false);
    }
  };

  const success = result && !result.error && result.imageCount > 0;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-primary-foreground shadow-sm">
              <Clapperboard className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight leading-none">Google API Test</h1>
              <p className="text-[11px] text-muted-foreground leading-none mt-0.5">Custom Search diagnostics</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/">
              <Button variant="ghost" size="sm" className="gap-1.5">
                <ArrowLeft className="w-4 h-4" /> Back to app
              </Button>
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="flex-1 container mx-auto px-4 py-10 max-w-2xl flex flex-col gap-6">
        <div className="rounded-lg border bg-card p-6 shadow-sm space-y-4">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">Google Custom Search API Test</h2>
            <p className="text-sm text-muted-foreground">
              Searches for <span className="font-mono bg-muted px-1 rounded">Ayodhya Ram Mandir</span> directly via Google CSE. No Pexels fallback.
            </p>
          </div>

          <Button onClick={runTest} disabled={loading} className="gap-2 min-w-[180px]">
            {loading
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Running test…</>
              : <><FlaskConical className="w-4 h-4" /> Test Google API</>}
          </Button>
        </div>

        {result && (
          <div className="rounded-lg border bg-card p-6 shadow-sm space-y-5">
            {/* Overall result banner */}
            <div className={`rounded-md px-4 py-3 flex items-center gap-2 text-sm font-semibold ${
              success
                ? "bg-green-50 border border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-300"
                : "bg-destructive/10 border border-destructive/30 text-destructive"
            }`}>
              {success
                ? <><CheckCircle2 className="w-4 h-4" /> Google API is working — {result.imageCount} image{result.imageCount !== 1 ? "s" : ""} returned</>
                : <><XCircle className="w-4 h-4" /> {result.error}</>}
            </div>

            {/* Env var status */}
            <Section title="Environment Variables">
              <div className="space-y-1.5 bg-muted/30 rounded-md px-3 py-2.5">
                <StatusRow ok={result.keyLoaded} label={result.keyLoaded ? "GOOGLE_API_KEY loaded" : "GOOGLE_API_KEY not set"} />
                <StatusRow ok={result.cxLoaded} label={result.cxLoaded ? "GOOGLE_CX loaded" : "GOOGLE_CX not set"} />
              </div>
            </Section>

            {/* Request URL */}
            {result.requestUrl && (
              <Section title="Full Request URL (API key hidden)">
                <code className="block bg-muted text-xs font-mono px-3 py-2.5 rounded-md break-all leading-relaxed text-muted-foreground">
                  {result.requestUrl}
                </code>
              </Section>
            )}

            {/* HTTP status */}
            {result.httpStatus !== null && (
              <Section title="HTTP Status Code">
                <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-mono font-bold ${
                  result.httpStatus === 200
                    ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
                    : "bg-destructive/10 text-destructive"
                }`}>
                  {result.httpStatus === 200
                    ? <CheckCircle2 className="w-3.5 h-3.5" />
                    : <XCircle className="w-3.5 h-3.5" />}
                  {result.httpStatus}
                </div>
              </Section>
            )}

            {/* Image count + first URL */}
            {result.httpStatus === 200 && (
              <Section title="Image Results">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    {result.imageCount > 0
                      ? <CheckCircle2 className="w-4 h-4 text-green-500" />
                      : <XCircle className="w-4 h-4 text-destructive" />}
                    <span className="font-medium">
                      {result.imageCount} image{result.imageCount !== 1 ? "s" : ""} returned
                    </span>
                  </div>
                  {result.firstImageUrl && (
                    <div className="space-y-1">
                      <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">First Image URL</p>
                      <a
                        href={result.firstImageUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block text-xs font-mono text-primary hover:underline break-all bg-muted/40 px-3 py-2 rounded"
                      >
                        {result.firstImageUrl}
                      </a>
                      <img
                        src={result.firstImageUrl}
                        alt="First result"
                        className="mt-2 rounded-md border max-h-48 object-cover w-full"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                    </div>
                  )}
                </div>
              </Section>
            )}

            {/* Raw JSON response */}
            {result.responseJson !== null && (
              <Section title="Google API Response JSON">
                <div className="relative">
                  <pre className="bg-muted text-[11px] font-mono p-3 rounded-md overflow-auto max-h-80 leading-relaxed text-muted-foreground whitespace-pre-wrap break-all">
                    {JSON.stringify(result.responseJson, null, 2)}
                  </pre>
                </div>
              </Section>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
