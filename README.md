# AmigoDocs

AmigoDocs pairs people who live abroad with verified helpers ("amigos") in their home country. The amigo visits the local office, obtains the document (a birth certificate, a civil record, an apostille), and sends it. The app covers Mexico, Central America, and South America, and it works in Spanish, English, and Portuguese.

This repository contains a working first version: a mobile-first web app with real accounts, a real database, matching, chat, file sharing, reviews, and an administrator area.

## What a person can do

**Someone who needs a document**

1. Creates an account and posts a request: the document, the country and city where the record is kept, and the urgency.
2. Sees suggested amigos, ranked by how close they are to that office, with the reasons for each suggestion.
3. Starts a conversation, and both sides decide whether to work together.
4. Follows six progress steps, shares files privately, confirms receipt, and leaves a review.

**Someone who wants to help**

1. Sets up a helper profile: country, city, languages, and the documents they know.
2. Asks to be verified. An administrator confirms their identity outside the app.
3. Sees open requests in their country, with their own city first, and offers to help.
4. Updates progress as the work moves along, and receives a review at the end.

**An administrator**

Approves or rejects verification requests, reviews reports, suspends accounts, and publishes guides.

## Run it on your computer

You need [Node.js](https://nodejs.org) version 22 or newer. Nothing else is required, because development uses an embedded database.

```bash
npm install
npm run seed     # optional: adds fictional demo people
npm run dev
```

Open http://localhost:5173. If you ran the seed step, every demo account uses the password `amigodocs-demo`:

| Account | Role |
| --- | --- |
| `lucia@example.com` | Needs a birth certificate from Bogotá |
| `ana@example.com`, `carlos@example.com`, `miguel@example.com` | Verified helpers |
| `sofia@example.com` | Helper waiting for verification |
| `admin@example.com` | Administrator |

Run the automated tests with `npm test`.

## Put it online

The app is one Node.js service plus one Postgres database, so it runs on any host that offers both.

1. Create a Postgres database and copy its connection URL.
2. Set these environment variables on the host (see `.env.example` for details):
   - `DATABASE_URL`
   - `FILE_ENCRYPTION_KEY` (64 hexadecimal characters; keep a backup, because shared files cannot be read without it)
   - `ADMIN_EMAIL` and `ADMIN_PASSWORD` (at least 12 characters)
3. Build command: `npm install && npm run build`
4. Start command: `npm start`

The server creates its tables on first start, serves the web app, and answers a health check at `/api/health`.

## How the code is organized

```
server/src/
  index.js          starts the server
  app.js            security headers, rate limits, routes, error handling
  db.js             one interface over Postgres (production) and PGlite (development, tests)
  schema.sql        every table
  matching.js       how helpers are ranked for a request
  auth.js           passwords, sessions, cross-site request protection
  totp.js           two-step sign-in codes
  filecrypto.js     encryption of shared files
  routes/           accounts, requests, conversations and files, administration
server/test/        30 automated tests
client/src/
  pages/            one file per screen group
  strings.js        all interface text in three languages
  styles.css        the visual design
```

## Decisions worth knowing about

- **Only verified helpers are matched.** A helper cannot appear in suggestions, see requests, or receive files until an administrator approves them. Set `REQUIRE_VERIFIED_HELPERS=false` to relax this, which is not recommended.
- **No identity documents are collected for verification.** Storing passport or ID scans would make the service a target and a legal liability. Verification happens on a video call or through a partner organization, and the app records only the decision.
- **No money moves through the app.** A request can say how the person will say thank you, and the safety rules explain how to handle office fees. Processing payments between members would bring money-transmission regulation with it.
- **Passports and visas are not offered.** Those normally require the applicant in person, so a helper cannot obtain them.
- **Privacy by default.** Members see each other's first name and last initial. The free-text details of a request are visible only to helpers who are in a conversation about it.
- **Files are encrypted at rest, not end to end.** Files are encrypted with a key the server holds, are visible only to the two participants, and are deleted after 7 days. The product should not describe this as end-to-end encryption.
- **Matching is transparent.** Scores come from plain weights in `server/src/matching.js` (same city 40, same region 20, knows the document 20, verified 15, shared language 10, rating up to 10, experience up to 5). The weights are a starting point to tune with real pilot data.

## Not built yet

These are needed before a public launch and are listed in rough priority order.

1. **Email.** There is no email confirmation at sign-up, no password reset, and no notification when a message arrives. All three need an email provider.
2. **Terms of Service and Privacy Policy.** The sign-up screen links to community safety rules. A lawyer should write the legal documents, review the safety disclaimer, and confirm compliance with GDPR, LGPD, and United States state privacy laws.
3. **Conversation review for administrators.** Reports show who was reported and why. Reading the reported conversation currently requires database access.
4. **Automatic chat translation.** The interface is trilingual, but messages are not translated.
5. **Push notifications and full offline use.** The app installs to a phone's home screen and keeps its shell available offline, but it does not yet send push notifications.
6. **Structured city names.** Cities are free text, compared without accents or capitalization. A list of municipalities per country would make matching more reliable.
