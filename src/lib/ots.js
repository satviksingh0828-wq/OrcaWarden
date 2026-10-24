async function postFile(path, code, file) {
  const form = new FormData();
  form.append('code', code);
  form.append('file', file, file.name || 'document');
  const response = await fetch(path, { method: 'POST', body: form });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = String(payload.error || '');
    if (/opentimestamps/i.test(detail)) throw new Error('OrcaWarden could not complete the proof request. Please try again.');
    throw new Error(detail || 'The secure OrcaWarden request failed.');
  }
  return payload;
}

export function isTimestampStorageConfigured() {
  return true;
}
export function getTimestampStorageConfigurationError() {
  return '';
}
export async function timestampAndSave(code, file, onStatus = () => {}) {
  onStatus('Uploading the document securely to OrcaWarden…');
  await postFile('/api/timestamp', code, file);
  onStatus('Encrypted proof saved.');
}
export async function verifyOpenTimestamp(file, code) {
  const result = await postFile('/api/verify', code, file);
  return result;
}
