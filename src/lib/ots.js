import { read, submit, write } from '@lacrypta/typescript-opentimestamps';
import { getSupabaseClient, getStorageBucket } from './supabase.js';

function toUint8Array(value) {
  return value instanceof Uint8Array ? value : new Uint8Array(value);
}

function toArrayBuffer(bytes) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

export function isTimestampStorageConfigured() {
  return Boolean(getSupabaseClient());
}

export async function createOpenTimestamp(file, onStatus = () => {}) {
  onStatus('Hashing the document locally…');
  const bytes = toUint8Array(await file.arrayBuffer());
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  onStatus('Submitting the hash to OpenTimestamps calendars…');
  const { timestamp, errors } = await submit('sha256', digest);
  if (!timestamp) throw new Error(errors?.[0]?.message || 'OpenTimestamps calendars did not accept this document hash.');
  return new Blob([toArrayBuffer(write(timestamp))], {
    type: 'application/vnd.opentimestamps.ots',
  });
}

export async function saveOpenTimestamp(code, otsBlob) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error('Timestamp storage is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
  }
  const bucket = getStorageBucket();
  const { error } = await supabase.storage.from(bucket).upload(`${code}.ots`, otsBlob, {
    contentType: 'application/vnd.opentimestamps.ots',
    upsert: true,
    cacheControl: '3600',
  });
  if (error) throw new Error(`Could not save ${code}.ots to Supabase Storage: ${error.message}`);
}

export async function timestampAndSave(code, file, onStatus = () => {}) {
  const otsBlob = await createOpenTimestamp(file, onStatus);
  onStatus('Saving the .ots proof…');
  await saveOpenTimestamp(code, otsBlob);
  return otsBlob;
}

export async function fetchOpenTimestamp(code) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error('Timestamp storage is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
  }
  const { data, error } = await supabase.storage.from(getStorageBucket()).download(`${code}.ots`);
  if (error) throw new Error(error.message || `No .ots proof was found for document ${code}.`);
  return data;
}

export async function verifyOpenTimestamp(file, otsBlob) {
  const fileBytes = toUint8Array(await file.arrayBuffer());
  const otsBytes = toUint8Array(await otsBlob.arrayBuffer());
  const expectedDigest = read(otsBytes).fileHash.value;
  const actualDigest = new Uint8Array(await crypto.subtle.digest('SHA-256', fileBytes));
  if (expectedDigest.length !== actualDigest.length) return false;
  return expectedDigest.every((byte, index) => byte === actualDigest[index]);
}
