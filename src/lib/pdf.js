import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { PDFDocument } from 'pdf-lib';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export async function previewPdf(file, onProgress = () => {}) {
  const bytes = await file.arrayBuffer();
  const loading = pdfjs.getDocument({ data: bytes });
  const pdf = await loading.promise;
  const pages = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1.1 });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { alpha: false });
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    await page.render({ canvasContext: context, viewport }).promise;
    pages.push({
      number: pageNumber,
      width: viewport.width,
      height: viewport.height,
      dataUrl: canvas.toDataURL('image/jpeg', 0.88),
    });
    onProgress(pageNumber, pdf.numPages);
  }
  return pages;
}

export async function exportStampedPdf(file, stampDataUrl, position) {
  const document = await PDFDocument.load(await file.arrayBuffer());
  const stampImage = await document.embedPng(stampDataUrl);
  for (const page of document.getPages()) {
    const { width, height } = page.getSize();
    const stampWidth = width * 0.36;
    const stampHeight = stampWidth * (stampImage.height / stampImage.width);
    const topX = Math.min(Math.max(position.x, 0), 1 - 0.36);
    const topY = Math.min(Math.max(position.y, 0), 1 - (stampHeight / height));
    page.drawImage(stampImage, {
      x: topX * width,
      y: height - (topY * height) - stampHeight,
      width: stampWidth,
      height: stampHeight,
      opacity: 1,
    });
  }
  return document.save();
}
