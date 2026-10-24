import React, { useEffect, useRef, useState } from 'react';
import { Route, Switch } from 'wouter';
import { ArrowDownToLine, BadgeCheck, Bitcoin, Check, CircleAlert, FileText, LockKeyhole, MousePointer2, RotateCcw, Upload, X } from 'lucide-react';
import { createDocumentCode, createStamp } from './lib/stamp.js';
import { exportStampedPdf, previewPdf } from './lib/pdf.js';
import { exportStampedDocx, paintDocxStampOverlays, previewDocx } from './lib/docx.js';

const MAX_FILE_BYTES = 40 * 1024 * 1024;
const STAMP_WIDTH = 0.36;
const DEFAULT_POSITION = { x: 0.58, y: 0.81 };

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

function PageCard({ page, index, position, stamp, onChoose }) {
  const isPdf = Boolean(page.dataUrl);
  return <div className="page-card">
    <div className="page-meta"><span>PAGE {String(index + 1).padStart(2, '0')}</span><span>{isPdf ? 'PDF PREVIEW' : 'WORD PREVIEW'}</span></div>
    <div className="page-canvas" onClick={onChoose} role="button" tabIndex={0} aria-label={`Choose stamp position on page ${index + 1}`} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onChoose(event); }}>
      {isPdf ? <img className="pdf-page-image" src={page.dataUrl} alt={`Preview of page ${index + 1}`} /> : page.element}
      {position && stamp && <img className="stamp-overlay" style={{ left: `${position.x * 100}%`, top: `${position.y * 100}%`, width: `${STAMP_WIDTH * 100}%` }} src={stamp.dataUrl} alt="Stamp placement preview" draggable="false" />}
      {position && <span className="placement-dot" style={{ left: `${position.x * 100}%`, top: `${position.y * 100}%` }} />}
    </div>
    <div className="page-hint"><MousePointer2 size={13} /> Click a page to move the stamp</div>
  </div>;
}

