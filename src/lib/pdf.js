import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { attachmentGridSpec } from './attachment-grid.js';

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

function drawAttachmentGridPage(page, attachments, offset, images, font, boldFont, layout) {
  const { width, height } = page.getSize();
  const { columns, rows, capacity, marginX: left, gridWidth, gridHeight } = layout;
  const top = height * 0.86;
  const cellWidth = gridWidth / columns;
  const cellHeight = gridHeight / rows;
  drawCenteredLines(page, ['Attachments Stamps'], boldFont, Math.min(16.5, width * 0.03), height * 0.95, 20);
  drawCenteredLines(page, ['Kindly verify all attachments against their respective stamps only.'], font, Math.min(8.5, width * 0.015), height * 0.91, 10);
  attachments.slice(offset, offset + capacity).forEach((attachment, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const cellLeft = left + column * cellWidth;
    const cellTop = top - row * cellHeight;
    const image = images.get(attachment.id);
    if (!image) return;
    const maxWidth = cellWidth * 0.98;
    const maxHeight = cellHeight * 0.80;
    const scale = Math.min(maxWidth / image.width, maxHeight / image.height);
    const drawWidth = image.width * scale;
    const drawHeight = image.height * scale;
    const imageY = cellTop - cellHeight * 0.04 - drawHeight;
    page.drawImage(image, {
      x: cellLeft + (cellWidth - drawWidth) / 2,
      y: imageY,
      width: drawWidth,
      height: drawHeight,
    });
    const originalName = pdfText(attachment.fileName || 'Attachment');
    const maxNameWidth = cellWidth * 0.94;
    let name = originalName;
    while (name.length && font.widthOfTextAtSize(name, 8) > maxNameWidth) name = name.slice(0, -1);
    if (name !== originalName) {
      while (name.length && font.widthOfTextAtSize(`${name}...`, 8) > maxNameWidth) name = name.slice(0, -1);
      name = `${name}...`;
    }
    const lineWidth = font.widthOfTextAtSize(name, 8);
    page.drawText(name, { x: cellLeft + (cellWidth - lineWidth) / 2, y: imageY - 10, size: 8, font });
  });
}

export async function exportStampedPdf(file, stampDataUrl, coverTitle, coverBody, attachments = []) {
  const document = await PDFDocument.load(await file.arrayBuffer());
  const stampImage = await document.embedPng(stampDataUrl);
  const sourcePage = document.getPages()[0];
  if (!sourcePage) throw new Error('This PDF does not contain any pages.');
  const { width, height } = sourcePage.getSize();
  const attachmentLayout = attachmentGridSpec(width, height);
  const regularFont = await document.embedFont(StandardFonts.Helvetica);
  const boldFont = await document.embedFont(StandardFonts.HelveticaBold);
  const cover = document.insertPage(0, [width, height]);
  const titleSize = Math.min(22.5, width * 0.0367);
  const bodySize = Math.min(11.25, width * 0.0184);
  const titleLines = wrapText(coverTitle || file.name.replace(/\.[^.]+$/, ''), boldFont, titleSize, width * 0.80).slice(0, 3);
  drawCenteredLines(cover, titleLines, boldFont, titleSize, height * 0.64, titleSize * 1.2);
  const bodyLines = wrapText(coverBody, regularFont, bodySize, width * 0.80).slice(0, 6);
  drawCenteredLines(cover, bodyLines, regularFont, bodySize, height * 0.58, bodySize * 1.5);
  const stampWidth = width * 0.44;
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
  for (let offset = 0; offset < attachments.length; offset += attachmentLayout.capacity) {
    const appendix = document.addPage([width, height]);
    drawAttachmentGridPage(appendix, attachments, offset, attachmentImages, regularFont, boldFont, attachmentLayout);
  }
  return document.save();
}
