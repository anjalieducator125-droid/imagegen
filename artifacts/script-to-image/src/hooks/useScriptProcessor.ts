import { useState, useRef } from 'react';
import { useSearchImages } from '@workspace/api-client-react';
import type { ImageSearchResult, ImageSearchInputOrientation } from '@workspace/api-client-react';
import { useToast } from '@/hooks/use-toast';

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
    provider: 'pexels',
    orientation: 'landscape',
    safeSearch: true
  });

  const stopRequested = useRef(false);
  const { toast } = useToast();
  const searchMutation = useSearchImages();

  const handleScriptChange = (val: string) => {
    setScript(val);
    const lines = val
      .split('\n')
      .map(t => t.trim())
      .filter(t => t.length > 0)
      .map((text, idx) => ({ lineNumber: idx + 1, text }));
    setParsedLines(lines);
  };

  const processLine = async (line: { lineNumber: number; text: string }) => {
    try {
      const response = await searchMutation.mutateAsync({
        data: {
          lineNumber: line.lineNumber,
          lineText: line.text,
          query: line.text,
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
        title: "Error fetching images",
        description: `Failed to fetch images for line ${line.lineNumber}.`,
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
        description: `Stopped after ${currentLineIndex} lines.`,
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