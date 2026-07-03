import type { ImageSearchResult, ImageResult, ProviderDebugInfo, AIDebugInfo } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Copy, Download, ExternalLink, Image as ImageIcon, Globe, Camera, Zap, Languages, ChevronDown, ChevronUp, AlertTriangle, CheckCircle2, Clock, Link2, Cpu, RefreshCw, ShieldAlert } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';
import { ImagePreviewModal } from './ImagePreviewModal';

interface ResultCardProps {
  result: ImageSearchResult;
}

const PROVIDER_BADGE_STYLES: Record<string, { bg: string; icon: typeof Globe; label: string }> = {
  google:    { bg: 'bg-blue-600/90',    icon: Globe,     label: 'Google' },
  wikimedia: { bg: 'bg-neutral-700/90', icon: Globe,     label: 'Wikimedia' },
  unsplash:  { bg: 'bg-slate-800/90',   icon: Camera,    label: 'Unsplash' },
  pixabay:   { bg: 'bg-lime-600/90',    icon: ImageIcon, label: 'Pixabay' },
  pexels:    { bg: 'bg-emerald-600/90', icon: Camera,    label: 'Pexels' },
};

function ProviderBadge({ source }: { source: string }) {
  const style = PROVIDER_BADGE_STYLES[source];
  if (!style) return null;
  const Icon = style.icon;
  return (
    <span className={`absolute top-1.5 left-1.5 z-10 flex items-center gap-0.5 ${style.bg} text-white text-[9px] font-bold px-1.5 py-0.5 rounded-sm leading-tight backdrop-blur-sm`}>
      <Icon className="w-2.5 h-2.5" /> {style.label}
    </span>
  );
}

function ScoreDot({ score }: { score: number }) {
  const color =
    score >= 80 ? 'bg-green-500' :
    score >= 60 ? 'bg-yellow-500' :
    score >= 40 ? 'bg-orange-500' : 'bg-red-400';
  return (
    <span className={`inline-block w-2 h-2 rounded-full ${color} shrink-0`} title={`Score: ${score}`} />
  );
}

