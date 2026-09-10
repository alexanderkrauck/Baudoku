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
