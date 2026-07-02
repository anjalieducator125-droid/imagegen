import { ScriptInput } from "@/components/ScriptInput";
import { SettingsPanel } from "@/components/SettingsPanel";
import { ResultCard } from "@/components/ResultCard";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useScriptProcessor } from "@/hooks/useScriptProcessor";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { exportToJSON, exportToCSV, exportToZIP } from "@/lib/export";
import { Download, FileJson, FileSpreadsheet, Play, Square, Loader2, Clapperboard } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export function Home() {
  const processor = useScriptProcessor();

  const hasScenes = processor.parsedLines.length > 0;
  const progress = hasScenes
    ? Math.round((processor.results.length / processor.parsedLines.length) * 100)
    : 0;

  const handleExportZip = async () => {
    if (processor.results.length === 0) return;
    await exportToZIP(processor.results);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-primary-foreground shadow-sm">
              <Clapperboard className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight leading-none">Script to Image Finder</h1>
              <p className="text-[11px] text-muted-foreground leading-none mt-0.5">Storyboard generator</p>
            </div>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="flex-1 container mx-auto px-4 py-8 flex flex-col gap-8 max-w-6xl">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

          <div className="lg:col-span-4 flex flex-col gap-6">
            <ScriptInput
              script={processor.script}
              setScript={processor.setScript}
              clearAll={processor.clearAll}
              disabled={processor.isProcessing}
              sceneCount={processor.parsedLines.length}
            />
          </div>

          <div className="lg:col-span-8 flex flex-col gap-6">
            <SettingsPanel
              settings={processor.settings}
              setSettings={processor.setSettings}
              disabled={processor.isProcessing}
            />

            <div className="bg-card border rounded-lg p-5 flex flex-col gap-4 shadow-sm">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  {!processor.isProcessing ? (
                    <Button
                      onClick={processor.startProcessing}
                      disabled={!hasScenes || processor.isProcessing}
                      className="min-w-[160px]"
                    >
                      <Play className="w-4 h-4 mr-2" />
                      Generate Storyboard
                    </Button>
                  ) : (
                    <Button
                      variant="destructive"
                      onClick={processor.stopProcessing}
                      disabled={processor.isStopping}
                      className="min-w-[160px]"
                    >
                      {processor.isStopping ? (
                        <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Stopping…</>
                      ) : (
                        <><Square className="w-4 h-4 mr-2 fill-current" /> Stop</>
                      )}
                    </Button>
                  )}
                  {hasScenes && !processor.isProcessing && (
                    <span className="text-sm text-muted-foreground">
                      {processor.parsedLines.length} scene{processor.parsedLines.length !== 1 ? 's' : ''} ready
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => exportToJSON(processor.results)}
                    disabled={processor.results.length === 0}
                  >
                    <FileJson className="w-4 h-4 mr-2" />
                    JSON
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => exportToCSV(processor.results)}
                    disabled={processor.results.length === 0}
                  >
                    <FileSpreadsheet className="w-4 h-4 mr-2" />
                    CSV
                  </Button>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={handleExportZip}
                    disabled={processor.results.length === 0}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Export ZIP
                  </Button>
                </div>
              </div>

              {(processor.isProcessing || progress > 0) && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground font-medium">
                      {processor.isProcessing
                        ? `Processing scene ${Math.min(processor.currentLineIndex + 1, processor.parsedLines.length)} of ${processor.parsedLines.length}…`
                        : `${processor.results.length} of ${processor.parsedLines.length} scenes complete`}
                    </span>
                    <span className="font-bold">{progress}%</span>
                  </div>
                  <Progress value={progress} className="h-2" />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Storyboard results */}
        {hasScenes && (
          <div className="space-y-6 mt-4">
            <div className="flex items-center justify-between border-b pb-2">
              <h2 className="text-2xl font-semibold tracking-tight">Storyboard</h2>
              {processor.results.length > 0 && (
                <span className="text-sm text-muted-foreground">
                  {processor.results.length} / {processor.parsedLines.length} scenes
                </span>
              )}
            </div>

            <div className="flex flex-col gap-6">
              {processor.parsedLines.map((scene, idx) => {
                const result = processor.results.find(r => r.lineNumber === scene.lineNumber);
                const isCurrent = processor.currentLineIndex === idx && processor.isProcessing;
                const isPending = idx > processor.currentLineIndex && processor.isProcessing;

                if (result) {
                  return <ResultCard key={scene.lineNumber} result={result} />;
                }

                if (isCurrent) {
                  return (
                    <div key={scene.lineNumber} className="flex flex-col md:flex-row gap-6 p-6 border rounded-lg bg-card shadow-sm">
                      <div className="w-full md:w-[340px] shrink-0 flex flex-col gap-3">
                        <div className="flex items-center gap-3">
                          <div className="bg-primary/20 text-primary w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-sm font-bold animate-pulse">
                            {scene.lineNumber}
                          </div>
                          <p className="text-sm italic text-muted-foreground leading-snug line-clamp-2">
                            "{scene.text}"
                          </p>
                        </div>
                        <div className="space-y-1.5 mt-1 animate-pulse">
                          <Skeleton className="h-3 w-16 rounded" />
                          <Skeleton className="h-12 w-full rounded-md" />
                          <div className="flex gap-1 pt-1">
                            <Skeleton className="h-5 w-16 rounded-full" />
                            <Skeleton className="h-5 w-12 rounded-full" />
                          </div>
                        </div>
                      </div>
                      <div className="flex-1">
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                          {Array.from({ length: processor.settings.perPage }).map((_, i) => (
                            <Skeleton key={i} className="w-full aspect-square rounded-md animate-pulse" />
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={scene.lineNumber}
                    className={`flex items-center gap-3 p-4 border rounded-lg bg-muted/20 ${isPending ? 'opacity-40' : 'opacity-50'}`}
                  >
                    <div className="bg-muted text-muted-foreground w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-sm font-bold">
                      {scene.lineNumber}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Scene {scene.lineNumber}</span>
                      <p className="text-sm text-muted-foreground truncate">{scene.text}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
