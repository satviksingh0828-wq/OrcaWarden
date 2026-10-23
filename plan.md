# OrcaWarden Document Stamper — Implementation Plan

## Product and architecture

Deliver the application directly in the existing GitHub repository as a static React/Vite site deployable from `render.yaml`. The user explicitly wants no database or document storage. PDF and DOCX files are read and processed entirely in the browser; uploaded documents are not sent to a server. A cryptographically random 10-digit number is generated locally for each newly selected file, with browser-local collision avoidance. The full app URL plus that number is encoded in all three machine-readable codes. Without a shared database, global uniqueness across different devices and authoritative verification of an issued code cannot be guaranteed; verification routes are informational and will not claim a stored record.

For PDFs, PDF.js renders page previews and pdf-lib embeds the generated stamp image on every page at the selected normalized page coordinate. For DOCX, docx-preview renders pages in-browser, while JSZip updates the Open XML package to add a floating image in the document header at the chosen position so it repeats across pages. The common stamp renderer makes QR, Data Matrix, and PDF417 barcode from the same full app URL; the combined widths of QR + gap + Data Matrix and the barcode are identical. PDF417 is used because a traditional Code 128 symbol becomes too dense to scan at the compact width when it encodes a full URL. Export retains the source format: PDF to stamped PDF and DOCX to stamped DOCX.

## Project structure

- `src/main.jsx` and `src/App.jsx`: React/Vite entry point, upload/editor workflow, verification route, and page placement UI.
- `src/lib/stamp.js`: browser-local 10-digit number generation, QR/Data Matrix/PDF417 generation, and stamp-canvas composition.
- `src/lib/pdf.js`: PDF.js preview rendering and pdf-lib PDF export.
- `src/lib/docx.js`: DOCX preview and Open XML header/image injection for repeated page placement.
- `src/styles.css`: responsive OrcaWarden visual system.
- `public/manus-routes.json`: client-side route declaration.
- `render.yaml`: Render Static Site Blueprint and SPA rewrite.
- `README.md`: npm setup, Render deployment instructions, and no-database uniqueness/verification limits.

## Design

**Design Movement:** Product interface in the restrained OrcaWarden security-mark style already approved in the stamp preview.

**Core Principles:** Keep the document preview primary; make upload and stamping steps explicit; keep security marks compact and legible; show processing and download status without implying blockchain settlement.

**Color Philosophy:** Deep blue-green and teal carry the stamp's trust cue; a small amber accent is reserved for the Bitcoin label; cool pale surfaces separate the work area from controls.

**Layout Paradigm:** A document-first editor: compact header, narrow action rail, and large preview canvas with controls kept adjacent rather than buried in a multi-step wizard.

**Signature Elements:** Fine dark-teal rules, compact code-bearing stamp, and an unobtrusive page-position marker.

**Interaction Philosophy:** Upload first, click the preview to place the stamp, review it on every page, then download. The same selected normalized position is applied to every page.

**Animation:** Restrained transitions for upload progress, page selection and completion; respect reduced-motion preferences.

**Typography System:** DM Sans for interface copy and Manrope for display headings; compact bold labels and tabular digits for document numbers.

**Brand Essence:** A simple way to place an OrcaWarden document mark; precise, calm, practical.

**Brand Voice:** Direct and reassuring. Example lines: “Choose where the stamp lands.” “Your file stays in this browser.”

**Wordmark & Logo:** Typographic OrcaWarden wordmark with a small geometric shield mark in the interface.

**Signature Brand Color:** Deep blue-green, sampled from the approved stamp design.

## Deployment

Render serves the built site as a Static Site from the connected GitHub repository. The Blueprint runs `npm ci && npm run build`, publishes `dist`, and rewrites non-file routes to `/index.html` for `/verify/:code`. No Render web service, API, database, secret, or file-storage service is required. The repository pins npm through its `packageManager` field and includes `package-lock.json`.
