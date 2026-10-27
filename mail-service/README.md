# Exam Grader mail delivery

Implementation is ready for configuration; this service is not deployed or connected by default. GitHub Pages cannot run it. The normal professor flow is one button, one confirmation. No provider key belongs in the browser or GitHub.

## One-time administrator setup

1. Use a Resend account and verify a sender domain you control. Choose an address such as `grades@your-domain`. This implementation uses a dedicated sender; replies can go to the professor. No account or sender has been created by Codex.
2. In a Cloudflare account, create a D1 database named `exam-grader-mail`. Put its database ID in `wrangler.jsonc`; replace `FROM_ADDRESS` with the verified sender. Keep `ALLOWED_ORIGINS` restricted to the app's origin.
3. From this folder, use the official Wrangler CLI:

```text
npx wrangler d1 create exam-grader-mail
npx wrangler d1 execute exam-grader-mail --remote --file schema.sql
npx wrangler secret put RESEND_API_KEY
npx wrangler deploy
```

Enter the API key privately at the secret prompt. Use a sending-only key restricted to the verified domain where available. Do not put it in source, screenshots, chat, or the configuration file.

4. Provision each professor's device separately, saving the output to a private folder outside the repository:

```text
node provision-device.mjs https://YOUR-WORKER.workers.dev professor@example.edu PRIVATE_OUTPUT_FOLDER
npx wrangler d1 execute exam-grader-mail --remote --file PRIVATE_OUTPUT_FOLDER/register-device.sql
```

5. On that device, open My workspace → Export → More options → Email connection. Enter the service URL and the private device code from `email-connection.private.json`, then save. This device code is separate from the provider API key. It authorizes this device to send; treat it as a credential. It is stored separately from exam backups. Disable a lost device by setting `devices.enabled=0` for its ID. The professor's server-registered reply address must be one they are authorized to use.
6. Import a roster with Student ID, student name, and a single Email column. Older imported rosters do not contain email addresses; re-upload and use the updated roster for the exam.
7. First test using a synthetic student record addressed to an inbox you control. Confirm receipt and the correct attachment, then test a second click and a network interruption. No live student or provider delivery has been tested in this implementation session.

## Behavior and limits

- Grading and PDF generation stay on the device. Only after Confirm does each individual PDF, student name, ID, recipient email, and exam name go over HTTPS to this service and Resend.
- Only complete, identity-matched students with one valid, unique roster email are eligible. Missing or invalid addresses, addresses shared by different IDs, guest results, and unresolved grades are skipped.
- A separate email and attachment are generated for each student. No class-wide CC/BCC or combined class PDF is sent.
- Accepted means Resend accepted the message, not that it reached the inbox. This version has no delivery/bounce webhooks or background sending.
- Internet and an open app are required while submitting. If interrupted, the professor clicks the same button and confirms again to continue. PDFs for pending attempts are retained locally and reused exactly. Do not clear browser storage while an attempt is pending.
- Device-scoped delivery records and provider idempotency keys prevent repeat submissions. Unchanged grades retain their identity across backup restoration. A changed grade, recipient, key, or answer-visibility option constitutes a new message and requires another confirmation.
- The server deliberately refuses uncertain retries after 23 hours, before Resend's 24-hour idempotency window expires. An administrator must check the provider outcome; no blind resend is performed.
- D1 retains only device IDs, job identifiers, payload hashes, acceptance state, provider IDs, and timestamps. PDF contents, student names/IDs, recipient addresses and email body are not stored there. Provider storage is governed by the provider's settings. Request logging is disabled in the supplied worker config; do not add request-body logging.
- Each device is limited to 500 new sends per rolling 24 hours. The client submits sequentially; provider throttling stops the attempt and permits a safe retry. Each request is limited to 12 MB, with an approximately 8 MB PDF limit.
- Do not delete delivery records merely to reset the quota: those records protect against duplicate sends. API access fails closed without the secret, database binding, allowed origin, or a valid registered device code. CORS is not used as authentication.
- The service cannot independently verify an uploaded roster against a college system. Recipient matching is performed in the app, using the professor-selected exam roster. Authorized devices are trusted to submit their own grading results.

## Validation performed

`node --test tests/core.test.js tests/email.test.js` from the app folder: 46 passing tests. Email tests use a real in-memory SQLite database and mocked mail transport. They cover roster email extraction, leading zeros, incomplete IDs, shared addresses, recipient isolation, API authentication, sender control, repeated clicks, concurrent requests, provider rejection, rate limits, lost responses, and the retry window.

The browser test used two synthetic students: one eligible and one missing an email. Cancel submitted nothing; Confirm generated one PDF to the mock service; clicking again did not resubmit it. The test fixture is not part of the deployed site.

Provider documentation: [send email and attachments](https://resend.com/docs/api-reference/emails/send-email), [idempotency window](https://resend.com/docs/dashboard/emails/idempotency-keys), [Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/), [D1 bindings](https://developers.cloudflare.com/d1/worker-api/).
