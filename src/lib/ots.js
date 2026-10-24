import { read, submit, write } from '@lacrypta/typescript-opentimestamps';
import { getSupabaseClient, getStorageBucket } from './supabase.js';

const encryptionSecret = import.meta.env.VITE_ORCAWARDEN_ENCRYPTION_KEY || '';
const ENVELOPE_MAGIC = new TextEncoder().encode('ORCAWARDEN-ENC-V1');
const KEY_SALT = new TextEncoder().encode('orcawarden-proof-key-v1');
const MIN_KEY_LENGTH = 8;
let cryptoKeyPromise;

function toUint8Array(value) {
  return value instanceof Uint8Array ? value : new Uint8Array(value);
}
function toArrayBuffer(bytes) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}
function hasValidEncryptionKey() {
  return encryptionSecret.trim().length >= MIN_KEY_LENGTH;
}
async function getEncryptionKey() {
  if (!hasValidEncryptionKey()) throw new Error('VITE_ORCAWARDEN_ENCRYPTION_KEY must be at least 8 characters.');
  cryptoKeyPromise ||= crypto.subtle.importKey('raw', new TextEncoder().encode(encryptionSecret), 'PBKDF2', false, ['deriveKey']).then((baseKey) => crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: KEY_SALT, iterations: 310000, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  ));
  return cryptoKeyPromise;
}
async function encryptProof(blob) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await getEncryptionKey(), await blob.arrayBuffer()));
  const envelope = new Uint8Array(ENVELOPE_MAGIC.length + iv.length + ciphertext.length);
  envelope.set(ENVELOPE_MAGIC, 0);
  envelope.set(iv, ENVELOPE_MAGIC.length);
  envelope.set(ciphertext, ENVELOPE_MAGIC.length + iv.length);
  return new Blob([toArrayBuffer(envelope)], { type: 'application/octet-stream' });
}
async function decryptProof(blob) {
  const bytes = toUint8Array(await blob.arrayBuffer());
  const header = bytes.slice(0, ENVELOPE_MAGIC.length);
  if (!ENVELOPE_MAGIC.every((value, index) => value === header[index])) throw new Error('This proof is not an OrcaWarden encrypted proof.');
  const ivStart = ENVELOPE_MAGIC.length;
  const iv = bytes.slice(ivStart, ivStart + 12);
  const ciphertext = bytes.slice(ivStart + 12);
  try {
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, await getEncryptionKey(), ciphertext);
    return new Blob([plaintext], { type: 'application/vnd.opentimestamps.ots' });
  } catch {
    throw new Error('The encryption key is missing or does not match the key used for this proof.');
  }
}

export function isTimestampStorageConfigured() {
  return Boolean(getSupabaseClient()) && hasValidEncryptionKey();
}
export function getTimestampStorageConfigurationError() {
  if (!getSupabaseClient()) return 'Supabase is not configured.';
  if (!hasValidEncryptionKey()) return 'VITE_ORCAWARDEN_ENCRYPTION_KEY must be at least 8 characters.';
  return '';
}
export async function createOpenTimestamp(file, onStatus = () => {}) {
  onStatus('Hashing the document locally…');
  const bytes = toUint8Array(await file.arrayBuffer());
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  onStatus('Submitting the hash to OpenTimestamps calendars…');
  const { timestamp, errors } = await submit('sha256', digest);
  if (!timestamp) throw new Error(errors?.[0]?.message || 'OpenTimestamps calendars did not accept this document hash.');
  return new Blob([toArrayBuffer(write(timestamp))], { type: 'application/vnd.opentimestamps.ots' });
}
export async function saveOpenTimestamp(code, otsBlob) {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase is required for encrypted proof storage.');
  const encryptedProof = await encryptProof(otsBlob);
  const { error } = await supabase.storage.from(getStorageBucket()).upload(`${code}.ots`, encryptedProof, {
    contentType: 'application/octet-stream',
    upsert: true,
    cacheControl: '3600',
  });
  if (error) throw new Error(`Could not save encrypted ${code}.ots to Supabase Storage: ${error.message}`);
}
export async function timestampAndSave(code, file, onStatus = () => {}) {
  const otsBlob = await createOpenTimestamp(file, onStatus);
  onStatus('Encrypting and saving the .ots proof…');
  await saveOpenTimestamp(code, otsBlob);
  return otsBlob;
}
export async function fetchOpenTimestamp(code) {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase is required for encrypted proof storage.');
  const { data, error } = await supabase.storage.from(getStorageBucket()).download(`${code}.ots`);
  if (error) throw new Error(error.message || `No .ots proof was found for document ${code}.`);
  return decryptProof(data);
}
export async function verifyOpenTimestamp(file, otsBlob) {
  const fileBytes = toUint8Array(await file.arrayBuffer());
  const otsBytes = toUint8Array(await otsBlob.arrayBuffer());
  const expectedDigest = read(otsBytes).fileHash.value;
  const actualDigest = new Uint8Array(await crypto.subtle.digest('SHA-256', fileBytes));
  if (expectedDigest.length !== actualDigest.length) return false;
  return expectedDigest.every((byte, index) => byte === actualDigest[index]);
}
