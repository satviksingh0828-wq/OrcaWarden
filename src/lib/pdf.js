import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { PDFDocument, StandardFonts } from 'pdf-lib';

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

function pdfText(value) {
  return String(value || '').normalize('NFKD').replace(/[^\x20-\xFF]/g, '?');
}

function wrapText(text, font, size, maxWidth) {
  const lines = [];
  for (const paragraph of pdfText(text).split(/\r?\n/)) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && font.widthOfTextAtSize(candidate, size) > maxWidth) {
        lines.push(line);
        line = word;
      } else line = candidate;
    }
    if (line) lines.push(line);
  }
  return lines;
}

function drawCenteredLines(page, lines, font, size, centerY, lineGap) {
  const { width } = page.getSize();
  const totalHeight = (lines.length - 1) * lineGap;
  lines.forEach((line, index) => {
    const textWidth = font.widthOfTextAtSize(line, size);
    page.drawText(line, { x: (width - textWidth) / 2, y: centerY + totalHeight / 2 - index * lineGap, size, font });
  });
}

function drawAttachmentGridPage(page, attachments, offset, images, font, boldFont) {
  const { width, height } = page.getSize();
  const left = width * 0.04;
  const top = height * 0.88;
  const gridWidth = width - left * 2;
  const gridHeight = height * 0.80;
  const cellWidth = gridWidth / 4;
  const cellHeight = gridHeight / 4;
  drawCenteredLines(page, ['Attachments'], boldFont, Math.min(22, width * 0.04), height * 0.93, 24);
  attachments.slice(offset, offset + 16).forEach((attachment, index) => {
    const column = index % 4;
    const row = Math.floor(index / 4);
    const cellLeft = left + column * cellWidth;
    const cellTop = top - row * cellHeight;
    const name = pdfText(attachment.fileName || 'Attachment');
    const nameLines = wrapText(name, font, 8, cellWidth * 0.90).slice(0, 3);
    nameLines.forEach((line, lineIndex) => {
      const lineWidth = font.widthOfTextAtSize(line, 8);
      page.drawText(line, { x: cellLeft + (cellWidth - lineWidth) / 2, y: cellTop - 15 - lineIndex * 10, size: 8, font });
    });
    const image = images.get(attachment.id);
    if (!image) return;
    const maxWidth = cellWidth * 0.88;
    const maxHeight = cellHeight * 0.48;
    const scale = Math.min(maxWidth / image.width, maxHeight / image.height);
    const drawWidth = image.width * scale;
    const drawHeight = image.height * scale;
    page.drawImage(image, {
      x: cellLeft + (cellWidth - drawWidth) / 2,
      y: cellTop - cellHeight + cellHeight * 0.10,
      width: drawWidth,
      height: drawHeight,
    });
  });
}

export async function exportStampedPdf(file, stampDataUrl, coverTitle, coverBody, attachments = []) {
  const document = await PDFDocument.load(await file.arrayBuffer());
  const stampImage = await document.embedPng(stampDataUrl);
  const sourcePage = document.getPages()[0];
  if (!sourcePage) throw new Error('This PDF does not contain any pages.');
  const { width, height } = sourcePage.getSize();
  const regularFont = await document.embedFont(StandardFonts.Helvetica);
  const boldFont = await document.embedFont(StandardFonts.HelveticaBold);
  const cover = document.insertPage(0, [width, height]);
  const titleLines = wrapText(coverTitle || file.name.replace(/\.[^.]+$/, ''), boldFont, Math.min(30, width * 0.055), width * 0.78).slice(0, 3);
  drawCenteredLines(cover, titleLines, boldFont, Math.min(30, width * 0.055), height * 0.64, Math.min(36, width * 0.065));
  const bodyLines = wrapText(coverBody, regularFont, Math.min(15, width * 0.028), width * 0.72).slice(0, 6);
  drawCenteredLines(cover, bodyLines, regularFont, Math.min(15, width * 0.028), height * 0.52, Math.min(21, width * 0.038));
  const stampWidth = width * 0.36;
  const stampHeight = stampWidth * (stampImage.height / stampImage.width);
  cover.drawImage(stampImage, {
    x: (width - stampWidth) / 2,
    y: height * 0.05,
    width: stampWidth,
    height: stampHeight,
    opacity: 1,
  });
  const attachmentImages = new Map();
  for (const attachment of attachments) {
    if (attachment.stamp?.dataUrl) attachmentImages.set(attachment.id, await document.embedPng(attachment.stamp.dataUrl));
  }
  for (let offset = 0; offset < attachments.length; offset += 16) {
    const appendix = document.addPage([width, height]);
    drawAttachmentGridPage(appendix, attachments, offset, attachmentImages, regularFont, boldFont);
  }
  return document.save();
}
