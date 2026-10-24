# OrcaWarden Document Stamper

A browser app for placing an OrcaWarden stamp on PDF and Word `.docx` documents. Source documents are read locally in the browser. When the user clicks **Stamp & download**, the stamped main document and each selected attachment are timestamped one at a time: only each file's hash is sent to OpenTimestamps, and each returned proof is saved to Supabase Storage as `<document-number>.ots`.

The stamp contains “Powered by OrcaWarden”, `DocNo-` followed by a 10-digit number, and “Secured on Bitcoin Blockchain”. A QR code, Data Matrix, and PDF417 barcode all encode the same full app URL ending in `/verify/<10-digit-number>`. The QR and Data Matrix are side by side with a center gap, and their combined width matches the barcode width. PDF417 is used because a traditional one-row Code 128 symbol becomes too dense to scan at this compact size when it encodes a full URL.

The selected position is applied across every PDF page. Word `.docx` files are stamped by adding a floating mark to the page header so it repeats across pages. The app supports PDF and `.docx`; the older binary `.doc` format is not supported. Word preview uses browser-side DOCX rendering. As with other DOCX-to-HTML previews, complex layouts or pagination may render differently from Microsoft Word; the downloaded DOCX preserves the original package and adds the stamp to its header.

Long previews remain scrollable instead of being clipped at the viewport.

## Local development

Use Node.js 20 or newer and npm 10.9.2. From the repository root:

```bash
npm ci
npm run dev
```

Open the local Vite URL shown in the terminal. The app allows files up to 40 MB.

## Supabase and OpenTimestamps setup

Create a Supabase project, run [`supabase/migrations/20261024_create_orcawarden_ots_bucket.sql`](supabase/migrations/20261024_create_orcawarden_ots_bucket.sql) in the SQL Editor, and configure the variables in [`.env.example`](.env.example):

```bash
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
VITE_SUPABASE_OTS_BUCKET=orcawarden-ots
```

The bucket stores encrypted proof files only, not uploaded documents. The public read policy is needed because the verification page has no sign-in flow; each proof contains OpenTimestamps proof data rather than document contents. OpenTimestamps calendar servers receive only local hashes and do not require an API key.

Set `VITE_ORCAWARDEN_ENCRYPTION_KEY` to a permanent value of at least 8 characters. Keep it unchanged for the full deployment lifecycle: changing or losing it makes existing encrypted proofs unreadable. The frontend refuses to stamp or verify if the key is missing or too short. Because this is a Vite `VITE_` variable, it is delivered to the browser; it protects proof data at rest in Storage, but it is not a server-only secret. A server-side secret would require moving encryption into an authenticated backend or Supabase Edge Function.

## Deploy on Render

This repository includes `render.yaml` and is configured as a Render Static Site. Add the three `VITE_` variables above to the Render service before building. Render's [Static Sites guide](https://render.com/docs/static-sites) describes connecting a Git repository and deploying from the dashboard; the [Blueprint reference](https://render.com/docs/blueprint-spec) documents the YAML configuration. Render documents Static Sites as free to deploy, subject to workspace usage limits.

1. Commit and push the application to the `main` branch of `satviksingh0828-wq/OrcaWarden`.
2. Sign in to Render and choose **New → Blueprint**.
3. Connect your GitHub account if asked, then select `satviksingh0828-wq/OrcaWarden` and its `main` branch.
4. Render reads `render.yaml`. Review the proposed static site named `orcawarden-stamper`, then select **Apply**.
5. Wait for the build and deploy to finish. Open the `onrender.com` URL Render assigns to the site.

The Blueprint runs `npm ci && npm run build`, publishes `dist`, and rewrites client-side paths to `index.html`, so `/verify/<code>` links open the app correctly. Later pushes to the connected branch can trigger automatic deploys. Render's [redirects and rewrites guide](https://render.com/docs/redirects-rewrites) explains the SPA route behavior.

## Document number and verification limits

The 10-digit number is reserved by the Supabase `orcawarden_document_number_seq` sequence through the `reserve_orcawarden_document_number()` RPC. This makes number allocation globally unique across concurrent browsers until the ten-digit sequence is exhausted. Opening `/verify/<code>` lets a user upload a copy; the app fetches and decrypts `<code>.ots` in the browser, then compares the copy's local SHA-256 hash with the proof's file hash.

The stamp wording includes “Secured on Bitcoin Blockchain” as requested. This app does not submit a transaction, anchor a document hash, or independently verify blockchain settlement. Do not treat the stamp alone as proof of a Bitcoin transaction or document authenticity.
