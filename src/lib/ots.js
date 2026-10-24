function toUint8Array(value) {
  return value instanceof Uint8Array ? value : new Uint8Array(value);
}
function toBase64(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
async function digestFile(file) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', toUint8Array(await file.arrayBuffer())));
}
async function postJson(path, body) {
  const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'The secure Render API request failed.');
  return payload;
}

export function isTimestampStorageConfigured() {
  return true;
}
export function getTimestampStorageConfigurationError() {
  return '';
}
export async function timestampAndSave(code, file, onStatus = () => {}) {
  onStatus('Hashing the document locally…');
  const digest = await digestFile(file);
  onStatus('Submitting the hash to OpenTimestamps and encrypting the proof…');
  await postJson('/api/timestamp', { code, digest: toBase64(digest) });
  onStatus('Encrypted proof saved.');
}
export async function verifyOpenTimestamp(file, code) {
  const digest = await digestFile(file);
  const result = await postJson('/api/verify', { code, digest: toBase64(digest) });
  return Boolean(result.matches);
}
