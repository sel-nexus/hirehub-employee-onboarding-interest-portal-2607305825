# Changelog

## HireHub 2.0 — browser-local recruiting revision

### Added
- Eight curated submissions across five required departments and pipeline stages; eight candidate and two recruiter accounts, seeded only when datasets are missing.
- Unified `/login` candidate/recruiter access, `/register` candidate signup, persistent validated local role sessions and role-specific portal navigation.
- `/candidate` ownership-isolated applications, four-stage progress tracker, friendly next-step descriptions, optional mock interview schedule and accessible contact/profile editing.
- Portfolio entry and preset resume choices, including Full-Stack Developer Resume (Sample), UI/UX Case Study and Frontend Software Engineer (5 YOE).
- Recruiter live name/email search, URL-backed department/stage filters, quick status updates, internal notes and local resume/portfolio review dialog.
- Light/dark CSS-variable themes honoring OS preference with saved override, stage colors, responsive dialogs/stepper and reduced-motion behavior.
- Common Reset Mock Data footer restoring eight submissions/default accounts/departments, clearing the active session and preserving theme/unrelated keys.

### Modified modules
- `frontend/src/App.jsx` and `components/Header.jsx`: initialization, route/role guards, signup/login navigation, themes and reset shell.
- `features/admin/auth.js`, `Login.jsx`: locally stored users and session validation instead of a sessionStorage admin boolean.
- `features/apply/validation.js`, `submissions.js`, `Apply.jsx`: Product department support, strict legacy/extended schema, owned new records and application material validation.
- `features/admin/Dashboard.jsx`, `EditSubmission.jsx`: filters, statuses, notes/materials and guarded maintenance preserving fresh untouched fields.
- New `features/data/mockData.js`, `features/candidate/*`, `features/admin/recruiterService.js`, `ReviewSubmission.jsx`, `features/auth/Register.jsx`, `features/theme/theme.js`, `components/DemoUtility.jsx` implement the new responsibilities alongside existing modules.
- `frontend/src/App.css`: PRD indigo/slate surfaces and shared styles for all new states; inherited public content retained.
- Colocated tests and all existing E2E specs updated with stronger 2.0 contracts; candidate and theme/reset specs added. README and code graph updated.

### Fixes proven with regressions
- A second unchanged Save Notes action no longer overwrites newer external recruiter notes; deliberate edits remain saveable.
- Reset/logout from a newly registered candidate reliably return Home under production BrowserRouter transition flags rather than racing a guard redirect to `/login`.
- Browser specs await seeded-page readiness before capturing baselines, preserve all eight seeded records during invalid/public submission checks, assert the complete new-record schema, and cover alternate signup/application entry links.

### Breaking behavior and migration
- Session key is now `hirehub_session` in localStorage with userId, role, displayName and ISO loginTimestamp. Existing `hirehub_admin_auth` sessionStorage flags are ignored. Sign in again using supplied demo credentials.
- Closing a tab no longer logs out. Explicit Logout or Reset clears the local session.
- New submissions include userId/status/notes/portfolioUrl/sampleResume in addition to the six legacy fields; optional interviewSchedule uses dateTime/format/location. Valid old records remain intact and unowned, visible to recruiters. Editing legacy records adds defaults. No automatic ownership claiming by email is performed.
- Empty storage now receives curated data rather than an empty submission list. Deliberately stored empty arrays remain empty until changed or Reset is chosen.
- Reset is intentionally destructive to HireHub test accounts/records and active session, not unrelated storage or theme. Export any browser data you need before using it.
- No server/database migration, backend or external service was introduced. Static-host SPA fallback is still required for deep links.

### Verification and limitations
- Baseline: 304 tests and build passed before changes.
- Final: 771 unit/component tests, 46 desktop/mobile browser tests, production Vite build passed; final independent critic score 1.00 with zero high failures (round 3).
- Browser reports include human-review screenshots and ARIA/HTML/computed-style evidence. Docker execution and hosted deployment were not tested by this revision.
- This remains a demonstration: local plaintext credentials and browser state are editable; do not collect real sensitive information or interpret local pipeline changes as production hiring decisions.
- Inherited npm dependencies still report 10 advisories (production-only: 3 high in React Router chain). Dependency upgrades were not bundled into this scoped revision.
