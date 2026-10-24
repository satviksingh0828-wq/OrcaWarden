import React, { useEffect, useRef, useState } from 'react';
import { Route, Switch } from 'wouter';
import { ArrowDownToLine, BadgeCheck, Bitcoin, CircleAlert, FileText, LockKeyhole, Upload, X } from 'lucide-react';
import { createDocumentCode, createStamp } from './lib/stamp.js';
import { exportStampedPdf, previewPdf } from './lib/pdf.js';
import { exportStampedDocx, previewDocx } from './lib/docx.js';

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
  return <div className="app-shell">
    <main className="verify-shell">
      <div className="verify-card">
        <p className="eyebrow">ORCAWARDEN DOCUMENT CODE</p>
        <h1>{valid ? 'Code link opened' : 'Invalid document code'}</h1>
        {valid ? <>
          <div className="verify-number">{code}</div>
          <p className="verify-copy">This stamp links to document number <strong>{code}</strong>. This app does not keep an issuance registry, upload the document, or record a Bitcoin transaction, so it cannot confirm that the document was issued here or independently verify blockchain settlement.</p>
          <div className="verify-note">Compare this number with the source document and confirm it with its issuer.</div>
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

function AttachmentGridPage({ attachments, index, onRename }) {
  return <div className="page-card attachment-page-card">
    <div className="attachment-sheet">
      <h2>Attachments Stamps</h2>
      <p>Kindly verify all attachments against their respective stamps only.</p>
      <div className="attachment-grid">
        {attachments.slice(index * 16, (index + 1) * 16).map((attachment) => <div className="attachment-tile" key={attachment.id}>
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
  const [coverTitle, setCoverTitle] = useState('');
  const [coverBody, setCoverBody] = useState(DEFAULT_COVER_BODY);
  const [attachmentsBusy, setAttachmentsBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
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
        const code = createDocumentCode();
        const newStamp = await createStamp(code);
        if (cancelled) return;
        setStamp(newStamp);
        if (kind === 'pdf') {
          const previews = await previewPdf(file, (current, total) => setProgress({ current, total }));
          if (!cancelled) {
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
  }

  async function addAttachments(fileList) {
    const selected = [...(fileList || [])];
    if (!selected.length) return;
    setAttachmentsBusy(true);
    setError('');
    try {
      const prepared = await Promise.all(selected.map(async (attachmentFile) => {
        const code = createDocumentCode();
        const attachmentStamp = await createStamp(code);
        return { id: crypto.randomUUID(), fileName: attachmentFile.name, stamp: attachmentStamp };
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
    setBusy(true);
    setError('');
    setNotice('Preparing your stamped file…');
    try {
      if (kind === 'pdf') {
        const bytes = await exportStampedPdf(file, stamp.dataUrl, coverTitle, coverBody, attachments);
        const output = new Blob([bytes], { type: 'application/pdf' });
        const name = file.name.replace(/\.pdf$/i, '') + '-orcawarden.pdf';
        downloadBlob(output, name);
      } else {
        const output = await exportStampedDocx(file, stamp, coverTitle, coverBody, attachments);
        const name = file.name.replace(/\.docx$/i, '') + '-orcawarden.docx';
        downloadBlob(output, name);
      }
      setNotice(`Stamped copy downloaded. Document number: ${stamp.code}.`);
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
    if (inputRef.current) inputRef.current.value = '';
    if (wordPreviewRef.current) wordPreviewRef.current.innerHTML = '';
  }

  const totalPreviewPages = pages.length + (kind === 'docx' ? 1 : 0) + Math.ceil(attachments.length / 16);

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
            <p className="privacy-note"><LockKeyhole size={13} /> Your file never leaves this browser.</p>
          </div>
        </aside>

        <section className="preview-workspace">
          <div className="preview-toolbar"><div><p className="section-kicker">DOCUMENT PREVIEW</p><h2>{loading ? 'Opening your file…' : pages.length ? `${totalPreviewPages} ${totalPreviewPages === 1 ? 'page' : 'pages'}` : 'Preparing preview'}</h2></div></div>
          {loading && <div className="loading-card"><span className="spinner dark-spinner" /><div><strong>Preparing a local preview</strong><span>{kind === 'pdf' && progress.total ? `Rendering page ${progress.current} of ${progress.total}` : 'Reading document pages'}</span></div></div>}
          {kind === 'pdf' && pages.length > 0 && <div className="pages-list">
            {pages.map((page, index) => <PageCard key={page.id} page={page} index={index} stamp={stamp} coverTitle={coverTitle} setCoverTitle={setCoverTitle} coverBody={coverBody} setCoverBody={setCoverBody} />)}
            {Array.from({ length: Math.ceil(attachments.length / 16) }, (_, index) => <AttachmentGridPage key={`attachments-${index}`} attachments={attachments} index={index} onRename={renameAttachment} />)}
          </div>}
          {kind === 'docx' && <div className="pages-list docx-pages-list">
            <PageCard page={{ cover: true, width: 816, height: 1056 }} index={0} stamp={stamp} coverTitle={coverTitle} setCoverTitle={setCoverTitle} coverBody={coverBody} setCoverBody={setCoverBody} />
            <div className="word-preview-host" ref={wordPreviewRef} />
            {Array.from({ length: Math.ceil(attachments.length / 16) }, (_, index) => <AttachmentGridPage key={`attachments-${index}`} attachments={attachments} index={index} onRename={renameAttachment} />)}
          </div>}
          <div className="preview-disclaimer"><Bitcoin size={14} /><span>The stamp text says “Secured on Bitcoin Blockchain.” This app does not submit or verify a Bitcoin transaction.</span></div>
        </section>
      </section>}

      {error && !file && <div className="alert alert-error upload-error"><CircleAlert size={16} /><span>{error}</span></div>}
    </main>
  </div>;
}

export default function App() {
  return <Switch>
    <Route path="/verify/:code">{(params) => <VerifyPage code={params.code} />}</Route>
    <Route path="/">{() => <HomePage />}</Route>
  </Switch>;
}
