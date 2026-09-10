# End-to-end refinement

- [x] Map existing screens, data model, integrations, and concrete failure points.
- [x] Persist login across refresh; reconnect Drive separately when needed.
- [x] Refine login, dashboard, recording/review, report editing and export.
- [x] Preserve local drafts, microphone MIME type, pause-aware photo timestamps, and retryable saves.
- [x] Repair authenticated Gemini analysis, response validation, limits, and cleanup. (analysis_backend)
- [x] Make Drive the media/report storage home; add persistent folder selection. (drive_settings)
- [x] Add installable PWA and safe offline app shell. (pwa_quality)
- [x] Fix Firebase configuration/index saving and provide owner-scoped rules.
- [x] Verify typecheck/build, regression tests, desktop/mobile browser flows and failure states.
- [x] Document deployment configuration and any live-service validation limits.
- [x] Review changes, commit, and push to origin/main.

Validation details and live-service boundaries are recorded in [docs/VALIDATION.md](docs/VALIDATION.md).

## Mobile recording and recovery follow-up

- [x] Review Gemini's latest changes and preserve its working analysis model.
- [x] Fit capture controls into one phone viewport; make save/analysis the explicit next step.
- [x] Add per-recording incremental local audio recovery and legacy draft migration. (durable_recordings)
- [x] Add wake lock, background flush, interruption handling, and in-app camera. (mobile_lifecycle)
- [x] Verify small-phone/landscape layouts, offline capture, reload recovery, and storage retry.
- [x] Commit and push the verified follow-up.

## Drive authorization before capture

- [x] Persist valid, account-scoped Drive authorization across reloads.
- [x] Request missing authorization and verify Drive access before online recording.
- [x] Remove implicit Google popup from saving; expose expired authorization separately.
- [x] Verify regression tests and browser flow, commit and push.
