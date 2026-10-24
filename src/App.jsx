import React, { useEffect, useRef, useState } from 'react';
import { Route, Switch } from 'wouter';
import { ArrowDownToLine, BadgeCheck, Bitcoin, CircleAlert, FileText, LockKeyhole, Upload, X } from 'lucide-react';
import { createDocumentCode, createStamp } from './lib/stamp.js';
import { exportStampedPdf, previewPdf } from './lib/pdf.js';
import { exportStampedDocx, previewDocx } from './lib/docx.js';
import { attachmentGridSpec } from './lib/attachment-grid.js';
import { getTimestampStorageConfigurationError, isTimestampStorageConfigured, timestampAndSave, verifyOpenTimestamp } from './lib/ots.js';

const MAX_FILE_BYTES = 40 * 1024 * 1024;
const DEFAULT_COVER_BODY = 'This document and all its attachments are being stamped and secured on the Bitcoin blockchain. Kindly verify the integrity of the documents before use.';
function fileKind(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith('.pdf') || file.type === 'application/pdf') return 'pdf';
  if (name.endsWith('.docx') || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'docx';
  return null;
}

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30000);
}

function VerifyPage({ code }) {
  const valid = /^\d{10}$/.test(code || '');
  const [candidate, setCandidate] = useState(null);
  const [state, setState] = useState('idle');
  const [message, setMessage] = useState('');
  const [verificationLog, setVerificationLog] = useState([]);

  async function verifyFile() {
    if (!candidate || state === 'checking') return;
    setState('checking');
    setMessage('Uploading the document securely and checking the stored OrcaWarden proof…');
    try {
      const result = await verifyOpenTimestamp(candidate, code);
      const attestations = result.attestations || {};
      setVerificationLog(Object.entries(attestations).flatMap(([calendar, entries]) =>
        (Array.isArray(entries) ? entries : [entries]).map((entry) => ({
          source: 'OrcaWarden',
          status: result.blockchainVerified ? 'Bitcoin blockchain attestation verified' : 'Proof submitted; awaiting Bitcoin confirmation',
          detail: entry?.height ? `Bitcoin block ${entry.height}` : calendar.replace(/https?:\/\//, '').split('/')[0],
        })),
      ));
      setState(result.matches ? (result.blockchainVerified ? 'confirmed' : 'pending') : 'invalid');
      setMessage(!result.matches
        ? 'The uploaded document does not match the OrcaWarden proof saved for this document number.'
        : result.blockchainVerified
          ? 'The uploaded document matches the OrcaWarden proof and the proof is confirmed in the Bitcoin blockchain.'
          : 'The uploaded document matches the OrcaWarden proof, but the proof is still waiting for Bitcoin blockchain confirmation.');
    } catch (reason) {
      setState('error');
      setMessage(reason?.message || 'The proof could not be checked.');
    }
  }

  return <div className="app-shell">
    <main className="verify-shell">
      <div className="verify-card">
        <p className="eyebrow">ORCAWARDEN DOCUMENT CODE</p>
        <h1>{valid ? 'Code link opened' : 'Invalid document code'}</h1>
        {valid ? <>
          <div className="verify-number">{code}</div>
          <p className="verify-copy">Upload a document to check its OrcaWarden proof against Bitcoin blockchain attestations.</p>
          <label className="verify-dropzone"> <Upload size={24} /><strong>{candidate ? candidate.name : 'Choose a document file'}</strong><span>{candidate ? 'Click to replace the selected file' : 'PDF or Word (.docx), up to 40 MB'}</span><input className="sr-only" type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(event) => { setCandidate(event.target.files?.[0] || null); setState('idle'); setMessage(''); }} /></label>
          <button className="button button-primary verify-button" disabled={!candidate || state === 'checking' || !isTimestampStorageConfigured()} onClick={verifyFile}>{state === 'checking' ? <><span className="spinner" /> Checking with OrcaWarden…</> : 'Verify document'}</button>
          {!isTimestampStorageConfigured() && <p className="verify-copy verify-config-note">{getTimestampStorageConfigurationError()}</p>}
          {message && <div className={`verify-note ${state === 'confirmed' ? 'verify-note-success' : state === 'pending' ? 'verify-note-pending' : state === 'invalid' || state === 'error' ? 'verify-note-error' : ''}`}>{message}</div>}
          {verificationLog.length > 0 && <section className="verification-log" aria-live="polite"><h2>OrcaWarden verification log</h2>{verificationLog.map((entry, index) => <div className="verification-log-row" key={`${entry.detail}-${index}`}><strong>{entry.source}</strong><span>{entry.status}</span><small>{entry.detail}</small></div>)}</section>}
        </> : <p className="verify-copy">The link must contain one 10-digit document number.</p>}
      </div>
    </main>
  </div>;
}

