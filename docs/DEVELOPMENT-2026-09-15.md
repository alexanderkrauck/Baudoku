# Development verification — 2026-09-15

Not released. Production remains unchanged until explicit approval.

## Analysis failure

Reproduced the reported multi-section failure with the real Express analysis endpoint and a mocked provider: hold file cleanup pending, receive the first successful response, immediately submit the next recording section. Before the fix the second response was 429; afterwards both return 200. The user-level guard was released only after remote cleanup despite the result already being sent to the browser.

The guard now releases before asynchronous cleanup. Provider analysis has a 210-second overall deadline and abort signal; a stuck provider returns a recoverable 504 and a retry is accepted. This is bounded request processing, not a persistent background job. A browser closing during the current section may still require repeating that section.

Completed analysis sections are checkpointed in the existing user-scoped local draft. Cache keys contain SHA-256 hashes of the actual audio/photo inputs, timestamps and section position. Retrying after a later failure reuses completed sections, keeps the same report ID, and retains all audio/photo blobs. A changed input is reanalysed. Completed reports awaiting upload are saved without rerunning analysis from the recording screen.

## Camera, annotation and overview

- Pinch and range control use camera zoom constraints when supported. Otherwise a labelled digital zoom applies the same proportional center crop to preview and capture. Capture waits for an in-flight camera zoom constraint. Hardware zoom and touch gestures require real-device verification.
- Photo gallery offers optional arrow, ellipse and freehand annotation, undo/reset and save. Coordinates are relative to the original image. The original Blob and its Drive ID are never replaced. A separate JPEG is uploaded and referenced by optional `annotatedDriveId`. Defect report photos prefer that version; the original remains in the full photo gallery and Markdown media list. Existing records need no migration.
- Compact original KS signet is used for the app brand. The full report logo and 44% report photo column remain unchanged.
- Dashboard adds actual open/done counts and a cross-report defect register with project, trade and status filters. The register uses the same loaded, account-scoped reports as the dashboard.
- Review content scrolls when multiple audio players need room; error messages no longer compete with an oversized heading.

## Verification and remaining field checks

Automated coverage includes the real HTTP lock race, provider timeout/retry, interrupted multi-section analysis with restored checkpoint, original photo preservation and separate upload/restore, proportional portrait/landscape zoom, existing 100-photo recovery and recording interruption tests. Type checking, all unit/integration tests, production build and PWA tests are run locally.

Development report preview uses the existing local Hofkirchen-City fixture and retains its saved trade assignments. Recording preview remains isolated from Firebase/Drive and can demonstrate photo annotation on synthetic test images. No private fixture or generated media is committed.

Not proven by these checks: actual Android/iOS camera zoom/pinch, microphone behaviour under screen lock or OS termination, real Google Drive/Gemini execution for the user's failed live recording, and PDF pagination on the smartphone. Local storage remains subject to browser/device storage limits; clearing site data removes local drafts.

Final local result: type check passed; 113 tests across 17 test files passed; production build and all 5 PWA integration tests passed. Browser check: opened the retained 100-photo synthetic draft, drew and saved an arrow on photo 1, opened a separate tab and confirmed the saved arrow was recovered. The marking controls were checked at 390 × 844 viewport size. The report preview still shows the five existing trade assignments and one unassigned defect. The copied compact logo has the same SHA-256 as the supplied original file.
