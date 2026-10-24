export function attachmentGridSpec(pageWidth, pageHeight, availableWidth, availableHeight) {
  const width = Math.max(1, Number(pageWidth) || 816);
  const height = Math.max(1, Number(pageHeight) || 1056);
  const ratio = width / height;
  const columns = ratio < 0.9 ? 2 : ratio < 1.25 ? 3 : 4;
  const gridWidth = Math.min(width, Math.max(1, Number(availableWidth) || width * 0.92));
  const marginX = (width - gridWidth) / 2;
  const gridHeight = Math.min(height, Math.max(1, Number(availableHeight) || height * 0.78));
  const cellWidth = gridWidth / columns;
  const stampHeight = cellWidth * 0.92 / (480 / 143);
  const filenameHeight = Math.max(8, height * 0.012);
  const cellGap = height * 0.008;
  const rows = Math.max(2, Math.floor(gridHeight / (stampHeight + filenameHeight + cellGap)));
  return { columns, rows, capacity: columns * rows, marginX, gridWidth, gridHeight, cellWidth, cellHeight: gridHeight / rows };
}