function PageCard({ page, index, stamp, coverTitle, setCoverTitle, coverBody, setCoverBody }) {
  const isPdf = Boolean(page.dataUrl);
  return <div className="page-card">
    <div className="page-canvas">
      {page.cover ? <div className="cover-page" style={{ aspectRatio: `${page.width || 816} / ${page.height || 1056}` }}>
        <div className="cover-copy">
          <input className="cover-title" aria-label="Cover heading" value={coverTitle} onChange={(event) => setCoverTitle(event.target.value)} />
          <textarea className="cover-body" aria-label="Cover message" value={coverBody} onChange={(event) => setCoverBody(event.target.value)} rows={4} />
        </div>
        {stamp && <img className="cover-stamp" src={stamp.dataUrl} alt="OrcaWarden document stamp" draggable="false" />}
      </div> : isPdf ? <img className="pdf-page-image" src={page.dataUrl} alt={`Preview of page ${index + 1}`} /> : page.element}
    </div>
  </div>;
}

function AttachmentGridPage({ attachments, index, onRename, gridSpec, pageSize }) {
  return <div className="page-card attachment-page-card">
    <div className="attachment-sheet" style={{ aspectRatio: `${pageSize.width} / ${pageSize.height}`, paddingLeft: `${gridSpec.marginX / pageSize.width * 100}%`, paddingRight: `${gridSpec.marginX / pageSize.width * 100}%` }}>
      <h2>Attachments Stamps</h2>
      <p>Kindly verify all attachments against their respective stamps only.</p>
      <div className="attachment-grid" style={{ gridTemplateColumns: `repeat(${gridSpec.columns}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${gridSpec.rows}, minmax(0, 1fr))` }}>
        {attachments.slice(index * gridSpec.capacity, (index + 1) * gridSpec.capacity).map((attachment) => <div className="attachment-tile" key={attachment.id}>
          {attachment.stamp && <img src={attachment.stamp.dataUrl} alt={`Stamp for ${attachment.fileName}`} />}
          <input aria-label="Attachment file name" value={attachment.fileName} onChange={(event) => onRename(attachment.id, event.target.value)} />
        </div>)}
      </div>
    </div>
  </div>;
}

