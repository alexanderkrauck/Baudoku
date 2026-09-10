# Baudoku

German-language construction walkthroughs: record audio, capture photos, generate a structured Gemini report, review it, and save the files in your Google Drive. Firebase handles sign-in and the report index; it is not the media storage backend.

## Development, protected main, and automatic deployment

**Do everyday work on `development`, the GitHub default branch. `main` is production.** GitHub enforces these rules through active repository rulesets; they are not merely conventions.

- Direct pushes, force-pushes and deletion of `main` are blocked. There are no configured bypass actors, including administrators. Administrators can still deliberately change repository rules, as with any GitHub repository.
- A PR into `main` must come from this repository's `development` branch. Feature branches and forks must first go through `development`.
- The exact development commit being promoted must have a successful **Checks** push run on `development`.
- The PR must be up to date with `main` and pass `verify (npm)`, `verify (bun)`, `container`, and `promotion-policy`. Unresolved review threads block merging. A separate human approval is not required for this single-maintainer repository.
- Use merge commits for promotion; squash/rebase merges and automatic branch deletion are disabled. `development` accepts normal work pushes, but its deletion and force-pushes are blocked.
- Pushing `development` or opening a PR never deploys. Merging into `main` runs checks again; only successful main push checks invoke production deployment.

Typical work:

```sh
git switch development
git pull --ff-only origin development
# Edit and commit normally.
git push origin development
# Wait for the development Checks run to succeed.
gh pr create --base main --head development --title "Release: describe the change" --body "Promote the tested development changes."
gh pr checks --watch
gh pr merge --merge
# Bring the release merge back into development before more work.
git fetch origin
git merge origin/main
git push origin development
```

For optional feature branches, branch from `development` (for example `codex/my-change`) and target `development` with their PRs. If a promotion check ran before development checks finished, rerun it after the exact development commit is green. Do not bypass protection or push directly to main to fix a failed check.

### Production deployment

The reusable `.github/workflows/deploy.yml` is called by Checks only for `main` pushes after every required job passes. It builds a production container from the tested commit, pushes its immutable digest to Artifact Registry, deploys a no-traffic candidate, checks health/Gemini configuration/SPA/PWA routes, and then routes live traffic to it. Failed candidate checks leave production unchanged; failed live smoke tests restore the previous traffic split. Queued older commits cannot supersede newer main commits. There is no unchecked manual deployment trigger.

Configured target:

