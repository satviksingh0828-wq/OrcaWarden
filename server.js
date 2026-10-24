import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import multer from 'multer';
import { read, submit, verify, verifiers, write } from '@lacrypta/typescript-opentimestamps';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 10000);
const BUCKET = process.env.SUPABASE_OTS_BUCKET || 'orcawarden-ots';
const encryptionSecret = process.env.ORCAWARDEN_ENCRYPTION_KEY || '';
const supabaseUrl = process.env.SUPABASE_URL || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const totpSecret = process.env.ORCAWARDEN_TOTP_SECRET || '';
const sessionSecret = process.env.ORCAWARDEN_SESSION_SECRET || '';
const MAGIC = Buffer.from('ORCAWARDEN-ENC-V1');
const SALT = Buffer.from('orcawarden-proof-key-v1');
let encryptionKeyPromise;

function requireConfig() {
  if (!supabaseUrl || !serviceRoleKey) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
  if (encryptionSecret.trim().length < 8) throw new Error('ORCAWARDEN_ENCRYPTION_KEY must be at least 8 characters.');
}
function getSupabase() {
  requireConfig();
  return createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
}
async function getEncryptionKey() {
  requireConfig();
  encryptionKeyPromise ||= new Promise((resolve, reject) => {
    crypto.scrypt(encryptionSecret, SALT, 32, { N: 16384, r: 8, p: 1 }, (error, key) => error ? reject(error) : resolve(key));
  });
  return encryptionKeyPromise;
}
async function encryptProof(bytes) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', await getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(Buffer.from(bytes)), cipher.final()]);
  return Buffer.concat([MAGIC, iv, cipher.getAuthTag(), ciphertext]);
}
async function decryptProof(bytes) {
  const value = Buffer.from(bytes);
  if (!value.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('Invalid encrypted proof envelope.');
  const ivStart = MAGIC.length;
  const iv = value.subarray(ivStart, ivStart + 12);
  const tag = value.subarray(ivStart + 12, ivStart + 28);
  const ciphertext = value.subarray(ivStart + 28);
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', await getEncryptionKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    throw new Error('The configured encryption key cannot decrypt this proof.');
  }
}
function validCode(code) { return /^\d{10}$/.test(String(code || '')); }
function jsonError(res, error) { return res.status(400).json({ error: error?.message || 'Request failed.' }); }
function cookieValue(req, name) { return String(req.headers.cookie || '').split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1) || ''; }
function hasValidSession(req) {
  if (sessionSecret.length < 32) return false;
  const [payload, signature] = cookieValue(req, 'ow_session').split('.');
  if (!payload || !signature) return false;
  const expected = crypto.createHmac('sha256', sessionSecret).update(payload).digest('base64url');
  const a = Buffer.from(signature); const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  try { return JSON.parse(Buffer.from(payload, 'base64url').toString()).exp > Date.now(); } catch { return false; }
}
function requireAuth(req, res, next) {
  if (hasValidSession(req)) return next();
  return res.status(401).json({ error: 'Authenticator code required.' });
}
function decodeBase32(secret) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const char of secret.toUpperCase().replace(/=+$/, '')) {
    const digit = alphabet.indexOf(char);
    if (digit < 0) throw new Error('Invalid authenticator secret configuration.');
    bits += digit.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}
function validTotp(code) {
  if (!totpSecret || !/^[0-9]{6}$/.test(String(code || ''))) return false;
  const key = decodeBase32(totpSecret);
  const time = Math.floor(Date.now() / 30_000);
  for (let delta = -1; delta <= 1; delta += 1) {
    const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(time + delta));
    const digest = crypto.createHmac('sha1', key).update(counter).digest();
    const offset = digest[digest.length - 1] & 15;
    const value = (((digest[offset] & 127) << 24) | ((digest[offset + 1] & 255) << 16) | ((digest[offset + 2] & 255) << 8) | (digest[offset + 3] & 255)) % 1_000_000;
    if (crypto.timingSafeEqual(Buffer.from(String(value).padStart(6, '0')), Buffer.from(String(code)))) return true;
  }
  return false;
}

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 40 * 1024 * 1024, files: 1 } });
const requestWindows = new Map();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cache-Control': req.path.startsWith('/api/') ? 'no-store' : 'no-cache',
  });
  if (req.secure) res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});
