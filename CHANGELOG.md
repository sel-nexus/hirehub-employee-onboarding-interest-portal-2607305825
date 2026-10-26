# Changelog

## HireHub 2.0 — 2026-10-26

Revised the existing HireHub React 18/Vite static SPA in place. No backend, database, API, identity provider or production runtime was added.

### Added
- Curated initial/reset baseline: eight candidate submissions across Engineering, Design, Product, Marketing and Operations and five hiring stages; Alex/Jordan/Taylor and two administrator accounts.
- Unified candidate/recruiter login at `/login`, immediate candidate signup at `/register`, persistent local identity and role-specific guards.
- `/candidate` application records, exact four-stage progress labels, next steps, interview schedule and editable name/email/mobile. Candidate projection excludes recruiter notes and other users' records.
- Recruiter live name/email search, URL-backed department filters, pipeline distribution, quick status changes, private notes and interview schedule editing.
- Bundled sample resume selection/text and safe HTTP(S) portfolio links in an accessible modal drawer. Resume files/portfolios are not automatically fetched; explicit portfolio links open a new tab.
- Footer Reset Mock Data with confirmation, session clearing, curated restoration, theme preservation and honest storage-error feedback.
- OS-aware persistent light/dark theme, PRD indigo/slate CSS tokens, readable semantic stage colors, focus rings, mobile wrapping/scrolling and reduced motion.

### Changed modules
- `frontend/src/App.jsx`, `main.jsx`, `components/Header.jsx`, `App.css` — seed lifecycle, routes/role state, theme startup/navigation and shared responsive styling.
- `features/admin/auth.js`, `Login.jsx` — replaced old boolean sessionStorage authentication with validated local users/session; retained legacy key export for reset cleanup.
- `features/apply/submissions.js`, `validation.js`, `Apply.jsx`, `components/SubmissionFields.jsx` — optional ownership/status/notes/material/schedule fields, Product allowlist, strict metadata validation, verified writes and session-derived application identity.
- `features/admin/Dashboard.jsx`, `EditSubmission.jsx` — filtering, pipeline/status/material controls and record maintenance.
- New feature modules under `features/demo`, `features/access`, `features/candidate`, `features/theme`, and `features/admin/ResumeDrawer.jsx`.
- Colocated unit/component tests and all seven browser specs cover updated behavior, storage failures, guards, privacy, persistence, dialogs and desktop/mobile themes.
- README updated for 2.0 routes, credentials, local-only trust boundary, recovery, deployment and actual test outcomes. Code graph refreshed after commits.

### Compatibility and migration
- Sessions now use `hirehub_session` with userId/role/displayName/loginTimestamp and persist until explicit logout/reset, including tab closure. The old `hirehub_admin_auth` sessionStorage flag is not trusted.
- Valid nonempty legacy six-field submissions remain intact. Unlinked legacy records are not assigned to candidates by matching email alone; recruiters still see them.
- Optional extended records keep identity/time immutable. Repeated email is permitted only for the same nonempty linked userId; unlinked/conflicting-user duplicates remain rejected.
- Signup/profile/application phone rules are aligned to canonical ten digits. Signup accepts formatting but rejects longer numbers/country codes without truncation. Names/emails reuse legacy validation, with a 254-character email bound for signup/profile.
- Candidate contact saves update local user/linked submissions/session and attempt verified rollback on failures. Multi-key browser writes are not atomic; partial changes are announced, never reported as success.
- Empty/corrupt initial stores seed defaults. Deleting all submissions shows empty state until a reload, which reseeds defaults by design. Reset intentionally replaces test accounts/records and signs out; it preserves theme/unrelated keys.
- Static hosting, SPA rewrites, nginx container and environment contract remain in their established layout. No new deployment service or secret is needed.

### Verification and known risk
- Before edits: 304 tests/build passed. Final: 1,022 unit/component tests passed; production build passed.
- Independent final test critic PASS 1.0000, zero high failures.
- 88 unique browser cases have passing evidence: initial full run 86/88, then the affected eight-case recruiter spec passed on targeted reruns after replacing an external-example availability dependency with genuine same-origin native-link activation and earlier popup error observation. No application guard or privacy assertion was weakened.
- Four desktop/mobile light/dark preflight journeys captured screenshots, ARIA, HTML and computed styles. Chromium absence was resolved with one installation retry.
- Inherited pinned dependencies were not upgraded. npm audit reports 10 advisories (2 moderate, 6 high, 2 critical); patch before expanding beyond a local demo and keep development/test servers private. Container build and deployed-host performance were not verified in this run.
