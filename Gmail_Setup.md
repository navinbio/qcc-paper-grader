# Connect Gmail to Exam Grader

The Gmail integration is built. Before it can send, the app owner must create a Google application registration. This is done once for the app, not once per professor. No domain purchase, EmailJS subscription, or private mail server is used for this route.

## 1. Create the Google project

Open [Google Cloud Console](https://console.cloud.google.com/) in your normal browser and sign in with the Google account you want to manage the app. Create a project named **Exam Grader** and select it.

Do not purchase services or enable paid billing for this setup. If Google asks you to accept account terms or says an administrator must approve access, complete or review that yourself; share a screenshot if you are unsure. Do not share passwords, authorization codes, access tokens, or client secrets.

## 2. Enable Gmail API

In **APIs & Services → Library**, search for **Gmail API**, select it, and click **Enable**.

## 3. Configure Google Auth Platform

Open **Google Auth Platform**. If shown, choose **Get started**.

- App name: **Exam Grader**.
- User support email: your Google account email.
- Contact email: an address you monitor.
- Audience: **External** for a personal Gmail account and professors using other Google accounts.
- Keep the app in **Testing** for the initial pilot.
- Under **Audience → Test users**, add your own Gmail account. Add participating professors’ Google accounts before they test. Students receiving results do not need to be added as test users or sign in to the grader.

Under **Data Access**, add the send-only scope:

```text
https://www.googleapis.com/auth/gmail.send
```

The browser integration also requests `openid` and `email` for basic identification of the sending account. It does not request Gmail inbox-reading, modification, or full mailbox access.

## 4. Create the browser client

Under **Clients → Create client**:

- Application type: **Web application**.
- Name: **Exam Grader browser**.
- Authorized JavaScript origin:

```text
https://navinbio.github.io
```

Use the origin above without `/qcc-paper-grader/` or any query string. The Google popup token flow used by this app does not need an authorized redirect URI. Do not create a desktop client or put a client secret into the website.

Create the client and copy its **Client ID**. It looks like:

```text
1234567890-example.apps.googleusercontent.com
```

This client ID is public configuration and can be shared with the app developer. A **client secret** is different and must not be shared or added to this app.

## 5. Activate the app

Send the public Client ID to the developer so it can be placed in the website’s `gmail-config.json` for all professors. Alternatively, the owner can enter it locally through **Export → More options → Connect Gmail → Google app client ID**, then **Save Google setup**.

Other professors use the same centrally configured app ID and do not create developer projects. Each connects their own Google account; messages are sent from that account, not from the app owner’s account.

## 6. First test

Use synthetic student information and a roster email address belonging to you. Make sure Gmail is enabled on the Google account you connect.

1. Open [Exam Grader](https://navinbio.github.io/qcc-paper-grader/?v=1.11.0) in Safari or Chrome.
2. Open **My workspace**, import the synthetic roster with an **Email** column, and grade a sheet.
3. Tap **Email graded sheets to individual students**.
4. If prompted, choose **Connect Gmail** and complete Google’s authorization screen yourself. Review the app identity and requested permissions. If Google blocks access, stop and share the error; do not change college restrictions.
5. Check the sender address displayed in the confirmation, then tap **Confirm**.
6. Check the recipient inbox, PDF contents, and Gmail Sent. Test a second click: unchanged accepted sheets should not resend.

## Operation and limitations

- The actual individual graded PDF is attached. The email body includes the student’s name, ID, exam, score and percentage. Each student receives only their own message and PDF, with no class-wide CC/BCC.
- Google access tokens stay in browser memory, not IndexedDB, ZIP backups, GitHub, or the server. Reconnect after refreshing/closing the app or when authorization expires. Google may remember consent, but an account chooser or sign-in can still be needed.
- Grading stays on-device. After Confirm, the individual PDF and email content go directly to Google over HTTPS. The earlier optional Resend relay is not used by this Gmail interface.
- Internet and an open screen are needed while sending. No background/offline email is promised. Gmail sending limits still apply.
- Accepted means Gmail returned a message ID; it is not proof of inbox delivery.
- The app checkpoints a submission before making the Gmail request. An interrupted or uncertain outcome is not automatically retried because Gmail’s send endpoint does not provide the relay’s deduplication guarantee. Check Sent manually for those sheets. Clearly rejected requests can be retried after reconnecting or waiting for limits to reset.
- Accepted and uncertain delivery statuses are retained with the saved exam and included in new exam backups. Clearing browser data or restoring an older backup can lose sending history. Do not deliberately re-import an exam to force a resend.
- Sending a corrected grade, changing a recipient, or changing whether correct-answer letters are included creates a new message and requires another confirmation.
- Guest mode does not send because it has no class roster for verified student-to-email matching.
- This initial setup is a small pilot. Google may show a testing/unverified-app notice, and testing accounts must be listed. Public availability to arbitrary professors can require Google verification and additional published policy/domain information. No bypass or public approval is claimed.
- Standard Gmail API use currently has no additional API charge within Google’s stated limits. This is not a promise of unlimited sending or unchanged future pricing.
- Before using real student grades, confirm the institution permits the chosen account and data handling.

## Documentation

[Google token model](https://developers.google.com/identity/oauth2/web/guides/use-token-model) · [Browser setup](https://developers.google.com/identity/oauth2/web/guides/get-google-api-clientid) · [Sending attachments](https://developers.google.com/workspace/gmail/api/guides/sending) · [Limits and pricing](https://developers.google.com/workspace/gmail/api/reference/quota) · [Verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification)

Implementation checks: 56 automated tests passed, including recipient isolation, exact PDF preservation, Unicode MIME encoding, token expiry, denied permission, disconnect, rejected sends, uncertain sends, and saved-delivery handling. Mocked browser checks passed for connection, Cancel, Confirm, exact PDF submission, repeated-click protection and interrupted outcomes. No real email was sent. Live Google authorization and inbox delivery cannot be completed until this registration is configured.
