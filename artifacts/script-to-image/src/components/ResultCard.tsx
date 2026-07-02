import type { ImageSearchResult, ImageResult } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Copy, Download, ExternalLink, Image as ImageIcon } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';
import { ImagePreviewModal } from './ImagePreviewModal';

interface ResultCardProps {
  result: ImageSearchResult;
  isProcessing?: boolean;
}

export function ResultCard({ result, isProcessing }: ResultCardProps) {
  const { toast } = useToast();
  const [previewData, setPreviewData] = useState<{ open: boolean, index: number }>({ open: false, index: 0 });

  const copyQuery = () => {
    navigator.clipboard.writeText(result.query);
    toast({
      title: "Copied to clipboard",
      description: "Search query copied."
    });
  };

  const copyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    toast({
      title: "Copied to clipboard",
      description: "Image URL copied."
    });
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
    } catch (e) {
      window.open(url, '_blank');
    }
  };

  return (
    <Card className="flex flex-col md:flex-row gap-6 p-6 shadow-sm border bg-card/50">
      <div className="w-full md:w-1/3 flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <div className="bg-primary text-primary-foreground text-sm font-bold w-8 h-8 rounded-full flex items-center justify-center shrink-0">
            {result.lineNumber}
          </div>
          <p className="text-sm font-medium leading-relaxed italic text-foreground border-l-2 border-primary/30 pl-3">
            "{result.lineText}"
          </p>
        </div>
        
        <div className="mt-auto space-y-2">
          <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Search Query Used</p>
          <div className="flex items-center gap-2">
            <div className="bg-muted px-3 py-2 rounded text-sm text-muted-foreground truncate font-mono flex-1">
              {result.query}
            </div>
            <Button variant="outline" size="icon" onClick={copyQuery} title="Copy query">
              <Copy className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="w-full md:w-2/3">
        {result.images.length === 0 ? (
          <div className="h-full min-h-[160px] bg-muted/30 border border-dashed rounded-lg flex flex-col items-center justify-center text-muted-foreground p-4 text-center">
            <ImageIcon className="w-8 h-8 mb-2 opacity-50" />
            <p className="text-sm font-medium">No images found</p>
            <p className="text-xs opacity-70">Try modifying the script line</p>
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
                  alt={img.alt || result.query} 
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  <Button 
                    variant="secondary" 
                    size="icon" 
                    className="w-8 h-8 rounded-full bg-white/20 hover:bg-white text-white hover:text-black border-none"
                    onClick={(e) => { e.stopPropagation(); downloadImage(img.url, idx); }}
                    title="Download"
                  >
                    <Download className="w-4 h-4" />
                  </Button>
                  <Button 
                    variant="secondary" 
                    size="icon" 
                    className="w-8 h-8 rounded-full bg-white/20 hover:bg-white text-white hover:text-black border-none"
                    onClick={(e) => { e.stopPropagation(); copyUrl(img.url); }}
                    title="Copy URL"
                  >
                    <Copy className="w-4 h-4" />
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

      <ImagePreviewModal 
        images={result.images}
        initialIndex={previewData.index}
        open={previewData.open}
        onOpenChange={(open) => setPreviewData(prev => ({ ...prev, open }))}
      />
    </Card>
  );
}