import { useState, useCallback } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Trash2, UploadCloud, Clapperboard } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ScriptInputProps {
  script: string;
  setScript: (val: string) => void;
  clearAll: () => void;
  disabled?: boolean;
  sceneCount: number;
}

export function ScriptInput({ script, setScript, clearAll, disabled, sceneCount }: ScriptInputProps) {
  const [isDragging, setIsDragging] = useState(false);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled) return;

    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith('.txt') || file.type === 'text/plain')) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setScript(event.target.result as string);
        }
      };
      reader.readAsText(file);
    }
  }, [disabled, setScript]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium">Script Input</label>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {sceneCount > 0 && (
            <span className="flex items-center gap-1 bg-primary/10 text-primary font-semibold px-2 py-0.5 rounded-full">
              <Clapperboard className="w-3 h-3" />
              {sceneCount} scene{sceneCount !== 1 ? 's' : ''} detected
            </span>
          )}
          <span>{script.length} chars</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-auto py-1 px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={clearAll}
            disabled={disabled || !script}
          >
            <Trash2 className="w-3 h-3 mr-1" />
            Clear
          </Button>
        </div>
      </div>

      <div
        className={cn(
          "relative rounded-md transition-colors border",
          isDragging ? "border-primary bg-primary/5" : "border-input"
        )}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <Textarea
          placeholder="Paste your script here — it will be automatically split into scenes by sentence. Drag & drop a .txt file too."
          className="min-h-[200px] resize-y bg-transparent border-0 focus-visible:ring-0 rounded-none p-4"
          value={script}
          onChange={(e) => setScript(e.target.value)}
          disabled={disabled}
        />
        {!script && (
          <div className="absolute inset-0 pointer-events-none flex items-end justify-center pb-5 flex-col items-center text-muted-foreground opacity-40">
            <UploadCloud className="w-8 h-8 mb-2" />
            <span className="text-sm">Drag & drop .txt file</span>
          </div>
        )}
      </div>

      {sceneCount > 0 && (
        <p className="text-xs text-muted-foreground">
          Script automatically split into <strong>{sceneCount} scenes</strong> by sentence boundaries (।&nbsp;.&nbsp;?&nbsp;!).
          Each scene will generate its own image.
        </p>
      )}
    </div>
  );
}
