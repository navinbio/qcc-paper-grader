# QCC Paper Grader — phone browser edition

This is a static, device-local browser app. It does not call the Python grading server. Sheet images, class rosters, answer keys and confirmed grades are stored in IndexedDB on the device/browser using the app. The public host serves only the app, its verified browser libraries and blank printable PDFs. No analytics, server upload route or third-party runtime requests are included.

## Use

1. Open the published HTTPS URL on a current Safari or Chrome browser. Wait for **On-device reader ready** and **Offline access ready**. On iPhone, Share → Add to Home Screen is optional.
2. Upload an XLSX or UTF-8 CSV roster and select the class. Supported columns: Student ID / OrgDefinedId / EmplID and First Name + Last Name or Full Name. Only names and eight-digit IDs are imported. Text IDs preserve zeros; numeric XLSX cells explicitly formatted 00000000 retain the displayed padding. Duplicate IDs within a class are rejected. Identical sorted tabs in one workbook are deduplicated.
3. Choose 50 or 100 questions, the key and 0–2 bonus answers. Download the matching printable sheet and create a batch. Its roster and key are frozen as a snapshot.
4. Open the camera and tap Capture repeatedly, or select many photos. Photos are saved and optimized one at a time; capture does not start grading. Retake saves a replacement and excludes the old copy. Exclude/Include is reversible.
5. Tap Process batch. The worker reads one photo at a time and checkpoints after each. Pause finishes the current photo. A reload restores the saved queue; processing is resumed explicitly. Visibility changes request a safe pause. The app requests a screen wake lock when supported, but phone browsers can still suspend or terminate work. Keep the grading screen open.
6. Both sheets have ID grids. Photos can arrive in any order. Exact file duplicates are skipped; multiple photos of the same student/side require choosing a copy. Unknown or unreadable IDs cannot be confirmed. Missing sides block a 100-question grade. Uncertain answers require review. Blank and clear multiple marks earn zero.
7. Verify the ready sheets and confirm. Export CSV or a ZIP containing individual one/two-page feedback PDFs and the class CSV. Feedback includes name, ID, percentage, points and marks beside each row. Correct-answer letters are optional. PDFs use rasterized page artwork so names supported by the device font remain readable.
8. Back up the batch. Backups contain its roster, originals, corrected photos, responses and confirmations; they are private student data. Restore creates a separate batch. Different sites, browsers and devices do not share local storage. Clearing browser data removes local batches. Storage is not a substitute for downloaded backups.

A 100-question class of 50 students requires 100 photos. The app has no 50-photo cap, but practical limits depend on storage and the phone. Only the current batch is loaded from IndexedDB. Originals are optimized to a maximum 2800-pixel edge, reading uses at most a 3200-pixel edge, and mats/bitmaps are released after each read. Images that the browser cannot decode must be supplied as JPEG/PNG. Restore is limited to 150 MB compressed / 250 MB expanded to bound memory.

## Deploy on GitHub Pages

Create a dedicated repository, preferably public if using GitHub Free, initialized with a README. Enable the GitHub connection for this repository. Do not upload the laptop app's data directory, rosters or test photos.

The checked-in `.github/workflows/pages.yml` tests the pure JavaScript rules, downloads browser dependencies with SHA-256 verification, builds an allowlisted static `site/`, and deploys it using GitHub Pages. Set **Settings → Pages → Source → GitHub Actions**. Push to `main` or run the workflow manually. Publication requires repository and Pages administration access.

The deployment supports a repository subpath, for example `https://USER.github.io/qcc-paper-grader/`. Do not open index.html using a file URL; workers, camera access and offline registration need HTTPS (or localhost for development).

## Local preview and checks

`node --test tests/core.test.js` tests scoring, zero-preserving roster handling, duplicate and missing-page rejection, explicit review, confirmation invalidation, 100 unordered photos/50 students, CSV parsing and projective geometry.

`node scripts/download-vendor.mjs` verifies libraries against vendor-lock.json. The OpenCV official 4.x prebuilt has a pinned digest. If its upstream bytes change, deployment stops instead of silently shipping a different reader; review and update the lock deliberately. ExcelJS 4.4.0, pdf-lib 1.17.1 and fflate 0.8.2 are pinned. License notices are in vendor/.

`node scripts/build.mjs` copies public source/assets into site/. Serve that directory with a local static HTTP server for browser QA. Browser libraries are included in the offline ZIP distribution, but ignored in Git source because CI downloads the exact locked bytes.

## Verification and limits

Browser QA matched the Python reader on a photographed 50-question front, a 51–100 back with ID and a real pencil photo. It verified unordered front/back pairing, local confirmation, two-page PDF/CSV ZIP export, backup restore and reopening after the static server was stopped. A 50-photo perspective/rotation batch completed with all 50 students ready and all 50 expected scores correct, with the static server switched off. Pause/reload preserved the first completed photo and resumed the remaining 49. A 390-pixel iframe layout check found no page-level horizontal overflow. The sample Excel workbook imported entirely in the browser.

The reader uses 4×4 ArUco dictionary patterns exported from the existing template, independent local marker homographies, fixed circular interiors, border and blur checks, and the existing moderate-pencil coverage/separation rule. It never uses an answer key to guess a mark or ID. The ID reader remains conservative. Browser numerical results can vary slightly from native OpenCV; broad real printer/pencil/device testing is still needed. Physical iPhone/Android camera capture, HEIC variants and low-memory behavior must be checked on the professor's actual phone. HTTPS hosting and hardware permission are required for live camera capture.

## Upload an answer key

Use Upload answer key beside the regular-key field to select a photo of a completed copy of our marker-based grading sheet. Select both sides together for a 100-question exam; page order does not matter. No roster or student ID is needed for a key. The reader runs locally. Blank, multiple, uncertain, missing and unreadable key choices require an explicit A–E selection. Review all regular and enabled bonus choices and check the verification box before applying. Cancel or a reading error leaves existing key values untouched. Applying only changes new-batch settings; saved batches keep their own key snapshots. Key photos are not added to student batches or uploaded to GitHub. Commercial Scantron layouts, PDFs and arbitrary answer lists are not supported by this photo reader.
