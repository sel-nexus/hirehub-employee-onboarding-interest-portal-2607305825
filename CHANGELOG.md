# Changelog

## Login-only dark mode — 2026-11-04

### Added
- An always-dark presentation for Admin Login only, as selected by the product owner. Login content, card, fields, placeholder text, errors and keyboard focus use a scoped dark palette.
- Page-local `frontend/src/features/admin/Login.css`, component scope coverage and `frontend/e2e/login-dark.spec.js` regression journeys for appearance, device preferences, invalid/valid sign-in and isolation from other pages.
- A separate `frontend/e2e/login-dark-preflight.mjs` accessibility/HTML/computed-style and screenshot capture script for review.

### Changed
- `frontend/src/features/admin/Login.jsx`: load the scoped stylesheet and mark the login container; authentication logic and form semantics remain unchanged.
- `frontend/src/features/admin/Login.test.jsx`: extend regression coverage without removing existing assertions.
- `frontend/package-lock.json`: repair pre-existing missing optional platform packages so clean npm installation succeeds; declared dependency versions are unchanged.
- `README.md`: explain the login-only appearance, evidence commands and existing dependency audit warnings.

### Scope and compatibility
- No theme toggle or theme preference storage. Login is dark regardless of device preference.
- Shared header, Home, application form, authenticated dashboard, global stylesheet and authentication/session services are unchanged.
- No breaking changes, new runtime environment variables, backend dependencies or database migrations. Existing browser demo limitations remain.
- Installation still reports 10 pre-existing dependency vulnerabilities; security upgrades were not included in this visual change.
