# DAYFRAME

A mobile-friendly personal operating system for tasks, deadlines, projects, focus tracking, distraction logs, workouts, and weekly reviews. Built with Next.js, TypeScript, Firebase Authentication, and Cloud Firestore.

## What is included

- Google sign-in and email/password sign-in, with account creation
- Cloud-synced data across devices using Firebase
- Daily check-in on the first authenticated login for each **local calendar day**
- The original day-start timestamp is preserved when you sign in again that same day
- Three editable daily priorities saved to that day's check-in document
- Dashboard progress: focus minutes, task completion, workouts, distractions, upcoming deadlines
- Tasks, deadlines, projects, focus-session logs, distraction logs, gym logs, and weekly reviews
- Mobile-friendly responsive navigation
- Firestore security rules that restrict each user to their own records

## 1. Create a Firebase project

1. Open https://console.firebase.google.com/ and create a new project named `dayframe` (or another name you prefer). Keep it separate from the Random Hours portfolio.
2. In **Project settings → General → Your apps**, register a **Web app**.
3. Copy the Firebase web configuration values. The app needs `apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, and `appId`.
4. Open **Build → Authentication → Get started → Sign-in method**.
5. Enable **Email/Password** and **Google**. For Google, select a support email and save.
6. Under **Authentication → Settings → Authorized domains**, add the hostname for the app you will use. For Codespaces, use the hostname from the forwarded port 3000 URL (add the domain/hostname Firebase accepts, not `https://`). Also add the production domain when deployed.
7. Open **Build → Firestore Database → Create database**. Start in production mode.
8. Open Firestore **Rules**, replace the editor with the contents of `firestore.rules`, and click **Publish**.

The included rules allow signed-in users to read and write only within `users/{their-own-uid}/...`. Do not replace them with public rules such as `allow read, write: if true`.

## 2. Set environment variables in Codespaces

In the repository root, copy the example file:

```bash
cp .env.example .env.local
```

Edit `.env.local` and replace every placeholder with the matching value from Firebase **Project settings → Your apps → SDK setup and configuration**:

```dotenv
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project-id.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...
```

These are Firebase web-app configuration values, not service-account credentials. **Never add a Firebase Admin SDK private key or service-account JSON to `.env.local` or browser code.** `.env.local` is git-ignored.

## 3. Run in GitHub Codespaces

From the terminal at the repository root:

```bash
npm install
npm run dev
```

Open the forwarded **port 3000** link. If Google sign-in returns an `auth/unauthorized-domain` error, copy the hostname from that forwarded URL and add it in Firebase Authentication → Settings → Authorized domains, then retry. If you change `.env.local`, stop and restart `npm run dev` so Next.js reloads the environment.

## 4. Daily check-in behavior

- The first successful sign-in of a local calendar day creates `users/{uid}/days/YYYY-MM-DD` and stores `started_at`.
- Signing in again that same day reads the existing document and **does not reset** `started_at`.
- The check-in card lets you save three priorities for the current day.
- The date is calculated in the browser's local timezone. If you travel or change the device timezone around midnight, the local-day boundary can change.
- Your other records are stored under `users/{uid}/{collection}/{documentId}` and sync across devices when using the same account.

## 6. AI progress coach (optional)

The AI Coach uses an OpenAI API call from a server-side Next.js route. It verifies the Firebase ID token, reads only the authenticated user's DAYFRAME records with Firebase Admin, and stores daily/weekly assessments under `users/{uid}/ai_assessments`. The API key and Firebase service-account credentials must remain server-only.

1. Create an OpenAI API key in your OpenAI developer account and make sure API billing/limits are configured.
2. In Firebase Console → Project settings → Service accounts, generate a private key for the service account of this project. **Treat this JSON as a password**; never commit it, paste it into chat, or expose it to the browser.
3. Add these server-only values to your ignored local `.env.local` file:
   ```dotenv
   OPENAI_API_KEY=your_openai_api_key
   OPENAI_MODEL=gpt-4o-mini
   FIREBASE_SERVICE_ACCOUNT_KEY={"type":"service_account",...}
   ```
   Paste the entire service-account JSON as a single line for `FIREBASE_SERVICE_ACCOUNT_KEY`. Keep it private. In a hosted deployment, use the host's encrypted environment-variable settings instead of committing credentials.
4. Install the added server SDK and restart Next.js:
   ```bash
   npm install
   npm run dev
   ```
5. Open **AI Coach** while signed in. It generates and caches one daily verdict per local date; use the weekly report tab to generate a detailed weekly assessment. Reassessing explicitly makes a new API call.

The coach's execution score is a heuristic, not an objective measure of personal worth. It should cite logged evidence and identify missing data rather than guessing why something happened. AI provider usage can incur charges; configure usage limits and review prompts/data before using it.

## 7. Deploy (optional)

Deploy the separate DAYFRAME repository to Vercel or another Next.js host. Add the same six `NEXT_PUBLIC_FIREBASE_*` values in the host's environment settings. Add the production hostname to Firebase Authentication → Settings → Authorized domains. Do not place this app in the Random Hours repository.

## Suggested starter records

Add these in the app after sign-in, confirming exam details against the official university communication:
- University of Bremen exam — 27 October 2026, 4:30 PM Germany local time (9:00 PM India time on that date)
- Possible second exam — 29 October 2026; confirm exact time and whether it is still scheduled
- Projects: Bremen exam preparation; University applications; Random Hours portfolio; DAYFRAME setup and routine

## MVP limitations

- Focus sessions are manually logged; a live start/stop timer is not included yet.
- Deadline reminders and push/email notifications are not included.
- DAYFRAME does not monitor phone use, browser activity, email, or calendars.
- Firebase free-tier quotas and billing settings depend on your project and current Firebase plan. Review Firebase's current pricing before enabling paid services.