function HomePage() {
  const inputRef = useRef(null);
  const wordPreviewRef = useRef(null);
  const [file, setFile] = useState(null);
  const [kind, setKind] = useState(null);
  const [pages, setPages] = useState([]);
  const [position, setPosition] = useState(DEFAULT_POSITION);
  const [stamp, setStamp] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [dragging, setDragging] = useState(false);
  const [wordPageSize, setWordPageSize] = useState({ width: 816, height: 1056 });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!file || !kind) return;
      setLoading(true);
      setPages([]);
      setStamp(null);
      setPosition(DEFAULT_POSITION);
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
            setPages(previews.map((page) => ({ ...page, id: `pdf-${page.number}` })));
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
          const rect = pageNodes[0].getBoundingClientRect();
          setWordPageSize({ width: rect.width || 816, height: rect.height || 1056 });
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

  useEffect(() => {
    if (kind !== 'docx' || !wordPreviewRef.current || !pages.length) return;
    paintDocxStampOverlays(wordPreviewRef.current, stamp?.dataUrl, position);
  }, [kind, pages, position, stamp]);

  function setPositionFromClick(event) {
    const rect = event.currentTarget.getBoundingClientRect();
    const stampHeight = STAMP_WIDTH * (stamp?.height || 102) / (stamp?.width || 440);
    const x = Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1 - STAMP_WIDTH);
    const y = Math.min(Math.max((event.clientY - rect.top) / rect.height, 0), 1 - stampHeight);
    setPosition({ x, y });
  }

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
    setPages([]);
    setProgress({ current: 0, total: 0 });
  }

  async function createDownload() {
    if (!file || !stamp || !position || busy) return;
    setBusy(true);
    setError('');
    setNotice('Preparing your stamped file…');
    try {
      if (kind === 'pdf') {
        const bytes = await exportStampedPdf(file, stamp.dataUrl, position);
        const output = new Blob([bytes], { type: 'application/pdf' });
        const name = file.name.replace(/\.pdf$/i, '') + '-orcawarden.pdf';
        downloadBlob(output, name);
      } else {
        const output = await exportStampedDocx(file, stamp, position, wordPageSize);
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
    setError('');
    setNotice('');
    setPosition(DEFAULT_POSITION);
    if (inputRef.current) inputRef.current.value = '';
    if (wordPreviewRef.current) wordPreviewRef.current.innerHTML = '';
  }

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
          <div className="rail-section"><p className="section-kicker">STAMP PLACEMENT</p><h2>Click the page</h2><p className="control-copy">Choose where the mark should appear. The same relative position will be used on every page.</p><div className="position-readout"><span className="position-glyph"><MousePointer2 size={17} /></span><span>{position ? 'Position selected' : 'Choose a position'}</span><span className="position-state"><Check size={13} /></span></div><button className="text-button" onClick={() => setPosition(DEFAULT_POSITION)}><RotateCcw size={13} /> Reset position</button></div>
          <div className="rail-section stamp-data-section"><p className="section-kicker">DOCUMENT CODE</p>{stamp ? <><div className="number-display">{stamp.code}</div><p className="control-copy">All three codes link to this app with this number.</p><div className="code-types"><span>QR</span><span>DM</span><span>BARCODE</span></div></> : <p className="control-copy">Generating the stamp preview…</p>}</div>
          <div className="rail-bottom">
            {error && <div className="alert alert-error"><CircleAlert size={16} /><span>{error}</span></div>}
            {notice && !error && <div className="alert alert-success"><BadgeCheck size={16} /><span>{notice}</span></div>}
            <button className="button button-primary download-button" disabled={!stamp || loading || busy || !pages.length} onClick={createDownload}>{busy ? <><span className="spinner" /> Creating file…</> : <><ArrowDownToLine size={17} /> Stamp &amp; download</>}</button>
            <p className="privacy-note"><LockKeyhole size={13} /> Your file never leaves this browser.</p>
          </div>
        </aside>

        <section className="preview-workspace">
          <div className="preview-toolbar"><div><p className="section-kicker">DOCUMENT PREVIEW</p><h2>{loading ? 'Opening your file…' : pages.length ? `${pages.length} ${pages.length === 1 ? 'page' : 'pages'}` : 'Preparing preview'}</h2></div><div className="preview-legend"><span className="legend-dot" /> Stamp position</div></div>
          {loading && <div className="loading-card"><span className="spinner dark-spinner" /><div><strong>Preparing a local preview</strong><span>{kind === 'pdf' && progress.total ? `Rendering page ${progress.current} of ${progress.total}` : 'Reading document pages'}</span></div></div>}
          {kind === 'pdf' && pages.length > 0 && <div className="pages-list">{pages.map((page, index) => <PageCard key={page.id} page={page} index={index} position={position} stamp={stamp} onChoose={setPositionFromClick} />)}</div>}
          {kind === 'docx' && <div className="word-preview-host" ref={wordPreviewRef} />}
          <div className="preview-disclaimer"><Bitcoin size={14} /><span>The stamp text says “Secured on Bitcoin Blockchain.” This app does not submit or verify a Bitcoin transaction.</span></div>
        </section>
      </section>}

      {error && !file && <div className="alert alert-error upload-error"><CircleAlert size={16} /><span>{error}</span></div>}
    </main>
    {kind === 'docx' && <DocxClickCapture
      hostRef={wordPreviewRef}
      pages={pages}
      stamp={stamp}
      position={position}
      onChoose={(nextPosition, pageSize) => { setPosition(nextPosition); setWordPageSize(pageSize); }}
    />}
  </div>;
}

// The Word preview is rendered by docx-preview outside React's normal tree. This bridge
// adds placement feedback to each rendered page and captures user clicks consistently.
function DocxClickCapture({ hostRef, pages, stamp, position, onChoose }) {
  useEffect(() => {
    const host = hostRef.current;
    if (!host || !pages.length) return undefined;
    const handler = (event) => {
      const page = event.target.closest('.docx-wrapper section.docx, section.docx');
      if (!page || !host.contains(page)) return;
      const rect = page.getBoundingClientRect();
      const stampHeight = STAMP_WIDTH * (stamp?.height || 102) / (stamp?.width || 440);
      onChoose({
        x: Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1 - STAMP_WIDTH),
        y: Math.min(Math.max((event.clientY - rect.top) / rect.height, 0), 1 - stampHeight),
      }, { width: rect.width || 816, height: rect.height || 1056 });
    };
    host.addEventListener('click', handler);
    return () => host.removeEventListener('click', handler);
  }, [hostRef, pages, stamp, onChoose]);
  return null;
}

export default function App() {
  return <Switch>
    <Route path="/verify/:code">{(params) => <VerifyPage code={params.code} />}</Route>
    <Route path="/">{() => <HomePage />}</Route>
  </Switch>;
}
