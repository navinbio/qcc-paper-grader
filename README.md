# Exam Grader - phone browser edition

Public app: https://navinbio.github.io/qcc-paper-grader/?v=1.8.2

This static browser app grades our marker-based printed sheets locally. The opening screen offers My workspace and Guest mode. Guest keys, photos and grades use temporary memory only; the existing device workspace keeps its rosters, keys and grades in IndexedDB. Hosting serves the application, verified browser libraries and blank PDFs. No analytics or student-data upload endpoint is included. Professor accounts and cross-device synchronization are not implemented.

## Entry and guest mode

My workspace opens the existing device workspace directly, without accounts, passwords or biometrics. Stored classes, keys and exams remain in this browser. Guest mode stays temporary.

Guest mode has three steps: Upload key, Capture Grading Sheets and Export. A clearly read key applies immediately without a key name, saved library, roster or confirmation dialog. Only ambiguous/missing key answers need correction. IDs are read from the student sheet without a roster lookup. A one-page unreadable ID exports as Unidentified student with an empty ID; internal grouping identifiers never appear in exports. Two-page exams require readable IDs to pair pages and never guess pairs.

The guest database adapter is an isolated in-memory Map and never opens IndexedDB or requests persistent storage. Refreshing, closing or ending a session loses temporary work. The app warns before an unexported session is left where the browser supports beforeunload; mobile browsers may not show that warning. End guest session confirms clearing and releases temporary records, previews and generated download links. Downloaded files remain with the user. Service-worker caches contain only the app, libraries and blank sheets, not guest photos or grades.

## Saved device workspace: four steps

1. **Choose a Class.** Saved classes appear first; Upload new class roster is the last dropdown choice. Selecting it shows a visible Choose Files control; opening a picker is not attempted from a select-change callback, which mobile browsers can block. Import errors appear beside the roster uploader, and a failed import leaves existing rosters unchanged. Select Excel or CSV rosters containing eight-digit Student ID / OrgDefinedId and Full Name or First Name + Last Name. Text IDs preserve leading zeros; numeric Excel IDs explicitly formatted 00000000 retain padding. Manage classes supports rename, reversible deletion and Undo. Previous exams retain their roster snapshots.
2. **Answer Key.** Choose key lists saved keys first and Upload new answer key last. Upload a marked instructor key, give it a unique name, and save. The highest marked regular question determines the exam length (1–100); marked EC1/EC2 determine extra credit and its correct answers automatically. Use Sheet 1 for up to 50 and both sheets for 51–100. Leave trailing unused questions blank. Blank gaps inside the key and ambiguous marks require an explicit A–E correction instead of shifting question numbers or silently discarding marks. Clear readings need only a name and Save; extracted answers remain available in a collapsed panel. Student blanks/multiple marks still earn zero. Unused student rows are ignored in grading, review, CSV and PDF annotations. Saved keys and previous exam snapshots retain their settings.
3. **Capture Grading Sheets.** The first photo or camera use saves an exam snapshot automatically. Capture repeatedly or select multiple photos, then Grade N sheets. The Grade N sheets button counts included photo sides and updates after capture, selection, exclusion, inclusion and deletion. Grading is disabled until all selected photos finish saving. The worker runs sequentially and checkpoints each photo; pause/reload resumes explicitly. Keep the screen open. Both sides have ID grids and can arrive in any order. Exact duplicates are skipped; competing copies require choosing one. Previous exams and Start a new exam are available in a collapsed section.
4. **Export.** Complete students become ready automatically. There is no attestation or confirmation step. Download Combined PDF creates one PDF in student-name order, keeping each student's pages together. Download Class CSV includes the same ready students. Unknown/unreadable IDs, uncertain responses, missing pages and duplicate sides block only the affected records. The interface reports graded students and items needing attention. Clear blanks and multiple marks earn zero. Each correct enabled bonus earns one point, with the final score capped at 100%.

Review is optional for complete students: it opens a graded image with name, ID, score, percentage and annotations beside each answer. Original photo and Edit responses are available. Incomplete students show the source sheet and the issue instead of an invented final grade. Downloads always use the latest ready results, including edits. Include correct-answer letters is under More options, while Download backup and Restore backup are directly available in Export in both modes.

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