| Setting | Value |
| --- | --- |
| Google Cloud project | `gen-lang-client-0187125016` |
| Region | `europe-west2` |
| Existing Cloud Run service | `drive-sync-notes` |
| Production URL | [Open Baudoku](https://drive-sync-notes-gma5yake7q-nw.a.run.app) |
| Artifact Registry repository | `baudoku` |
| GitHub environment | `production`, restricted to `main` |
| Deployment identity | `baudoku-github-deploy@gen-lang-client-0187125016.iam.gserviceaccount.com` |

The production environment stores non-secret configuration variables: `GCP_PROJECT_ID`, `GCP_REGION`, `CLOUD_RUN_SERVICE`, `GCP_ARTIFACT_REPOSITORY`, `GCP_WORKLOAD_IDENTITY_PROVIDER`, and `GCP_DEPLOY_SERVICE_ACCOUNT`. Authentication uses Google Workload Identity Federation with repository/owner IDs and the main deployment workflow restricted in its trust condition. No service-account JSON key is stored in GitHub. The deployer can update this Cloud Run service, publish into this artifact repository, and use the service's existing runtime identity. A custom project-level role adds only `resourcemanager.projects.get`, which the gcloud replace command needs to resolve the project.

Existing Cloud Run environment variables, Gemini credentials, service URL, runtime identity, IAM and scaling configuration are retained. Container revisions replace AI Studio's source overlay; the app's Express/Vite development workflow, media permissions and AI Studio configuration remain compatible. Use development for AI Studio-originated code changes too. Manual AI Studio production deployment is a separate route that would bypass this release pipeline, so production releases should use the protected GitHub flow.

To retry a deployment failure, rerun failed jobs in the main Checks run after resolving its cause. The deployment summary records the revision and previous traffic configuration. For an emergency rollback using the listed previous revision:

```sh
gcloud run services update-traffic drive-sync-notes --project=gen-lang-client-0187125016 --region=europe-west2 --to-revisions=PREVIOUS_REVISION=100
```

## Run locally

Use Node.js 22 or newer and npm. `package-lock.json` is the authoritative dependency lockfile. The synchronized `bun.lock` supports Bun-based installs, including AI Studio environments. CI checks clean, frozen installs with both npm and Bun, then runs the same Node.js build and tests. After dependency updates, regenerate `package-lock.json` with npm, remove the old `bun.lock`, and run `bun install --lockfile-only` to migrate the npm resolution; commit both lockfiles. The `qs` override selects the patched 6.16 release while Express 4 pins an older minor range.

```sh
npm ci
cp .env.example .env
npm run dev
```

Open `http://localhost:3000`. Set `GEMINI_API_KEY` in `.env` or the server environment. Do not prefix server secrets with `VITE_`; those variables are included in the browser bundle.

```sh
npm run lint
npm test
npm run test:pwa
npm start
```

`npm run dev` runs Express and Vite together. `npm run test:pwa` builds the app, tests the generated service worker cache boundaries, and checks the actual production HTTP server. `npm start` explicitly selects production mode. `npm run build` produces the browser app and `dist/server.cjs`; the production Express server serves both `/api/*` and the SPA. `npm run preview` serves only the static frontend and cannot process AI analysis.

## AI Studio / Cloud Run

The app requests microphone/camera access in `metadata.json`, as required by the [AI Studio embedding permissions](https://ai.google.dev/gemini-api/docs/aistudio-build-mode). Keep the existing Express + Vite deployment model; the AI Studio media plugin and `DISABLE_HMR` behavior remain in `vite.config.ts`. Set the build command to `npm run build`, the run command to `npm start`, and `NODE_ENV=production`. The server binds to `0.0.0.0` and uses the platform's `PORT` (3000 by default).

Configure `GEMINI_API_KEY` as a server secret. `GEMINI_MODEL` defaults to `gemini-3.1-pro-preview` and can be changed to a model available to your project. The analysis endpoint verifies Firebase ID tokens, so `FIREBASE_PROJECT_ID`, if set, must match the frontend's `firebase-applet-config.json` project. `GET /api/health` reports whether an analysis key is configured without returning its value.

Configure the deployment hostname in Firebase Authentication's authorized domains. Enable Google as a Firebase sign-in provider. Configure the matching Google OAuth web client and its authorized JavaScript origins. HTTPS is required on deployed sites for microphone capture and PWA installation. Test sign-in and installation at the deployed URL outside the AI Studio embedded preview; popup and install capabilities depend on the containing browser.

## Firebase configuration and rules

The checked-in `firebase-applet-config.json` is public browser configuration, not an admin credential. The app uses the `(default)` Firestore database unless `VITE_FIRESTORE_DATABASE_ID` is provided at build time or `firestoreDatabaseId` is present in that JSON. Ensure the selected database actually exists. The index is stored at `users/{firebaseUid}/reports/{reportId}`.

Deploy the included owner-only rules to your Firebase project (requires an authenticated Firebase CLI):

```sh
firebase deploy --only firestore:rules --project gen-lang-client-0187125016
```

`firebase.json` targets the default database. For an existing named database, configure its exact name before deployment:

```json
{
  "firestore": [{ "database": "YOUR_DATABASE_ID", "rules": "firestore.rules" }]
}
```

Build with `VITE_FIRESTORE_DATABASE_ID=YOUR_DATABASE_ID` so the client and rules deployment agree. The rules allow users to read/write only their own reports and Drive destination setting at `users/{firebaseUid}/settings/drive` and require the basic report shape; all other collections are denied. Firebase Storage rules or a Storage bucket are not required for the new capture workflow. Existing media previously saved only in Firebase Storage is not automatically migrated.

## Drive and data recovery

AI requests resize photo copies to at most 1600 pixels and stay below Cloud Run’s 32 MiB HTTP/1 request limit. Original photos are uploaded to Drive unchanged.

Drive contains the audio, photos, structured JSON report data, and a readable Markdown report (`bericht.md`). The Markdown export includes room summaries, transcripts, predefined tags, and private Drive media links. Edits update the existing export files on synchronization. Each walkthrough has a dedicated subfolder under the selected destination. Enable the Google Drive API for the OAuth project. Folder selection with the Google Picker additionally requires the Google Picker API, a browser API key (`VITE_GOOGLE_API_KEY`), and the Cloud project number (`VITE_GOOGLE_PROJECT_NUMBER`). These variables optionally override `apiKey` and `messagingSenderId` from the Firebase configuration. Restrict that browser key to your deployment origins and the required Google APIs.

The app requests the `drive.file` scope. It can use files created by the app or explicitly selected through the Picker; this does not grant access to the entire Drive. Changing the destination affects future walkthroughs. Existing reports retain their own folder references.

Firebase sign-in persistence is separate from Drive authorization. Reloading restores the signed-in account and reuses an unexpired Drive token from this tab’s session storage. Online recording checks Drive authorization before opening the microphone; missing authorization is requested before capture. Saving never implicitly opens a Google login popup. A Drive reconnect may still be required after closing the browser session or when its short-lived Google access token expires. Tokens are not permanent passwords and cannot be silently extended just by retaining Firebase login.

Draft audio/photos and a report copy live in IndexedDB, scoped to the signed-in user, so a failed AI request or Firebase write can be retried. Each recording has its own recovery record; starting a new walkthrough does not replace earlier drafts. Audio is journaled incrementally with a requested one-second recorder interval, rather than rewriting the entire recording on each save. Failed writes remain queued in memory for retry. The screen shows the last committed audio timestamp and reports storage failures.

Recording controls fit one viewport, including small phones and landscape. Photos use an in-app camera where supported to avoid handing off to the native camera app; existing photos can also be selected. Finishing leads directly to the prominent Drive-save-and-analysis step. Leaving that screen requires an explicit keep-as-draft choice.

The app requests persistent browser storage and a screen wake lock where available, flushes audio when backgrounded, and detects microphone interruptions. **Manual screen locking or OS termination can still suspend a web app.** Recorder intervals are not exact, and only already committed chunks are recoverable after a crash; some final audio may be lost. Keep the screen open while recording. Installing the PWA does not grant native background-recording privileges. A local copy is not a cloud backup: clearing website data removes it, and another device cannot see it until it is saved online.

## Installed app and offline behavior

The production build includes a manifest, install icons, and a service worker. Supported browsers show an Install button when installation becomes available. On iPhone/iPad, use Safari's Share → Add to Home Screen. AI Studio preview and the Vite development server do not register a service worker.

After one successful online production visit, the app shell can start offline. Previously saved local records/drafts remain on that browser. Google sign-in, Drive downloads/uploads, and Gemini analysis require a connection. The service worker caches only public shell files; it does not cache authenticated API responses or Drive media. Updates are offered explicitly rather than automatically reloading an active recording.

## Verification boundaries

Automated build/type checks and mocked browser/API tests can verify navigation, local recovery, contracts, and error handling. They do not prove that the deployed OAuth consent screen, Firestore rules, Google project quotas, Drive Picker configuration, or Gemini billing are configured correctly.

Before relying on a deployment, use a test account to sign in, reload, choose a Drive folder, record/pause/resume with photos, generate a report, edit and save it, and inspect the actual Drive files. Open the report on a second device to verify the Firebase index. Test an expired Drive authorization and an offline retry. Install the production PWA and check that an offline reload opens the shell. No cloud-rule deployment or live-account smoke test is implied by pushing this repository.

See [the project map](docs/PROJECT_MAP.md) for module boundaries and the failure modes addressed.
