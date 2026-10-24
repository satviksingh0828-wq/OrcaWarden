import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { read, submit, write } from '@lacrypta/typescript-opentimestamps';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 10000);
const BUCKET = process.env.SUPABASE_OTS_BUCKET || 'orcawarden-ots';
const encryptionSecret = process.env.ORCAWARDEN_ENCRYPTION_KEY || '';
const supabaseUrl = process.env.SUPABASE_URL || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
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
function digestFromBody(value) {
  const digest = Buffer.from(String(value || ''), 'base64');
  if (digest.length !== 32) throw new Error('A SHA-256 digest is required.');
  return digest;
}
function jsonError(res, error) { return res.status(400).json({ error: error?.message || 'Request failed.' }); }

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '16kb' }));
app.get('/health', (_req, res) => {
  const configured = Boolean(supabaseUrl && serviceRoleKey && encryptionSecret.trim().length >= 8);
  res.status(configured ? 200 : 503).json({ status: configured ? 'ok' : 'misconfigured', service: 'orcawarden', encryptedStorage: configured });
});
app.post('/api/reserve-number', async (_req, res) => {
  try {
    const { data, error } = await getSupabase().rpc('reserve_orcawarden_document_number');
    if (error) throw error;
    if (!validCode(data)) throw new Error('The number reservation RPC returned an invalid number.');
    res.json({ code: data });
  } catch (error) { jsonError(res, error); }
});
app.post('/api/timestamp', async (req, res) => {
  try {
    const code = String(req.body?.code || '');
    if (!validCode(code)) throw new Error('A valid ten-digit document number is required.');
    const digest = digestFromBody(req.body?.digest);
    const { timestamp, errors } = await submit('sha256', new Uint8Array(digest));
    if (!timestamp) throw new Error(errors?.[0]?.message || 'OpenTimestamps did not return a proof.');
    const encrypted = await encryptProof(write(timestamp));
    const { error } = await getSupabase().storage.from(BUCKET).upload(`${code}.ots`, encrypted, { contentType: 'application/octet-stream', upsert: true, cacheControl: '3600' });
    if (error) throw error;
    res.json({ saved: true, code });
  } catch (error) { jsonError(res, error); }
});
app.post('/api/verify', async (req, res) => {
  try {
    const code = String(req.body?.code || '');
    if (!validCode(code)) throw new Error('A valid ten-digit document number is required.');
    const digest = digestFromBody(req.body?.digest);
    const { data, error } = await getSupabase().storage.from(BUCKET).download(`${code}.ots`);
    if (error) throw new Error('No encrypted proof was found for this document number.');
    const proof = await decryptProof(await data.arrayBuffer());
    const expected = read(new Uint8Array(proof)).fileHash.value;
    const matches = crypto.timingSafeEqual(Buffer.from(expected), digest);
    res.json({ matches });
  } catch (error) { jsonError(res, error); }
});
app.use(express.static(path.join(__dirname, 'dist')));
app.use((_req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));
app.listen(PORT, () => console.log(`OrcaWarden listening on ${PORT}`));
