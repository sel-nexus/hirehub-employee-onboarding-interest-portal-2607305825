# Changelog

## HireHub 2.0 — browser-local candidate lifecycle revision

### Added
- Eight curated application records spanning Engineering, Design, Product, Marketing and Operations, all lifecycle states, three candidate demo accounts and two recruiter credential variants.
- Candidate registration and role-aware `/login`, persistent local sessions, protected `/portal` and `/recruiter` routes, logout and browser-storage synchronization.
- Candidate-owned application details, exact four-stage progress, explicit offer/archive outcomes, mock interview information, editable contact details and one application per department with portfolio or preset resume materials.
- Recruiter realtime name/email search, URL-persisted department filters, quick status changes, internal notes, editing/deletion and keyboard-accessible mock-material dialogs.
- Persistent light/dark preference with initial OS preference, before-paint initialization, supplied indigo/slate theme tokens, semantic status colors, reduced motion and responsive layouts.
- Discreet one-click Reset Mock Data utility and visible storage recovery/save feedback.
- Colocated feature tests, five new browser spec files, expanded legacy browser fixtures, and a rendered ARIA/style/HTML/screenshot preflight script.

### Modified files and compatibility
- `frontend/src/App.jsx`, `App.test.jsx` and `components/Header.jsx`: new routes/session navigation and startup/reset integration while preserving public home/apply and legacy admin flows.
- `frontend/src/features/apply/submissions.js` plus compatibility tests: strict validation accepts both original six-field submissions and complete extended demo records without discarding metadata. Public duplicate-email checks are unchanged.
- New `features/demo`, `access`, `candidate`, `recruiter` and `theme` modules implement storage, business behavior, components and tests.
- `frontend/src/App.css` and `frontend/index.html`: both-theme tokens, responsive stage containment, dialogs/filters and initial appearance.
- `frontend/package-lock.json`: repaired omitted platform dependencies so the pinned dependency manifest can install reproducibly; no direct dependency major upgrades.
- `frontend/e2e/{home,apply,admin,auth}.spec.js`: deliberate empty-data fixtures are explicit rather than conflated with missing-storage seeding; current login/recovery outcomes are asserted without disabling features.
- `.gitignore`, `README.md` and `frontend/scripts/preflight.js`: current operating documentation and ignored generated review evidence.

### Correctness fixes found during verification
- Corrected Jordan/Taylor seeded journey associations and exact Application Received/Profile Screening/Offer Extended labels.
- Rejected falsy nonstring optional resume values without weakening valid portfolio-only submission support.
- Preserved startup corruption warnings during React StrictMode replay and prevented candidate logout from racing back to Login instead of Home.
- Contained the candidate grid/stepper on small screens; final captured mobile document width matches the 390px viewport.

### Migration and breaking behavior
No backend/database migration is needed. Existing valid public-interest records are adopted in the same `hirehub_submissions` key without overwriting them; extended metadata is added when a recruiter performs lifecycle/notes maintenance. Intentional empty arrays stay empty. Missing data seeds automatically; malformed demo data recovers affected defaults with visible warning. **Reset replaces submissions/accounts and clears sessions**, including test entries, but retains theme and unrelated browser data.

New candidate/recruiter sessions use JSON `hirehub_session` and persist across reload; the legacy `/admin` sessionStorage flow remains available. The main Login link now opens `/login`; legacy admin login remains `/admin/login`. Contact email changes do not change the immutable login username. These are deliberate navigation/data-behavior extensions rather than a replacement app.

### Verification and limitations
Final source passed 797 unit/component tests, all 50 distinct desktop/mobile browser tests in two final batches, production Vite build, and independent critic round four (1.00; zero high failures). First browser run failures were repaired in source with red/green regressions; no skipped tests. Node 24 stalled Playwright's ESM loader; documented Node 20.19.5 successfully executed it. Inherited npm audit findings remain (10: 2 moderate, 6 high, 2 critical); review upgrades separately rather than blindly applying breaking fixes.

This remains public mock authentication/browser-local data, not production identity security, shared recruiting storage or real interview booking. No remote deployment performance or standalone Docker image build was verified. API/database/compose layers are absent by design.
