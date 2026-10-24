async function postFile(path, code, file) {
  const form = new FormData();
  form.append('code', code);
  form.append('file', file, file.name || 'document');
  const response = await fetch(path, { method: 'POST', body: form });
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
  onStatus('Uploading the document securely to Render…');
  await postFile('/api/timestamp', code, file);
  onStatus('Encrypted proof saved.');
}
export async function verifyOpenTimestamp(file, code) {
  const result = await postFile('/api/verify', code, file);
  return result;
}
