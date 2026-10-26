# QCC Paper Grader - phone browser edition

Public app: https://navinbio.github.io/qcc-paper-grader/?v=1.3.1

This static browser app grades our marker-based printed sheets locally. Photos, rosters, keys and grades stay in IndexedDB in the current device/browser. Hosting serves the application, verified browser libraries and blank PDFs. No analytics or student-data upload endpoint is included. Professor accounts and cross-device synchronization are not implemented.

## Four steps

1. **Choose a Class.** Saved classes appear first; Upload new class is the last dropdown choice. Select Excel or CSV rosters containing eight-digit Student ID / OrgDefinedId and Full Name or First Name + Last Name. Text IDs preserve leading zeros; numeric Excel IDs explicitly formatted 00000000 retain padding. Manage classes supports rename, reversible deletion and Undo. Previous exams retain their roster snapshots.
2. **Answer Key.** Choose a named key, upload photos of a marked copy of our template, or enter answers. Select 50/100 questions and 0-2 extra-credit questions. Extra-credit answers are tucked inside Edit key; uploaded and saved keys restore them automatically. Uploaded keys require an explicit A-E choice for any blank, multiple, uncertain or missing answer, and verification before applying. Upload both key pages together for 100 questions; order does not matter. Key photos do not require an ID and are not stored as student submissions. Save keys under unique names; names are checked ignoring case and repeated spaces. Keys persist on this browser/device.
3. **Capture Grading Sheets.** The first photo or camera use saves an exam snapshot automatically. Capture repeatedly or select multiple photos, then Process Batch. Processing is disabled until all selected photos finish saving. The worker runs sequentially and checkpoints each photo; pause/reload resumes explicitly. Keep the screen open. Both sides have ID grids and can arrive in any order. Exact duplicates are skipped; competing copies require choosing one. Previous exams and Start a new exam are available in a collapsed section.
4. **Export.** Complete students become ready automatically. There is no attestation or confirmation step. Download Combined PDF creates one PDF in student-name order, keeping each student's pages together. Download Class CSV includes the same ready students. Unknown/unreadable IDs, uncertain responses, missing pages and duplicate sides block only the affected records. The interface reports graded students and items needing attention. Clear blanks and multiple marks earn zero. Each correct enabled bonus earns one point, with the final score capped at 100%.

Review is optional for complete students: it opens a graded image with name, ID, score, percentage and annotations beside each answer. Original photo and Edit responses are available. Incomplete students show the source sheet and the issue instead of an invented final grade. Downloads always use the latest ready results, including edits. Include correct-answer letters is under More options, along with backup/restore.

## Storage and backups

Clearing browser data removes local records. Download exam backups regularly and keep them private. Backups include the exam's roster and key snapshots, originals, corrected images and responses. They do not include the separate saved-key library. Restore creates a separate exam and accepts older backup formats with confirmation metadata. That metadata is no longer required for exporting. Different sites, browsers and devices do not share local storage.

## Hosting and updates

The repository's GitHub Actions workflow tests scoring and key rules, downloads dependencies with SHA-256 verification, builds an allowlisted site/, and deploys GitHub Pages. Settings -> Pages -> Source must be GitHub Actions. Push main to publish. No laptop server is required after HTTPS publication.

Scripts and styles use release query parameters; service-worker installation reloads assets from the network before making the offline cache active. All versioned assets must also be included in sw.js. Bump the release consistently in index.html, app.js, key-import.js and sw.js when changing cached code. A release link with ?v=VERSION bypasses an older cached navigation. Offline access requires initial internet loading and the ready message.

## Development and verification

Run these commands from this directory:

- node --test tests/core.test.js
- node scripts/download-vendor.mjs
- node scripts/build.mjs

The dependency lock verifies the tested OpenCV 4.x prebuilt, ExcelJS 4.4.0, pdf-lib 1.17.1 and fflate 0.8.2. If upstream bytes change, deployment stops for explicit review. Licenses are in vendor/. The build copies only public source/assets; no rosters, test photos or runtime data are included.

The 20 rule tests cover automatic export eligibility, blank/multiple scoring, extra credit, ID preservation, missing/duplicate pages, uncertain marks, keys, unique names and homography. Browser checks cover a 50-photo perspective/rotation batch, pause/reload, offline reading, roster import, photo-key extraction, saved-key persistence, class deletion/Undo, automatic exam creation, complete multi-photo ingestion, optional annotated review, matching PDF/CSV exports, and a two-page 100-question combined PDF. Rendered exports were visually checked.

## Limits

Only our marker-based grading-sheet layouts are supported. Commercial Scantron layouts, arbitrary answer lists and PDF key uploads are not recognized by the image reader. Photo formats depend on the browser decoder; use JPEG/PNG when HEIC cannot be opened. Originals are optimized to a 2800-pixel edge and reading uses at most 3200 pixels. One batch is loaded at a time; image resources are released after reading. Combined PDF export retains the resulting PDF in memory; practical class size depends on phone storage and memory. Backup restore is limited to 150 MB compressed / 250 MB expanded. Physical phone camera, pencil/printer variations and low-memory behavior still require testing on the professor's actual device. HTTPS and camera permission are required for capture.
