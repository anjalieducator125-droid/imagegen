import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, X, ExternalLink, Download } from "lucide-react";
import type { ImageResult } from '@workspace/api-client-react';

interface ImagePreviewModalProps {
  images: ImageResult[];
  initialIndex: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ImagePreviewModal({ images, initialIndex, open, onOpenChange }: ImagePreviewModalProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);

  useEffect(() => {
    if (open) {
      setCurrentIndex(initialIndex);
    }
  }, [initialIndex, open]);

  const next = () => setCurrentIndex((prev) => (prev + 1) % images.length);
  const prev = () => setCurrentIndex((prev) => (prev - 1 + images.length) % images.length);

  if (!images.length) return null;

  const currentImage = images[currentIndex];

  const handleDownload = async (url: string) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = `image_${currentImage.id}.jpg`;
      a.click();
      URL.revokeObjectURL(objectUrl);
    } catch (e) {
      window.open(url, '_blank');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-7xl w-full h-[90vh] p-0 overflow-hidden bg-black/95 border-none shadow-2xl flex flex-col">
        <DialogTitle className="sr-only">Image Preview</DialogTitle>
        <DialogDescription className="sr-only">View full size image</DialogDescription>
        
        <div className="absolute top-4 right-4 z-50 flex items-center gap-2">
          <Button variant="ghost" size="icon" className="text-white hover:bg-white/20" onClick={() => handleDownload(currentImage.url)}>
            <Download className="w-5 h-5" />
          </Button>
          <Button variant="ghost" size="icon" className="text-white hover:bg-white/20" asChild>
            <a href={currentImage.url} target="_blank" rel="noreferrer">
              <ExternalLink className="w-5 h-5" />
            </a>
          </Button>
          <Button variant="ghost" size="icon" className="text-white hover:bg-white/20" onClick={() => onOpenChange(false)}>
            <X className="w-6 h-6" />
          </Button>
        </div>

        <div className="flex-1 relative flex items-center justify-center w-full h-full p-4">
          <img 
            src={currentImage.url} 
            alt={currentImage.alt || 'Preview'} 
            className="max-w-full max-h-full object-contain"
          />
          
          {images.length > 1 && (
            <>
              <Button 
                variant="ghost" 
                size="icon" 
                className="absolute left-4 top-1/2 -translate-y-1/2 text-white hover:bg-white/20 h-12 w-12 rounded-full"
                onClick={(e) => { e.stopPropagation(); prev(); }}
              >
                <ChevronLeft className="w-8 h-8" />
              </Button>
              <Button 
                variant="ghost" 
                size="icon" 
                className="absolute right-4 top-1/2 -translate-y-1/2 text-white hover:bg-white/20 h-12 w-12 rounded-full"
                onClick={(e) => { e.stopPropagation(); next(); }}
              >
                <ChevronRight className="w-8 h-8" />
              </Button>
            </>
          )}
        </div>
        
        <div className="p-4 bg-black/50 text-white/80 text-sm flex justify-between items-center z-10">
          <div>
            Photo by <a href={currentImage.photographerUrl} target="_blank" rel="noreferrer" className="text-white hover:underline">{currentImage.photographer}</a> on {currentImage.source}
          </div>
          <div>
            {currentIndex + 1} of {images.length}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}