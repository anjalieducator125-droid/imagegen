import { useState, useRef } from 'react';
import { useSearchImages } from '@workspace/api-client-react';
import type { ImageSearchResult, ImageSearchInputOrientation } from '@workspace/api-client-react';
import { useToast } from '@/hooks/use-toast';

// ---------------------------------------------------------------------------
// Sentence / scene splitter
// Splits on: । (Devanagari danda) . ? ! and blank lines.
// Keeps the punctuation attached to the preceding sentence.
// ---------------------------------------------------------------------------
function splitIntoScenes(text: string): { lineNumber: number; text: string }[] {
  if (!text.trim()) return [];

  // Treat double line-breaks as scene breaks; single newlines become spaces
  const normalized = text
    .replace(/\r\n/g, '\n')
    .replace(/\n{2,}/g, '।')   // blank line → danda so it triggers a split
    .replace(/\n/g, ' ');       // single newline → space (continuation)

  // Match: one or more non-sentence-ender chars, optionally followed by one or
  // more sentence-ender chars (so the punctuation stays with its sentence).
  const sentenceRe = /[^।.?!]+[।.?!]*/g;
  const matches = normalized.match(sentenceRe) ?? [];

  return matches
    .map(s => s.trim())
    .filter(s => s.replace(/[।.?!\s]/g, '').length > 2)   // skip near-empty
    .map((text, idx) => ({ lineNumber: idx + 1, text }));
}

export type Settings = {
  perPage: number;
  provider: string;
  orientation: ImageSearchInputOrientation;
  safeSearch: boolean;
};

export function useScriptProcessor() {
  const [script, setScript] = useState('');
  const [results, setResults] = useState<ImageSearchResult[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [currentLineIndex, setCurrentLineIndex] = useState(-1);
  const [parsedLines, setParsedLines] = useState<{ lineNumber: number; text: string }[]>([]);

  const [settings, setSettings] = useState<Settings>({
    perPage: 4,
    provider: 'auto',
    orientation: 'landscape',
    safeSearch: true
  });

  const stopRequested = useRef(false);
  const { toast } = useToast();
  const searchMutation = useSearchImages();

  const handleScriptChange = (val: string) => {
    setScript(val);
    setParsedLines(splitIntoScenes(val));
  };

  const processLine = async (line: { lineNumber: number; text: string }) => {
    try {
      const response = await searchMutation.mutateAsync({
        data: {
          lineNumber: line.lineNumber,
          lineText: line.text,
          provider: settings.provider,
          perPage: settings.perPage,
          orientation: settings.orientation,
          safeSearch: settings.safeSearch
        }
      });

      setResults(prev => {
        const existing = prev.findIndex(r => r.lineNumber === line.lineNumber);
        if (existing >= 0) {
          const next = [...prev];
          next[existing] = response;
          return next;
        }
        return [...prev, response].sort((a, b) => a.lineNumber - b.lineNumber);
      });
      return true;
    } catch (err) {
      console.error(`Failed line ${line.lineNumber}:`, err);
      toast({
        title: `Line ${line.lineNumber} failed`,
        description: "Could not fetch images — skipping and continuing.",
        variant: "destructive"
      });
      return false;
    }
  };

  const startProcessing = async () => {
    if (parsedLines.length === 0) {
      toast({
        title: "Script empty",
        description: "Please enter a script to generate images.",
        variant: "destructive"
      });
      return;
    }

    setIsProcessing(true);
    setIsStopping(false);
    stopRequested.current = false;
    setCurrentLineIndex(0);

    for (let i = 0; i < parsedLines.length; i++) {
      if (stopRequested.current) break;

      setCurrentLineIndex(i);
      const line = parsedLines[i];

      // Skip if we already have results for this line
      if (results.some(r => r.lineNumber === line.lineNumber)) {
        continue;
      }

      await processLine(line);
    }

    setIsProcessing(false);
    setIsStopping(false);
    setCurrentLineIndex(-1);

    if (!stopRequested.current) {
      toast({
        title: "Processing complete",
        description: `Successfully processed ${parsedLines.length} lines.`,
      });
    } else {
      toast({
        title: "Processing stopped",
        description: "Stopped at your request.",
      });
    }
  };

  const stopProcessing = () => {
    setIsStopping(true);
    stopRequested.current = true;
  };

  const retryLine = async (lineNumber: number) => {
    const line = parsedLines.find(l => l.lineNumber === lineNumber);
    if (!line) return;
    await processLine(line);
  };

  const clearAll = () => {
    setScript('');
    setParsedLines([]);
    setResults([]);
    setCurrentLineIndex(-1);
    stopRequested.current = true;
    setIsProcessing(false);
  };

  return {
    script,
    setScript: handleScriptChange,
    parsedLines,
    results,
    isProcessing,
    isStopping,
    currentLineIndex,
    settings,
    setSettings,
    startProcessing,
    stopProcessing,
    retryLine,
    clearAll
  };
}