The 32 rule tests cover page validation, automatic question and extra-credit counts, partial-page scoring, automatic export eligibility, blank/multiple scoring, extra credit, ID preservation, missing/duplicate pages, uncertain marks, keys, unique names and homography. Browser checks cover a 50-photo perspective/rotation batch, pause/reload, offline reading, roster import, photo-key extraction, saved-key persistence, class deletion/Undo, automatic exam creation, complete multi-photo ingestion, optional annotated review, matching PDF/CSV exports, and a two-page 100-question combined PDF. Rendered exports were visually checked.

## Limits

Only our marker-based grading-sheet layouts are supported. Commercial Scantron layouts, arbitrary answer lists and PDF key uploads are not recognized by the image reader. Photo formats depend on the browser decoder; use JPEG/PNG when HEIC cannot be opened. Originals are optimized to a 2800-pixel edge and reading uses at most 3200 pixels. One batch is loaded at a time; image resources are released after reading. Combined PDF export retains the resulting PDF in memory; practical class size depends on phone storage and memory. Backup restore is limited to 150 MB compressed / 250 MB expanded. Physical phone camera, pencil/printer variations and low-memory behavior still require testing on the professor's actual device. HTTPS and camera permission are required for capture.

Photo actions include Review, Retake, Exclude/Include and Delete. Delete removes the photo record, original, corrected image and responses from IndexedDB. Undo delete restores the last deleted photo until a different deletion, exam switch or reload. Exclude keeps the record and leaves it out of grading; Delete removes it from the saved exam and subsequent backups. Deleting a required page blocks that student until it is restored or replaced.

Print blank Grading Sheet is a bold link below the app heading and directly above the first setup section. It opens the existing two-page 100-bonus blank PDF in a new tab. Print page 1 for up to 50 questions or both pages for 51–100. Extra-credit bubbles on page 1 are optional; marking them in the instructor key enables them automatically. This print link is independent of the currently selected key.

The application is branded Exam Grader, with a large bold title, readable tagline, quieter status labels and consistent mobile spacing. The existing IndexedDB database name and backup format identifier are intentionally retained so saved exams and older backups remain usable.

Legacy saved keys retain their saved exam settings. To infer a different length or extra-credit configuration from the original marks, upload the instructor key again. Existing exam snapshots remain independent of subsequent library additions.

Routine instructions now live behind circled information buttons beside each section heading, the print link and session label. Help opens a keyboard-accessible dialog with Close and Escape support. Key counts and current exam details are available inside their related help panels. Errors and active reading/export progress remain visible; ordinary success/helper paragraphs and empty queue elements are hidden. Grading results, actions and downloads stay visible.

The key upload control uses an accessible native file input with a custom visible label. Guest mode shows Reading key while processing and Key uploaded only after a usable key is accepted. Resetting the native input to allow reselecting a photo no longer displays a misleading no-files-selected message.

Backups now have dated filenames and are available in both modes. They preserve a single exam, its key/roster snapshot, original photos, processed results, pending queue and correct-answer display setting. A restored in-progress photo becomes pending; completed photos keep their results. Download a new backup after more work. Guest restore stays in memory, and adding photos continues the restored exam instead of creating a different one. Restoring in My workspace saves a separate exam and leaves existing exams intact. Guest sessions with photos must be backed up and ended before restoring another file. Backup/restore lock mutations while running.

Browser recovery verification: downloaded a real guest ZIP with one completed and one pending sheet, ended the session, restored into a fresh guest session, finished the pending sheet, and added a third sheet without restarting the exam. Restoring the same archive into My workspace preserved the partial queue through reload and kept earlier exams in history.

Print blank Grading Sheet now opens an in-app preview, keeping the current guest/saved session intact. A sticky toolbar supplies Back to grader, Print, Share and Download PDF. The print view uses two 300-dpi Letter images derived from the unchanged blank PDF, at 215.9 x 279.4 mm with no app controls on printed pages. Share sends the original PDF through the system file-sharing menu when supported; unsupported browsers show a download fallback. The preview code and images are included in offline caching and deployment. Physical printer output and native iPhone share/print dialogs still depend on the user’s browser and device.

All current Letter templates now have a Student ID writing line on both pages and omit the 1–8 ID row labels. Digit-column labels 0–9, bubble coordinates, marker IDs and question layout are unchanged. A raster comparison confirmed changes were confined to the ID title/line and removed-row-label areas. Preview/PDF URLs include the release query so an older cached blank sheet cannot mask the update. Students still bubble the ID for automatic reading; the written line provides a human-readable reference.
