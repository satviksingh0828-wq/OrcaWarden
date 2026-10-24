import QRCode from 'qrcode';
import bwipjs from 'bwip-js/browser';
import { getSupabaseClient } from './supabase.js';

export async function createDocumentCode() {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase is required to reserve a globally unique document number.');
  const { data, error } = await supabase.rpc('reserve_orcawarden_document_number');
  if (error) throw new Error(`Could not reserve a unique document number: ${error.message}`);
  const code = String(data || '');
  if (!/^\d{10}$/.test(code)) throw new Error('Supabase returned an invalid document number.');
  return code;
}

function renderBarcode(options) {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    try {
      bwipjs.toCanvas(canvas, options);
      resolve(canvas);
    } catch (error) {
      reject(error);
    }
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not generate the QR code image.'));
    image.src = src;
  });
}

export async function createStamp(code) {
  if (!/^\d{10}$/.test(code)) throw new Error('Document number must contain exactly 10 digits.');
  const url = `${window.location.origin}/verify/${code}`;
  const qrDataUrl = await QRCode.toDataURL(url, {
    errorCorrectionLevel: 'M', margin: 1, width: 280,
    color: { dark: '#092c35', light: '#ffffff' },
  });
  const qr = await loadImage(qrDataUrl);
  const dataMatrix = await renderBarcode({
    bcid: 'datamatrix', text: url, scale: 5, padding: 0,
    backgroundcolor: 'FFFFFF', barcolor: '092C35',
  });
  const barcode = await renderBarcode({
    bcid: 'pdf417', text: url, scale: 3, columns: 5, eclevel: 2,
    padding: 10,
    backgroundcolor: 'FFFFFF', barcolor: '092C35',
  });

  const logicalWidth = 480;
  const logicalHeight = 143;
  const pixelRatio = 3;
  const canvas = document.createElement('canvas');
  canvas.width = logicalWidth * pixelRatio;
  canvas.height = logicalHeight * pixelRatio;
  const ctx = canvas.getContext('2d');
  ctx.scale(pixelRatio, pixelRatio);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, logicalWidth, logicalHeight);
  ctx.strokeStyle = '#123e47';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.roundRect(0.7, 0.7, logicalWidth - 1.4, logicalHeight - 1.4, 5);
  ctx.stroke();

  // QR and Data Matrix form one 144px strip (68 + 8 gap + 68).
  // The Code 128 barcode is drawn to that exact same 144px width.
  const codeX = 10;
  const codeY = 7;
  const matrixSize = 86;
  const matrixGap = 8;
  const combinedMatrixWidth = matrixSize + matrixGap + matrixSize;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(qr, codeX, codeY, matrixSize, matrixSize);
  ctx.drawImage(dataMatrix, codeX + matrixSize + matrixGap, codeY, matrixSize, matrixSize);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(barcode, codeX, 96, combinedMatrixWidth, 42);

  ctx.strokeStyle = '#c6d7da';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(202, 9);
  ctx.lineTo(202, 134);
  ctx.stroke();

  ctx.fillStyle = '#092c35';
  ctx.font = '700 18px Arial, Helvetica, sans-serif';
  ctx.fillText('Powered by OrcaWarden', 214, 32);
  ctx.fillStyle = '#166675';
  ctx.font = '700 13px Arial, Helvetica, sans-serif';
  ctx.fillText(`DocNo-${code}`, 214, 51);
  ctx.strokeStyle = '#d8e3e5';
  ctx.beginPath();
  ctx.moveTo(214, 62);
  ctx.lineTo(468, 62);
  ctx.stroke();
  ctx.font = '600 12px Arial, Helvetica, sans-serif';
  ctx.fillStyle = '#092c35';
  ctx.fillText('Secured on', 214, 80);
  const securedWidth = ctx.measureText('Secured on ').width;
  ctx.fillStyle = '#b3741d';
  ctx.fillText('Bitcoin', 214 + securedWidth, 80);
  const bitcoinWidth = ctx.measureText('Bitcoin ').width;
  ctx.fillStyle = '#092c35';
  ctx.fillText('Blockchain', 214 + securedWidth + bitcoinWidth, 80);
  ctx.fillStyle = '#698187';
  ctx.font = '8px Arial, Helvetica, sans-serif';
  ctx.letterSpacing = '1px';
  ctx.fillText('DOCUMENT AUTHENTICITY MARK', 214, 101);

  return { code, url, dataUrl: canvas.toDataURL('image/png'), width: logicalWidth, height: logicalHeight };
}
