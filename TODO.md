# TODO

## In-browser document upload, preview, placement, and download

- The app lets a user upload a PDF or Word document.
- It previews the document and lets the user select a position on a page for the stamp.
- It applies the stamp at the selected position on every page of the file.
- It lets the user download the resulting stamped PDF or Word file in the corresponding format.
- Document processing stays in the user's browser; the app does not upload or persist source documents.

## OrcaWarden stamp and document code

- Each stamp displays “Powered by OrcaWarden”, “DocNo-” followed by a 10-digit code, and “Secured on Bitcoin Blockchain”.
- A 10-digit document code is generated for each stamping operation.
- The QR code, Data Matrix, and barcode all encode an app URL containing that same 10-digit code.
- The QR code and Data Matrix sit side by side with a middle gap; their combined width equals the barcode width.
- There is no database or shared registry. Code collision avoidance is local to the browser; the app must not claim global uniqueness or authoritative blockchain verification.

## Render deployment and user guidance

- The app is in this GitHub repository and is deployable as a Render Static Site.
- The repository contains a Render Blueprint and clear setup/deployment instructions.
- Links encoded in the stamp open the app's route for the associated 10-digit number, with honest verification limitations because no issuance records are stored.
- The UI provides clear validation, processing, error, completion, and download states.
