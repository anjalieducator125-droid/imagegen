import JSZip from 'jszip';
import type { ImageSearchResult, ImageResult } from '@workspace/api-client-react';

export const exportToJSON = (results: ImageSearchResult[]) => {
  const dataStr = JSON.stringify(results, null, 2);
  const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
  const exportFileDefaultName = 'script_images.json';

  const linkElement = document.createElement('a');
  linkElement.setAttribute('href', dataUri);
  linkElement.setAttribute('download', exportFileDefaultName);
  linkElement.click();
};

export const exportToCSV = (results: ImageSearchResult[]) => {
  const rows = [
    ['Line Number', 'Line Text', 'Query', 'Image URL', 'Photographer', 'Source']
  ];

  results.forEach((result: ImageSearchResult) => {
    result.images.forEach((img: ImageResult) => {
      rows.push([
        result.lineNumber.toString(),
        `"${result.lineText.replace(/"/g, '""')}"`,
        `"${result.query.replace(/"/g, '""')}"`,
        img.url,
        `"${img.photographer}"`,
        img.source
      ]);
    });
  });

  const csvContent = "data:text/csv;charset=utf-8," + rows.map(e => e.join(",")).join("\n");
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", "script_images.csv");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export const exportToZIP = async (results: ImageSearchResult[]) => {
  const zip = new JSZip();
  
  const downloadPromises: Promise<void>[] = [];

  results.forEach(result => {
    const folder = zip.folder(`Line_${result.lineNumber}`);
    if (!folder) return;
    
    result.images.forEach((img: ImageResult, idx: number) => {
      // Fetch the image as a blob
      const promise = fetch(img.url)
        .then(response => response.blob())
        .then(blob => {
          // Extract extension from url or default to jpg
          const urlParts = img.url.split('?')[0].split('.');
          let ext = urlParts[urlParts.length - 1];
          if (!['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext.toLowerCase())) {
            ext = 'jpg';
          }
          folder.file(`image_${idx + 1}.${ext}`, blob);
        })
        .catch(err => console.error(`Failed to download image from ${img.url}`, err));
      
      downloadPromises.push(promise);
    });
  });

  await Promise.all(downloadPromises);

  const content = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(content);
  const link = document.createElement("a");
  link.href = url;
  link.download = "script_images.zip";
  link.click();
  URL.revokeObjectURL(url);
};