function AnalysisPanel({ result }: { result: ImageSearchResult }) {
  const a = result.analysis;
  if (!a) return null;

  const chips = [
    a.timeOfDay && { label: 'Time', value: a.timeOfDay },
    a.location   && { label: 'Location', value: a.location },
    a.emotion    && { label: 'Mood', value: a.emotion },
  ].filter(Boolean) as { label: string; value: string }[];

  return (
    <div className="rounded-md bg-muted/40 border border-muted px-3 py-2.5 space-y-2">
      {a.detectedLanguage !== 'en' && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Languages className="w-3.5 h-3.5 shrink-0 text-primary" />
          <span className="font-medium text-foreground">{a.detectedLanguageName}</span>
          <span>→</span>
          <span className="italic truncate">{a.translatedText}</span>
        </div>
      )}
      <div className="flex items-start gap-1.5">
        <Zap className="w-3.5 h-3.5 mt-0.5 shrink-0 text-primary" />
        <p className="text-xs font-mono text-foreground leading-snug">{a.englishQuery}</p>
      </div>
      {chips.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-0.5">
          {chips.map(chip => (
            <span key={chip.label} className="inline-flex items-center gap-1 text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
              <span className="text-muted-foreground">{chip.label}:</span> {chip.value}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

const DEBUG_BADGE_COLORS: Record<string, string> = {
  google:    'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  wikimedia: 'bg-neutral-200 text-neutral-700 dark:bg-neutral-800/60 dark:text-neutral-300',
  unsplash:  'bg-slate-200 text-slate-700 dark:bg-slate-800/60 dark:text-slate-300',
  pixabay:   'bg-lime-100 text-lime-700 dark:bg-lime-900/40 dark:text-lime-300',
  pexels:    'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
};

function ProviderDebugPanel({ debugList }: { debugList: ProviderDebugInfo[] }) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  if (!debugList || debugList.length === 0) return null;

  const hasErrors = debugList.some(d => d.error);

  const copyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    toast({ title: "Copied", description: "URL copied to clipboard." });
  };

  return (
    <div className="rounded-md border border-dashed border-muted-foreground/30 overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-muted-foreground hover:bg-muted/30 transition-colors"
        onClick={() => setOpen(v => !v)}
      >
        <span className="flex items-center gap-1.5">
          {hasErrors
            ? <AlertTriangle className="w-3.5 h-3.5 text-destructive" />
            : <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />}
          Provider Debug Info
          {hasErrors && <span className="text-destructive font-bold">— errors detected</span>}
        </span>
        {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </button>

      {open && (
        <div className="px-3 pb-3 pt-1 space-y-3 bg-muted/10">
          {debugList.map((dbg, i) => (
            <div key={i} className="space-y-2">
              {/* Header row */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide ${
                  DEBUG_BADGE_COLORS[dbg.provider] ?? 'bg-muted text-muted-foreground'
                }`}>
                  {dbg.provider}
                </span>
                <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Clock className="w-3 h-3" />
                  {dbg.executionMs}ms
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {dbg.rawCount} raw → {dbg.filteredCount} used
                </span>
                {dbg.error
                  ? <span className="text-[10px] font-semibold text-destructive flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> FAILED</span>
                  : <span className="text-[10px] font-semibold text-green-600 dark:text-green-400 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> OK</span>
                }
              </div>

              {/* Query */}
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-0.5">Search Query</p>
                <code className="text-xs bg-muted px-2 py-1 rounded block font-mono break-all">{dbg.query}</code>
              </div>

              {/* Request URL */}
              <div>
                <div className="flex items-center justify-between mb-0.5">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">API Request URL</p>
                  <button
                    className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5"
                    onClick={() => copyUrl(dbg.requestUrl)}
                    title="Copy URL"
                  >
                    <Copy className="w-3 h-3" /> copy
                  </button>
                </div>
                <code className="text-[10px] bg-muted px-2 py-1 rounded block font-mono break-all leading-relaxed text-muted-foreground">
                  {dbg.requestUrl}
                </code>
              </div>

              {/* Error */}
              {dbg.error && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-destructive font-semibold mb-0.5">Error</p>
                  <div className="text-xs bg-destructive/10 border border-destructive/30 text-destructive px-2 py-1.5 rounded font-mono break-all">
                    {dbg.error}
                  </div>
                </div>
              )}

              {/* Sample URLs */}
              {!dbg.error && dbg.sampleUrls && dbg.sampleUrls.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-0.5">
                    First {dbg.sampleUrls.length} Image URLs
                  </p>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {dbg.sampleUrls.map((url, j) => (
                      <div key={j} className="flex items-start gap-1.5 group">
                        <span className="text-[10px] text-muted-foreground w-4 shrink-0 mt-0.5 font-mono">{j + 1}.</span>
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] font-mono text-primary/80 hover:text-primary break-all leading-relaxed flex items-start gap-0.5"
                        >
                          <Link2 className="w-2.5 h-2.5 mt-0.5 shrink-0" />
                          {url}
                        </a>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {i < debugList.length - 1 && (
                <div className="border-t border-dashed border-muted-foreground/20 pt-1" />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const AI_PROVIDER_BADGE_COLORS: Record<string, string> = {
  nvidia_nim: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  openrouter: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  gemini:     'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
};

const AI_PROVIDER_LABELS: Record<string, string> = {
  nvidia_nim: 'NVIDIA NIM',
  openrouter: 'OpenRouter (free)',
  gemini:     'Gemini',
};

function AIStageRow({
  title,
  provider,
  model,
  executionMs,
  retryCount,
  finalFallback,
  error,
}: {
  title: string;
  provider?: string | null;
  model?: string | null;
  executionMs?: number | null;
  retryCount?: number;
  finalFallback?: boolean;
  error?: string | null;
}) {
  return (
    <div className="space-y-1.5 rounded-md bg-background/60 border border-muted-foreground/10 p-2.5">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{title}</p>
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide flex items-center gap-1 ${
          provider ? (AI_PROVIDER_BADGE_COLORS[provider] ?? 'bg-muted text-muted-foreground') : 'bg-muted text-muted-foreground'
        }`}>
          <Cpu className="w-2.5 h-2.5" />
          {provider ? (AI_PROVIDER_LABELS[provider] ?? provider) : 'none'}
        </span>
        {model && (
          <code className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-mono text-muted-foreground">{model}</code>
        )}
        {executionMs != null && (
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Clock className="w-3 h-3" /> {executionMs}ms
          </span>
        )}
        {!!retryCount && (
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <RefreshCw className="w-3 h-3" /> {retryCount} attempt{retryCount === 1 ? '' : 's'}
          </span>
        )}
        {finalFallback ? (
          <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1">
            <ShieldAlert className="w-3 h-3" /> Rule-based fallback used
          </span>
        ) : provider ? (
          <span className="text-[10px] font-semibold text-green-600 dark:text-green-400 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> OK
          </span>
        ) : null}
      </div>
      {error && (
        <div className="text-[10px] bg-destructive/10 border border-destructive/30 text-destructive px-2 py-1 rounded font-mono break-all">
          {error}
        </div>
      )}
    </div>
  );
}

function AIDebugPanel({ aiDebug }: { aiDebug?: AIDebugInfo }) {
  const [open, setOpen] = useState(false);
  if (!aiDebug || !aiDebug.used) return null;

  const hasFallback = Boolean(aiDebug.queryAnalysisFinalFallback || aiDebug.verificationFinalFallback);

  return (
    <div className="rounded-md border border-dashed border-muted-foreground/30 overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-muted-foreground hover:bg-muted/30 transition-colors"
        onClick={() => setOpen(v => !v)}
      >
        <span className="flex items-center gap-1.5">
          {hasFallback
            ? <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
            : <Cpu className="w-3.5 h-3.5 text-primary" />}
          AI Debug Info
          {hasFallback && <span className="text-amber-600 dark:text-amber-400 font-bold">— fallback used</span>}
        </span>
        {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </button>

      {open && (
        <div className="px-3 pb-3 pt-1 space-y-2 bg-muted/10">
          <AIStageRow
            title="Script Analysis"
            provider={aiDebug.queryAnalysisProvider}
            model={aiDebug.queryAnalysisModel}
            executionMs={aiDebug.queryAnalysisExecutionMs}
            retryCount={aiDebug.queryAnalysisRetryCount}
            finalFallback={aiDebug.queryAnalysisFinalFallback}
            error={aiDebug.queryAnalysisError}
          />
          <AIStageRow
            title="Image Verification"
            provider={aiDebug.verificationProvider}
            model={aiDebug.verificationModel}
            executionMs={aiDebug.verificationExecutionMs}
            retryCount={aiDebug.verificationRetryCount}
            finalFallback={aiDebug.verificationFinalFallback}
            error={aiDebug.verificationError}
          />
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground pt-0.5">
            <span>Verified: <strong className="text-foreground">{aiDebug.verifiedCount ?? 0}</strong></span>
            <span>Rejected: <strong className="text-foreground">{aiDebug.rejectedCount ?? 0}</strong></span>
          </div>
        </div>
      )}
    </div>
  );
}

export function ResultCard({ result }: ResultCardProps) {
  const { toast } = useToast();
  const [previewData, setPreviewData] = useState<{ open: boolean; index: number }>({ open: false, index: 0 });

  const copyQuery = () => {
    navigator.clipboard.writeText(result.query);
    toast({ title: "Copied", description: "Search query copied to clipboard." });
  };

  const copyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    toast({ title: "Copied", description: "Image URL copied to clipboard." });
  };

  const downloadImage = async (url: string, index: number) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = `line_${result.lineNumber}_image_${index + 1}.jpg`;
      a.click();
      URL.revokeObjectURL(objectUrl);
    } catch {
      window.open(url, '_blank');
    }
  };

  const SINGLE_PROVIDER_LABELS: Record<string, string> = {
    google:    'Google Images',
    wikimedia: 'Wikimedia Commons',
    unsplash:  'Unsplash',
    pixabay:   'Pixabay',
    pexels:    'Pexels',
  };

  const providerLabel =
    result.provider === 'multi'
      ? [...new Set(result.images.map((img: ImageResult) => img.source))]
          .map((s) => SINGLE_PROVIDER_LABELS[s as string] ?? s)
          .join(' + ')
      : SINGLE_PROVIDER_LABELS[result.provider] ?? result.provider;

  const topScore = result.images.length > 0
    ? Math.max(...result.images.map((img: ImageResult) => img.score ?? 0))
    : 0;

  return (
    <Card className="flex flex-col gap-4 p-6 shadow-sm border bg-card/50">
      <div className="flex flex-col md:flex-row gap-6">
        {/* Left panel: line info + analysis */}
        <div className="w-full md:w-[340px] shrink-0 flex flex-col gap-3">
          <div className="flex items-start gap-3">
            <div className="bg-primary text-primary-foreground text-sm font-bold w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5">
              {result.lineNumber}
            </div>
            <p className="text-sm font-medium leading-relaxed italic text-foreground border-l-2 border-primary/30 pl-3">
              "{result.lineText}"
            </p>
          </div>

          <AnalysisPanel result={result} />

          <div className="flex items-center justify-between text-xs text-muted-foreground mt-auto pt-1">
            <div className="flex items-center gap-1.5">
              <ScoreDot score={topScore} />
              <span>Best score: <strong className="text-foreground">{topScore}</strong></span>
            </div>
            <Badge variant="outline" className="text-[10px] px-2 py-0">
              {providerLabel}
            </Badge>
          </div>

          <div className="flex items-center gap-2">
            <div className="bg-muted px-3 py-2 rounded text-xs text-muted-foreground font-mono flex-1 truncate">
              {result.query}
            </div>
            <Button variant="outline" size="icon" className="shrink-0 h-8 w-8" onClick={copyQuery} title="Copy query">
              <Copy className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        {/* Right panel: image grid */}
        <div className="flex-1 min-w-0">
          {result.images.length === 0 ? (
            <div className="h-full min-h-[160px] bg-muted/30 border border-dashed rounded-lg flex flex-col items-center justify-center text-muted-foreground p-4 text-center">
              <ImageIcon className="w-8 h-8 mb-2 opacity-50" />
              <p className="text-sm font-medium">No images found</p>
              <p className="text-xs opacity-70">Try a different provider or modify the line</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {result.images.map((img: ImageResult, idx: number) => (
                <div
                  key={img.id}
                  className="group relative aspect-square rounded-md overflow-hidden bg-muted cursor-pointer shadow-sm hover:shadow-md transition-shadow"
                  onClick={() => setPreviewData({ open: true, index: idx })}
                >
                  <img
                    src={img.thumbnailUrl}
                    alt={img.alt ?? result.query}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    loading="lazy"
                  />

                  <ProviderBadge source={img.source} />

                  {img.width != null && img.height != null && (
                    <span className="absolute top-1.5 right-1.5 z-10 bg-black/60 text-white text-[9px] font-medium px-1.5 py-0.5 rounded-sm leading-tight backdrop-blur-sm">
                      {img.width}×{img.height}
                    </span>
                  )}

                  {img.score != null && (
                    <span className="absolute top-7 right-1.5 z-10 bg-black/60 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-sm leading-tight backdrop-blur-sm">
                      {img.score}
                    </span>
                  )}

                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5">
                    <Button
                      variant="secondary"
                      size="icon"
                      className="w-7 h-7 rounded-full bg-white/20 hover:bg-white text-white hover:text-black border-none"
                      onClick={(e) => { e.stopPropagation(); downloadImage(img.url, idx); }}
                      title="Download"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="secondary"
                      size="icon"
                      className="w-7 h-7 rounded-full bg-white/20 hover:bg-white text-white hover:text-black border-none"
                      onClick={(e) => { e.stopPropagation(); copyUrl(img.url); }}
                      title="Copy URL"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="secondary"
                      size="icon"
                      className="w-7 h-7 rounded-full bg-white/20 hover:bg-white text-white hover:text-black border-none"
                      onClick={(e) => { e.stopPropagation(); window.open(img.url, '_blank'); }}
                      title="Open original"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </Button>
                  </div>

                  <div className="absolute bottom-0 inset-x-0 p-2 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                    <p className="text-[10px] text-white/90 truncate">by {img.photographer}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Debug panels — full width below */}
      <AIDebugPanel aiDebug={result.aiDebug} />
      {result.providerDebug && result.providerDebug.length > 0 && (
        <ProviderDebugPanel debugList={result.providerDebug} />
      )}

      <ImagePreviewModal
        images={result.images}
        initialIndex={previewData.index}
        open={previewData.open}
        onOpenChange={(open) => setPreviewData(prev => ({ ...prev, open }))}
      />
    </Card>
  );
}
