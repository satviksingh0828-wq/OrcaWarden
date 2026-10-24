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

Create a Supabase project, run [`supabase/migrations/20261024_create_orcawarden_ots_bucket.sql`](supabase/migrations/20261024_create_orcawarden_ots_bucket.sql) in the SQL Editor, and configure these **private Render server variables** from [`.env.example`](.env.example):

```bash
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
SUPABASE_OTS_BUCKET=orcawarden-ots
ORCAWARDEN_ENCRYPTION_KEY=replace-with-a-permanent-strong-server-key
ORCAWARDEN_TOTP_SECRET=BASE32_SECRET_FOR_YOUR_AUTHENTICATOR
ORCAWARDEN_SESSION_SECRET=RANDOM_64_CHARACTER_OR_LONGER_SECRET
```

The bucket is private and stores encrypted proof files only, not uploaded documents. The Render server uses the Supabase service-role key to access it. Uploaded documents are held in bounded server memory only while they are hashed or verified, then discarded. OpenTimestamps calendar servers receive only SHA-256 hashes and do not require an API key.

Set `ORCAWARDEN_ENCRYPTION_KEY` to a permanent server-only value of at least 8 characters. Keep it unchanged for the full deployment lifecycle: changing or losing it makes existing encrypted proofs unreadable. The server derives an AES-256-GCM key with scrypt; the key is never sent to the browser.

### Authenticator setup for the private stamper

Generate a Base32 TOTP secret and an independent session-signing secret on a trusted computer:

```bash
head -c 20 /dev/urandom | base32 -w0; echo
openssl rand -hex 32
```

In your authenticator (Google Authenticator, Microsoft Authenticator, 1Password, etc.), add an account named **OrcaWarden** by entering the first generated Base32 key. Store both values as private Render environment variables named `ORCAWARDEN_TOTP_SECRET` and `ORCAWARDEN_SESSION_SECRET`; do not add a `VITE_` prefix, commit them, or send them in chat. Deploy/restart the service. Then `/mainapp` (and `/`) prompts for the current six-digit code whenever the app is opened. The stamper's number-reservation and timestamp APIs reject requests without a valid signed session; `/verify/:code` remains public. Login attempts are throttled. If you lose the authenticator, replace the TOTP secret in Render to enroll a new device.

The `GET /health` endpoint returns HTTP 200 only when Supabase, proof encryption, and both authenticator variables are configured.

## Deploy on Render

This repository includes `render.yaml` and is configured as a Render Node web service. Add all private variables above to the Render service before deploying. Render uses `npm ci && npm run build`, starts the app with `npm start`, and checks `/health`.

1. Commit and push the application to the `main` branch of `satviksingh0828-wq/OrcaWarden`.
2. Sign in to Render and choose **New → Blueprint**.
3. Connect your GitHub account if asked, then select `satviksingh0828-wq/OrcaWarden` and its `main` branch.
4. Render reads `render.yaml`. Review the proposed web service named `orcawarden-stamper`, then select **Apply**.
5. Wait for the build and deploy to finish. Open the `onrender.com` URL Render assigns to the site.

The Node server serves `dist`, handles `/api/*`, and falls back to `index.html` so `/verify/<code>` links open correctly. Later pushes to the connected branch can trigger automatic deploys.

## Document number and verification limits

The 10-digit number is reserved by the Supabase `orcawarden_document_number_seq` sequence through the `reserve_orcawarden_document_number()` RPC. This makes number allocation globally unique across concurrent browsers until the ten-digit sequence is exhausted. Opening `/verify/<code>` lets a user upload a copy to Render; the server hashes it, decrypts the matching proof, compares the file hash, and verifies any Bitcoin attestation against Blockstream and Blockchain.com data. A matching document can be either **Bitcoin-confirmed** or **pending calendar confirmation**.

The stamp wording includes “Secured on Bitcoin Blockchain” as requested. The OpenTimestamps calendar submission is immediate, but Bitcoin confirmation is asynchronous. The verification result says Bitcoin-confirmed only when an OpenTimestamps Bitcoin attestation validates against external blockchain data; a pending result is not yet Bitcoin confirmation.