app.use('/api', (req, res, next) => {
  const now = Date.now();
  const key = req.ip || req.socket.remoteAddress || 'unknown';
  let window = requestWindows.get(key);
  if (!window || now - window.startedAt > 60_000) window = { startedAt: now, count: 0 };
  window.count += 1;
  requestWindows.set(key, window);
  if (requestWindows.size > 10_000) {
    for (const [ip, item] of requestWindows) if (now - item.startedAt > 60_000) requestWindows.delete(ip);
  }
  if (window.count > 60) return res.status(429).json({ error: 'Too many requests. Please try again shortly.' });
  next();
});
app.use(express.json({ limit: '16kb' }));
app.get('/health', (_req, res) => {
  const configured = Boolean(supabaseUrl && serviceRoleKey && encryptionSecret.trim().length >= 8 && totpSecret && sessionSecret.length >= 32);
  res.status(configured ? 200 : 503).json({ status: configured ? 'ok' : 'misconfigured', service: 'orcawarden', encryptedStorage: configured });
});
app.get('/api/auth/status', (req, res) => res.json({ configured: Boolean(totpSecret && sessionSecret.length >= 32), authenticated: hasValidSession(req) }));
const loginWindows = new Map();
app.post('/api/auth/login', (req, res) => {
  const now = Date.now(); const ip = req.ip || req.socket.remoteAddress || 'unknown';
  let attempts = loginWindows.get(ip);
  if (!attempts || now - attempts.startedAt > 5 * 60_000) attempts = { startedAt: now, count: 0 };
  attempts.count += 1; loginWindows.set(ip, attempts);
  if (attempts.count > 5) return res.status(429).json({ error: 'Too many authenticator attempts. Try again in five minutes.' });
  if (!totpSecret || sessionSecret.length < 32) return res.status(503).json({ error: 'Authenticator login is not configured on the server.' });
  if (!validTotp(req.body?.code)) return res.status(401).json({ error: 'That authenticator code is invalid or expired.' });
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + 8 * 60 * 60 * 1000 })).toString('base64url');
  const signature = crypto.createHmac('sha256', sessionSecret).update(payload).digest('base64url');
  res.setHeader('Set-Cookie', `ow_session=${payload}.${signature}; Path=/; HttpOnly; Secure; SameSite=Strict`);
  res.json({ authenticated: true });
});
app.post('/api/auth/logout', (_req, res) => {
  res.setHeader('Set-Cookie', 'ow_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0');
  res.json({ authenticated: false });
});
app.post('/api/reserve-number', requireAuth, async (_req, res) => {
  try {
    const { data, error } = await getSupabase().rpc('reserve_orcawarden_document_number');
    if (error) throw error;
    if (!validCode(data)) throw new Error('The number reservation RPC returned an invalid number.');
    res.json({ code: data });
  } catch (error) { jsonError(res, error); }
});
app.post('/api/timestamp', requireAuth, upload.single('file'), async (req, res) => {
  try {
    const code = String(req.body?.code || '');
    if (!validCode(code)) throw new Error('A valid ten-digit document number is required.');
    if (!req.file?.buffer?.length) throw new Error('A document file is required.');
    const digest = crypto.createHash('sha256').update(req.file.buffer).digest();
    const { timestamp, errors } = await submit('sha256', new Uint8Array(digest));
    if (!timestamp) throw new Error(errors?.[0]?.message || 'OpenTimestamps did not return a proof.');
    const encrypted = await encryptProof(write(timestamp));
    const { error } = await getSupabase().storage.from(BUCKET).upload(`${code}.ots`, encrypted, { contentType: 'application/octet-stream', upsert: true, cacheControl: '3600' });
    if (error) throw error;
    res.json({ saved: true, code });
  } catch (error) { jsonError(res, error); }
});
app.post('/api/verify', upload.single('file'), async (req, res) => {
  try {
    const code = String(req.body?.code || '');
    if (!validCode(code)) throw new Error('A valid ten-digit document number is required.');
    if (!req.file?.buffer?.length) throw new Error('A document file is required.');
    const digest = crypto.createHash('sha256').update(req.file.buffer).digest();
    const { data, error } = await getSupabase().storage.from(BUCKET).download(`${code}.ots`);
    if (error) throw new Error('No encrypted proof was found for this document number.');
    const proof = await decryptProof(await data.arrayBuffer());
    const timestamp = read(new Uint8Array(proof));
    const expected = timestamp.fileHash.value;
    const expectedBuffer = Buffer.from(expected);
    const matches = expectedBuffer.length === digest.length && crypto.timingSafeEqual(expectedBuffer, digest);
    if (!matches) return res.json({ matches: false, blockchainVerified: false, status: 'document-mismatch' });
    const blockchain = await verify(timestamp, verifiers);
    const attestations = blockchain.attestations || {};
    const blockchainVerified = Object.keys(attestations).length > 0;
    res.json({ matches: true, blockchainVerified, status: blockchainVerified ? 'bitcoin-confirmed' : 'pending-calendar', attestations });
  } catch (error) { jsonError(res, error); }
});
app.use(express.static(path.join(__dirname, 'dist')));
app.use((_req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));
app.listen(PORT);
