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

export async function exportStampedPdf(file, stampDataUrl) {
  const document = await PDFDocument.load(await file.arrayBuffer());
  const stampImage = await document.embedPng(stampDataUrl);
  const sourcePage = document.getPages()[0];
  if (!sourcePage) throw new Error('This PDF does not contain any pages.');
  const { width, height } = sourcePage.getSize();
  const cover = document.insertPage(0, [width, height]);
  const stampWidth = width * 0.36;
  const stampHeight = stampWidth * (stampImage.height / stampImage.width);
  cover.drawImage(stampImage, {
    x: (width - stampWidth) / 2,
    y: height * 0.05,
    width: stampWidth,
    height: stampHeight,
    opacity: 1,
  });
  return document.save();
}