function HomePage() {
  const inputRef = useRef(null);
  const attachmentInputRef = useRef(null);
  const wordPreviewRef = useRef(null);
  const [file, setFile] = useState(null);
  const [kind, setKind] = useState(null);
  const [pages, setPages] = useState([]);
  const [stamp, setStamp] = useState(null);
  const [attachments, setAttachments] = useState([]);
  const [attachmentPageSize, setAttachmentPageSize] = useState({ width: 816, height: 1056 });
  const [coverTitle, setCoverTitle] = useState('');
  const [coverBody, setCoverBody] = useState(DEFAULT_COVER_BODY);
  const [attachmentsBusy, setAttachmentsBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [timestampProgress, setTimestampProgress] = useState({ current: 0, total: 0, label: '', status: '' });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!file || !kind) return;
      setLoading(true);
      setPages([]);
      setStamp(null);
      setError('');
      setNotice('');
      try {
        const code = await createDocumentCode();
        const newStamp = await createStamp(code);
        if (cancelled) return;
        setStamp(newStamp);
        if (kind === 'pdf') {
          const previews = await previewPdf(file, (current, total) => setProgress({ current, total }));
          if (!cancelled) {
            if (previews[0]) setAttachmentPageSize({ width: previews[0].width, height: previews[0].height });
            setPages([{ id: 'cover', cover: true, width: previews[0]?.width, height: previews[0]?.height }, ...previews.map((page) => ({ ...page, id: `pdf-${page.number}` }))]);
            setProgress({ current: previews.length, total: previews.length });
          }
        } else {
          const container = wordPreviewRef.current;
          if (!container) throw new Error('The Word preview could not be opened. Please try again.');
          await previewDocx(file, container);
          if (cancelled) return;
          const pageNodes = [...container.querySelectorAll('.docx-wrapper section.docx, section.docx')];
          if (!pageNodes.length) throw new Error('No pages were found in this Word file. Try saving it as a .docx document and upload it again.');
          const appendixPageNode = pageNodes.at(-1);
          const pageRect = appendixPageNode.getBoundingClientRect();
          const pageStyle = window.getComputedStyle(appendixPageNode);
          const horizontalPadding = parseFloat(pageStyle.paddingLeft || '0') + parseFloat(pageStyle.paddingRight || '0');
          const verticalPadding = parseFloat(pageStyle.paddingTop || '0') + parseFloat(pageStyle.paddingBottom || '0');
          if (pageRect.width && pageRect.height) setAttachmentPageSize({
            width: pageRect.width,
            height: pageRect.height,
            contentWidth: pageRect.width - horizontalPadding,
            contentHeight: pageRect.height - verticalPadding,
          });
          pageNodes.forEach((element, index) => { element.dataset.owPage = String(index); });
          setPages(pageNodes.map((element, index) => ({ id: `docx-${index}`, element, number: index + 1 })));
        }
      } catch (reason) {
        if (!cancelled) {
          setError(reason?.message || 'This file could not be opened. Try another PDF or Word document.');
          setPages([]);
          setStamp(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [file, kind]);

  async function acceptFile(candidate) {
    if (!candidate) return;
    setError('');
    setNotice('');
    if (candidate.size > MAX_FILE_BYTES) {
      setError('This file is larger than 40 MB. Choose a smaller document.');
      return;
    }
    const detected = fileKind(candidate);
    if (!detected) {
      setError('Choose a PDF or a modern Word .docx document. Legacy .doc files are not supported.');
      return;
    }
    setFile(candidate);
    setKind(detected);
    setCoverTitle(candidate.name.replace(/\.[^.]+$/, ''));
    setCoverBody(DEFAULT_COVER_BODY);
    setAttachments([]);
    setPages([]);
    setProgress({ current: 0, total: 0 });
    setTimestampProgress({ current: 0, total: 0, label: '', status: '' });
  }

  async function addAttachments(fileList) {
    const selected = [...(fileList || [])];
    if (!selected.length) return;
    setAttachmentsBusy(true);
    setError('');
    try {
      const prepared = await Promise.all(selected.map(async (attachmentFile) => {
        const code = await createDocumentCode();
        const attachmentStamp = await createStamp(code);
        return { id: crypto.randomUUID(), fileName: attachmentFile.name, sourceFile: attachmentFile, stamp: attachmentStamp };
      }));
      setAttachments((current) => [...current, ...prepared]);
    } catch (reason) {
      setError(reason?.message || 'A stamp could not be created for one of the attachments.');
    } finally {
      setAttachmentsBusy(false);
      if (attachmentInputRef.current) attachmentInputRef.current.value = '';
    }
  }

  function renameAttachment(id, fileName) {
    setAttachments((current) => current.map((attachment) => attachment.id === id ? { ...attachment, fileName } : attachment));
  }

  async function createDownload() {
    if (!file || !stamp || busy) return;
    if (!isTimestampStorageConfigured()) {
      setError(`${getTimestampStorageConfigurationError()} Add the required environment variables, then rebuild the app.`);
      return;
    }
    setBusy(true);
    setError('');
    setNotice('Preparing your stamped file…');
    try {
      let output;
      let outputName;
      if (kind === 'pdf') {
        const bytes = await exportStampedPdf(file, stamp.dataUrl, coverTitle, coverBody, attachments);
        output = new Blob([bytes], { type: 'application/pdf' });
        outputName = file.name.replace(/\.pdf$/i, '') + '-orcawarden.pdf';
      } else {
        output = await exportStampedDocx(file, stamp, coverTitle, coverBody, attachments);
        outputName = file.name.replace(/\.docx$/i, '') + '-orcawarden.docx';
      }
      downloadBlob(output, outputName);
      const jobs = [{ code: stamp.code, file: output, label: 'Main document' }, ...attachments.filter((item) => item.sourceFile).map((item) => ({ code: item.stamp.code, file: item.sourceFile, label: item.fileName }))];
      setTimestampProgress({ current: 0, total: jobs.length, label: '', status: 'Starting OpenTimestamps…' });
      for (let index = 0; index < jobs.length; index += 1) {
        const job = jobs[index];
        setTimestampProgress({ current: index, total: jobs.length, label: job.label, status: 'Hashing and submitting…' });
        await timestampAndSave(job.code, job.file, (status) => setTimestampProgress({ current: index, total: jobs.length, label: job.label, status }));
        setTimestampProgress({ current: index + 1, total: jobs.length, label: job.label, status: 'Saved' });
      }
      setNotice(`Stamped copy downloaded and ${jobs.length} OpenTimestamps proof${jobs.length === 1 ? '' : 's'} saved.`);
    } catch (reason) {
      setError(reason?.message || 'The stamped file could not be created. Try another document or position.');
      setNotice('');
    } finally {
      setBusy(false);
    }
  }

  function clearFile() {
    setFile(null);
    setKind(null);
    setPages([]);
    setStamp(null);
    setAttachments([]);
    setCoverTitle('');
    setCoverBody(DEFAULT_COVER_BODY);
    setError('');
    setNotice('');
    setTimestampProgress({ current: 0, total: 0, label: '', status: '' });
    if (inputRef.current) inputRef.current.value = '';
    if (wordPreviewRef.current) wordPreviewRef.current.innerHTML = '';
  }

  const gridSpec = attachmentGridSpec(
    attachmentPageSize.width,
    attachmentPageSize.height,
    attachmentPageSize.contentWidth,
    attachmentPageSize.contentHeight ? attachmentPageSize.contentHeight - attachmentPageSize.height * 0.113 : undefined,
  );
  const attachmentPageCount = Math.ceil(attachments.length / gridSpec.capacity);
  const totalPreviewPages = pages.length + (kind === 'docx' ? 1 : 0) + attachmentPageCount;

  return <div className="app-shell">
    <main className="workspace">
      {!file ? <section className={`upload-panel ${dragging ? 'is-dragging' : ''}`} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false); }} onDrop={(event) => { event.preventDefault(); setDragging(false); acceptFile(event.dataTransfer.files?.[0]); }}>
        <h2>Choose a document to stamp</h2>
        <p>PDF or Word (.docx), up to 40 MB</p>
        <button className="button button-primary" onClick={() => inputRef.current?.click()}>Select a file</button>
        <span className="drop-hint">or drag and drop it here</span>
        <input ref={inputRef} className="sr-only" type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(event) => acceptFile(event.target.files?.[0])} />
        <div className="upload-foot">File contents are not uploaded or stored</div>
      </section> : <section className="editor-layout">
        <aside className="control-rail">
          <div className="file-chip"><div className="file-icon"><FileText size={18} /></div><div className="file-name-wrap"><strong title={file.name}>{file.name}</strong><span>{kind === 'pdf' ? 'PDF DOCUMENT' : 'WORD DOCUMENT'} · {(file.size / (1024 * 1024)).toFixed(1)} MB</span></div><button className="icon-button" aria-label="Remove file" onClick={clearFile}><X size={16} /></button></div>
          <div className="rail-section attachments-section">
            <p className="section-kicker">ATTACHMENTS</p>
            <button className="button button-secondary attachment-upload-button" disabled={attachmentsBusy} onClick={() => attachmentInputRef.current?.click()}>{attachmentsBusy ? 'Creating stamps…' : 'Add attachments'}</button>
            <input ref={attachmentInputRef} className="sr-only" type="file" multiple onChange={(event) => addAttachments(event.target.files)} />
            {attachments.map((attachment) => <div className="attachment-control-row" key={attachment.id}>
              <input aria-label="Attachment file name" value={attachment.fileName} onChange={(event) => renameAttachment(attachment.id, event.target.value)} />
              <button className="icon-button" aria-label={`Remove ${attachment.fileName}`} onClick={() => setAttachments((current) => current.filter((item) => item.id !== attachment.id))}><X size={14} /></button>
            </div>)}
          </div>
          <div className="rail-section stamp-data-section"><p className="section-kicker">DOCUMENT CODE</p>{stamp ? <><div className="number-display">{stamp.code}</div><p className="control-copy">All three codes link to this app with this number.</p><div className="code-types"><span>QR</span><span>DM</span><span>BARCODE</span></div></> : <p className="control-copy">Generating the stamp preview…</p>}</div>
          <div className="rail-bottom">
            {error && <div className="alert alert-error"><CircleAlert size={16} /><span>{error}</span></div>}
            {notice && !error && <div className="alert alert-success"><BadgeCheck size={16} /><span>{notice}</span></div>}
            <button className="button button-primary download-button" disabled={!stamp || loading || busy || attachmentsBusy || !pages.length} onClick={createDownload}>{busy ? <><span className="spinner" /> Creating file…</> : <><ArrowDownToLine size={17} /> Stamp &amp; download</>}</button>
            {timestampProgress.total > 0 && <div className="timestamp-progress" role="status"><div className="timestamp-progress-heading"><strong>OpenTimestamps</strong><span>{timestampProgress.current}/{timestampProgress.total}</span></div><div className="progress-track"><span style={{ width: `${timestampProgress.current / timestampProgress.total * 100}%` }} /></div><p>{timestampProgress.label ? `${timestampProgress.label}: ` : ''}{timestampProgress.status}</p></div>}
            <p className="privacy-note"><LockKeyhole size={13} /> Your document is hashed locally; only its hash is sent to OpenTimestamps.</p>
          </div>
        </aside>

        <section className="preview-workspace">
          <div className="preview-toolbar"><div><p className="section-kicker">DOCUMENT PREVIEW</p><h2>{loading ? 'Opening your file…' : pages.length ? `${totalPreviewPages} ${totalPreviewPages === 1 ? 'page' : 'pages'}` : 'Preparing preview'}</h2></div></div>
          {loading && <div className="loading-card"><span className="spinner dark-spinner" /><div><strong>Preparing a local preview</strong><span>{kind === 'pdf' && progress.total ? `Rendering page ${progress.current} of ${progress.total}` : 'Reading document pages'}</span></div></div>}
          {kind === 'pdf' && pages.length > 0 && <div className="pages-list">
            {pages.map((page, index) => <PageCard key={page.id} page={page} index={index} stamp={stamp} coverTitle={coverTitle} setCoverTitle={setCoverTitle} coverBody={coverBody} setCoverBody={setCoverBody} />)}
            {Array.from({ length: attachmentPageCount }, (_, index) => <AttachmentGridPage key={`attachments-${index}`} attachments={attachments} index={index} onRename={renameAttachment} gridSpec={gridSpec} pageSize={attachmentPageSize} />)}
          </div>}
          {kind === 'docx' && <div className="pages-list docx-pages-list">
            <PageCard page={{ cover: true, width: 816, height: 1056 }} index={0} stamp={stamp} coverTitle={coverTitle} setCoverTitle={setCoverTitle} coverBody={coverBody} setCoverBody={setCoverBody} />
            <div className="word-preview-host" ref={wordPreviewRef} />
            {Array.from({ length: attachmentPageCount }, (_, index) => <AttachmentGridPage key={`attachments-${index}`} attachments={attachments} index={index} onRename={renameAttachment} gridSpec={gridSpec} pageSize={attachmentPageSize} />)}
          </div>}
          <div className="preview-disclaimer"><Bitcoin size={14} /><span>OpenTimestamps proofs are checked against Bitcoin attestations during public verification. Calendar submission may remain pending until Bitcoin confirmation.</span></div>
        </section>
      </section>}
      {busy && timestampProgress.total > 0 && <div className="timestamp-modal-backdrop" role="dialog" aria-live="polite" aria-label="OpenTimestamps progress"><div className="timestamp-modal"><div className="timestamp-modal-topline"><span className="spinner dark-spinner" /><p className="section-kicker">OPEN TIMESTAMPS</p></div><h2>Securing your documents</h2><p className="timestamp-modal-copy">Each document is hashed locally and submitted one at a time. Do not close this window until all proofs are saved.</p><div className="timestamp-progress-heading"><strong>{timestampProgress.label || 'Preparing documents'}</strong><span>{timestampProgress.current}/{timestampProgress.total}</span></div><div className="progress-track"><span style={{ width: `${timestampProgress.current / timestampProgress.total * 100}%` }} /></div><p className="timestamp-modal-status">{timestampProgress.status}</p></div></div>}

      {error && !file && <div className="alert alert-error upload-error"><CircleAlert size={16} /><span>{error}</span></div>}
    </main>
  </div>;
}

