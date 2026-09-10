# Validation — 10 September 2026

## Automated checks

- TypeScript (`npm run lint`) passed.
- 52 Vitest tests passed: authenticated analysis API, upload boundaries, cleanup, room/tag validation, Markdown export and retry IDs, Drive folder settings and imports, local/remote revision conflicts, account changes, recording clock, and Cloud Run payload budgets.
- Five production/PWA checks passed (`npm run test:pwa`): generated assets, offline navigation, authenticated-request cache exclusions, cache lifecycle, and actual production Express routes.
- Production build passed; Vite reports a large frontend bundle warning (Firebase is the largest dependency).
- Dependency audit reported zero vulnerabilities.
- Git diff whitespace checks passed.

## Browser exercises

Playwright CLI was used with a local browser and synthetic data. Firebase sign-in was seeded in the browser's real persistence store; Google identity responses were mocked. Firebase writes were deliberately blocked to exercise recovery. Drive and Gemini responses were mocked; no real user files or Google account were changed.

Verified:

- Desktop login and mobile login layout.
- Firebase account survives refresh while the temporary Drive token is absent.
- Actual MediaRecorder with a synthetic audio stream: start, pause, frozen pause timer, resume, stop, and playable preview.
- Local audio/title recovery after page reload and an interrupted development reload.
- Capture/import photo selection, stable photo ID through multipart analysis, authenticated image rendering, and manual reassignment between rooms.
- Full recording → original media backup → mocked AI → Markdown/JSON export → report navigation, while Firebase is unavailable.
- Room/tag filters, room name and tag edits, local save despite unavailable Firebase.
- No horizontal overflow at 390 px in login, recording/review, and report views.
- Browser JPEG analysis-copy generation preserves photo ID/timeline and leaves originals unchanged.
- Production service worker controls the app, and an offline reload renders the app shell.

Screenshots and temporary scripts live under ignored `output/playwright/` locally.

## External configuration still to verify

This does not claim a live Gemini call, real Google Picker consent, actual Firestore write acknowledgement, cloud rules deployment, real-device microphone/background behavior, or installation on a physical iPhone/Android device. These depend on the deployment's Google project configuration and authenticated user account. Follow the setup and live verification steps in the README.

## Mobile recording follow-up (2026-09-10)

Built on Gemini commit `6d17259`; its model selection and dependency files are unchanged.

- TypeScript, 63 Vitest tests and all five production/PWA checks pass. New tests cover separate draft recovery, legacy migration, ordered/idempotent chunk recovery, targeted deletion, storage failures, background flushing and microphone interruptions.
- Real Chromium MediaRecorder with synthetic audio/video: capture controls fit 390×844, 320×568 and 844×390. Document height equals viewport height. Photo, pause and finish buttons remain inside the viewport.
- In-app photo capture leaves the synthetic microphone track live. Pause/resume works; finishing exposes the primary save/analysis action.
- Reload during recording recovered the same 32,286 audio bytes and one photo. Starting a different draft retained the previous recording. The recovered save button fits the 320×568 viewport, including the interruption notice.
- With the browser offline, recording committed audio to IndexedDB, microphone mute paused the timer, explicit resume worked, and the finished recording played. Cloud save remained disabled until connectivity returned.
- Injected IndexedDB quota errors during camera capture. The photo remained in memory, the camera closed without inviting duplicate capture, and the storage error was shown. Once writes were re-enabled, pending audio and the photo committed and the error cleared.
- Existing live Gemini behavior is user-verified; local browser exercises use mocked identity/Drive/AI and blocked Firestore. No physical phone lock-screen guarantee is inferred from desktop simulation. Browser storage eviction, OS termination and delayed media events remain platform limits.
- Re-ran finish → mocked Drive originals → mocked room analysis → Markdown/JSON export → report navigation with Firestore unavailable; the new primary action completed the flow.
