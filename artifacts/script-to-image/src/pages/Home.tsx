import { ScriptInput } from "@/components/ScriptInput";
import { SettingsPanel } from "@/components/SettingsPanel";
import { ResultCard } from "@/components/ResultCard";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useScriptProcessor } from "@/hooks/useScriptProcessor";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { exportToJSON, exportToCSV, exportToZIP } from "@/lib/export";
import { Download, FileJson, FileSpreadsheet, Play, Square, Loader2, Frame } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export function Home() {
  const processor = useScriptProcessor();
  
  const hasParsedLines = processor.parsedLines.length > 0;
  const progress = hasParsedLines ? Math.round((processor.results.length / processor.parsedLines.length) * 100) : 0;
  
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
              <Frame className="w-5 h-5" />
            </div>
            <h1 className="text-xl font-bold tracking-tight">Script to Image Finder</h1>
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
            />
          </div>

          <div className="lg:col-span-8 flex flex-col gap-6">
            <SettingsPanel 
              settings={processor.settings}
              setSettings={processor.setSettings}
              disabled={processor.isProcessing}
            />
            
            <div className="bg-card border rounded-lg p-5 flex flex-col gap-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {!processor.isProcessing ? (
                    <Button 
                      onClick={processor.startProcessing} 
                      disabled={!hasParsedLines || processor.isProcessing}
                      className="min-w-[140px]"
                    >
                      <Play className="w-4 h-4 mr-2" />
                      Generate
                    </Button>
                  ) : (
                    <Button 
                      variant="destructive" 
                      onClick={processor.stopProcessing}
                      disabled={processor.isStopping}
                      className="min-w-[140px]"
                    >
                      {processor.isStopping ? (
                        <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Stopping...</>
                      ) : (
                        <><Square className="w-4 h-4 mr-2 fill-current" /> Stop</>
                      )}
                    </Button>
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
                      Progress: {processor.results.length} of {processor.parsedLines.length} lines
                    </span>
                    <span className="font-bold">{progress}%</span>
                  </div>
                  <Progress value={progress} className="h-2" />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Results Section */}
        {hasParsedLines && (
          <div className="space-y-6 mt-4">
            <h2 className="text-2xl font-semibold tracking-tight border-b pb-2">Results</h2>
            
            <div className="flex flex-col gap-6">
              {processor.parsedLines.map((line, idx) => {
                const result = processor.results.find(r => r.lineNumber === line.lineNumber);
                const isCurrent = processor.currentLineIndex === idx;
                const isPending = idx > processor.currentLineIndex && processor.isProcessing;

                if (result) {
                  return <ResultCard key={line.lineNumber} result={result} />;
                }
                
                if (isCurrent) {
                  return (
                    <div key={line.lineNumber} className="flex flex-col md:flex-row gap-6 p-6 border rounded-lg bg-card shadow-sm animate-pulse">
                      <div className="w-full md:w-1/3 flex flex-col gap-4">
                        <div className="flex items-center gap-3">
                          <div className="bg-primary/20 text-primary w-8 h-8 rounded-full flex items-center justify-center shrink-0">
                            {line.lineNumber}
                          </div>
                          <Skeleton className="h-4 w-full" />
                        </div>
                        <div className="mt-auto space-y-2">
                          <Skeleton className="h-3 w-24" />
                          <Skeleton className="h-8 w-full" />
                        </div>
                      </div>
                      <div className="w-full md:w-2/3">
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                          {Array.from({ length: processor.settings.perPage }).map((_, i) => (
                            <Skeleton key={i} className="w-full aspect-square rounded-md" />
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                }

                // If not processed yet, show minimal state or skip. We'll show a small placeholder
                return (
                  <div key={line.lineNumber} className="flex items-center gap-3 p-4 border rounded-lg bg-muted/20 opacity-50">
                    <div className="bg-muted text-muted-foreground w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-sm font-bold">
                      {line.lineNumber}
                    </div>
                    <p className="text-sm text-muted-foreground truncate flex-1">
                      Waiting: {line.text}
                    </p>
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