function AuthenticatorGate() {
  const [status, setStatus] = useState('loading');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    fetch('/api/auth/status', { credentials: 'same-origin' }).then((response) => response.json()).then(async (result) => {
      if (result.configured) await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
      setStatus(result.configured ? 'locked' : 'unconfigured');
    }).catch(() => setStatus('unconfigured'));
  }, []);
  async function unlock(event) {
    event.preventDefault(); setError('');
    try {
      const response = await fetch('/api/auth/login', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Authenticator check failed.');
      setStatus('authenticated'); setCode('');
    } catch (reason) { setError(reason.message || 'Authenticator check failed.'); }
  }
  if (status === 'loading') return <main className="auth-gate"><p>Checking access…</p></main>;
  if (status === 'authenticated') return <HomePage />;
  if (status === 'unconfigured') return <main className="auth-gate"><section className="auth-card"><p className="eyebrow">ORCAWARDEN · PRIVATE STAMPER</p><h1>Authenticator setup required</h1><p>Owner: configure the authenticator secret and session signing key in the server environment before using the private app. Public verification is still available.</p></section></main>;
  return <main className="auth-gate"><form className="auth-card" onSubmit={unlock}><p className="eyebrow">ORCAWARDEN · PRIVATE STAMPER</p><h1>Authenticator required</h1><p>Enter the current 6-digit code from your authenticator app.</p><label className="auth-code-label">Authentication code<input autoFocus inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} required /></label>{error && <p className="auth-error" role="alert">{error}</p>}<button className="button button-primary" type="submit" disabled={code.length !== 6}>Unlock stamper</button></form></main>;
}

export default function App() {
  return <Switch>
    <Route path="/verify/:code">{(params) => <VerifyPage code={params.code} />}</Route>
    <Route path="/mainapp">{() => <AuthenticatorGate />}</Route>
    <Route path="/">{() => <AuthenticatorGate />}</Route>
  </Switch>;
}
