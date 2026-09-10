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
