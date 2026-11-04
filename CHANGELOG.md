# Changelog

## Login-page dark mode
- Added an accessible **Dark mode** toggle to the existing administrator login card. Light remains the default; the toggle is keyboard-operable and exposes its pressed state.
- Dark mode is local to the login component and resets on navigation away or reload. No browser preference is saved, and the OS theme does not override the selected light default.
- Added scoped dark background, card, text, placeholder, error, focus and autofill styling while retaining HireHub typography, spacing and primary action styling. The shared header, public Home/Apply pages and authenticated dashboard are unchanged.
- Theme switching retains credentials and validation errors; demo authentication and session behavior are unchanged.
- Repaired the pre-existing incomplete npm lockfile so clean dependency installation works, without changing package.json's declared versions.

### Files
Modified `frontend/src/features/admin/Login.jsx`, `frontend/package-lock.json`, `.gitignore` and `README.md`. Added `frontend/src/features/admin/Login.css`, `frontend/src/features/admin/LoginTheme.test.jsx` and `frontend/e2e/login-dark-mode.spec.js`. Refreshed `graphify-out/graph.json` after commits. Testing also adds a source-level capture script and generated, ignored browser evidence.

### Compatibility and migration
No breaking changes, backend/API changes, new dependencies, database changes or migrations. Existing browser-only demo limitations still apply; this is not real authentication. The inherited package versions have npm audit findings (10: 2 moderate, 6 high, 2 critical); security upgrades are outside this page-presentation change.
