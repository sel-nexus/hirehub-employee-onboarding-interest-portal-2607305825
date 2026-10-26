# HireHub 2.0

A browser-only candidate and recruiter **demonstration portal**, revised in the existing React 18 + Vite JavaScript application. There is no backend, database, API, real identity provider or shared multi-user persistence.

## Run and build

Requires Node.js 20+ and npm. From the repository root:

```sh
cd frontend
npm ci --no-bin-links
npm run dev
```

`frontend/.env.example` documents HOST, PORT and BASE_URL for development/preview and Playwright. Copy it to an uncommitted `.env` to customize these values. No credentials or secrets are required. Use localhost or HTTPS for browser UUID generation.

```sh
npm run build
npm run preview -- --host 0.0.0.0 --port 4173
```

The production bundle is `frontend/dist`; production needs only a static web server. Existing nginx configuration supplies SPA fallback with no backend proxy. Existing Vercel configuration uses the frontend project root: configure Vercel **Root Directory = frontend**, Vite build `npm run build`, output `dist`. Deep-link refreshes on `/login`, `/register`, `/candidate`, `/apply` and `/admin` require the included SPA rewrite.

The supplied two-stage `frontend/Dockerfile` builds the SPA and serves nginx on port 80:

```sh
docker build -t hirehub-demo frontend
docker run --rm -p 8080:80 hirehub-demo
```

The container build was not executed in this Development run; the production Vite build and live production preview were verified. DevOps validates the container separately.

## Demo accounts

Open Login for candidate/recruiter tabs, or Admin for the recruiter gate.

| Role | Username | Password | Seeded candidate stage |
|---|---|---|---|
| Candidate | alex@example.com | password123 | Interview Scheduled |
| Candidate | jordan@example.com | password123 | Under Review |
| Candidate | taylor@example.com | password123 | Offer Extended |
| Administrator | admin | admin | — |
| Recruiter | recruiter@hirehub.demo | admin123 | — |

An empty initial browser store seeds eight curated submissions, five accounts and the five default departments. Valid legacy six-field submissions remain intact; they are not automatically assigned to a candidate just because an email matches.

## Candidate journey

1. Sign in using a candidate account; `/candidate` shows only records linked to that user identity, their current status, four-stage progress and next steps.
2. View interview information when present. Recruiter notes are not included in the candidate projection.
3. Edit name, email and mobile. A successful save updates the local account, linked applications and session display name. The new email becomes the login username. Failed multi-key saves attempt rollback and explicitly warn if changes may be partial.
4. Registration at `/register` creates a candidate account and immediately signs in. It does not invent an application; new accounts have a meaningful empty state and can use the retained application form.
5. Signup accepts ten-digit phone formatting (spaces, parentheses, hyphens) and saves only digits. Application/profile inputs require exactly ten digits. Longer numbers or country codes are rejected, not truncated. Names use alphabetic characters/spaces, max 100; emails max 254; signup passwords minimum eight characters. These validation details are inferred to keep the legacy form and new profile consistent.
6. A signed-in candidate's application email/userId come from the current valid account/session. Optional portfolio and bundled sample-resume choices are saved with the application. Multiple linked applications may share the same email; conflicting users and unlinked duplicates are rejected.

## Recruiter journey

1. Sign in with either administrator credential and review submissions/pipeline distribution.
2. Type a name or email and select Engineering, Design, Product, Marketing or Operations. Filters combine live and are retained in URL query parameters for refresh/Back.
3. Change status through the row dropdown. Open Edit to save private notes, contact/application fields, optional interview schedule, portfolio and sample resume. Email, identity, ownership and submission time are immutable in the recruiter editor.
4. Preview bundled mock resume text in a keyboard-accessible modal drawer. Portfolio URLs must be absolute HTTP(S); only an explicit link activation opens a new tab. The portal does not automatically fetch portfolios or resume files.
5. Confirm deletion of test entries. After removing every record, the dashboard shows an empty state; reloading reseeds the eight-record demo baseline by design.
6. Log out and sign in as the linked candidate in the same browser to see the updated stage/schedule. Native storage events also refresh candidate state across tabs on the same origin.

Stored stages map to the stepper as applied → Application Received, review → Profile Screening, interview → Interview Scheduled, offer/archived → Final Decision. Archived is explicitly not selected, not an offer.

## Theme, recovery and reset

The navigation toggle switches light/dark themes. `hirehub_theme` wins over the OS preference; absent/invalid preferences use `prefers-color-scheme`. Shared CSS custom properties implement the specified indigo/slate palette, readable status colors, focus rings, responsive layouts and reduced-motion behavior.

The discreet footer **Reset Mock Data** confirms before restoring submissions/accounts/departments and removing current/legacy sessions. It preserves theme and unrelated browser keys. Browser writes are not atomic: failures are announced, with retry guidance and partial-change warnings where appropriate. Corrupted records recover through the shared dataset/seeder contract; unavailable storage never implies a successful save or authentication.

Storage keys: `hirehub_submissions`, `hirehub_users`, `hirehub_session`, `hirehub_departments`, `hirehub_theme`. Sessions now persist through tab closure until logout/reset, replacing the old sessionStorage boolean. Do not use the old key to authenticate.

## Verification

From `frontend`:

```sh
npm test
node node_modules/@playwright/test/cli.js install --with-deps chromium
npm run test:e2e
```

Scripts invoke package Node entrypoints directly, supporting environments without npm symlinks. Playwright can start Vite or reuse a production preview at BASE_URL. All tests run with one worker on desktop and iPhone-layout Chromium; there is no API mocking.

This run verified:
- Baseline: 304 unit/component tests and production build passed before edits.
- Final unit/component suite: **1,022 tests in 18 files**, all passed.
- Independent critic: initial gaps fixed; final verdict **PASS, 1.0000, zero high failures**. Two later narrow checks followed the browser portfolio adjustment and observer timing fix.
- Browser: **88 unique desktop/mobile cases** across seven specs have passing results. Initial full run passed 86/88; two cases waited on an unavailable external example site's initial response. The native-activation test was corrected to use a real same-origin URL entered through the UI, preserving seeded URL safety assertions. Two targeted eight-case recruiter reruns passed, including the final observer timing fix. These reruns overlap the full suite; they are not additional unique cases or a fresh clean full-suite run.
- Light/dark desktop/mobile preflight: four representative journeys passed, capturing screenshots, ARIA trees, HTML and computed styles.
- Final production build: 61 modules, exit 0.

For this Ubuntu sandbox, installation and browser execution used `PLAYWRIGHT_HOST_PLATFORM_OVERRIDE=ubuntu24.04-x64`. Initial browser launch failed because Chromium was absent; one provisioning retry resolved it. No test layer remains blocked.

Evidence is retained in `frontend/playwright-report/index.html` (initial run) and `frontend/playwright-report/recruiter-final/index.html` (final targeted rerun), with screenshots and text attachments. These generated files are not committed. API, server-database persistence, backend integration and compose tests do not apply to this explicitly static product; cross-feature flows are exercised through real browser storage.

## Important limitations and dependency risk

Mock passwords and role/session data are visible and editable in browser tools. This is not production-grade authentication, authorization, recruitment processing or secure PII storage. Do not enter real sensitive candidate data. Separate devices/browser origins do not share records; clearing browser data loses local edits. There are no email notifications, account recovery, uploads, backups or HR integrations.

The inherited pinned dependency set remains unchanged. `npm audit` reports **10 advisories (2 moderate, 6 high, 2 critical)** affecting React Router and development/test tooling, including Vite/Vitest/Playwright dependencies. This run did not perform a broad dependency migration; patch before use beyond the local demonstration, and do not expose development/test servers publicly. Passing tests do not erase this security risk.

## Structure

- `frontend/src/features/demo` — curated fixtures, validation, safe seed/reset and footer.
- `frontend/src/features/admin` — mock identity, role login, recruiter review/edit/materials.
- `frontend/src/features/access` — registration.
- `frontend/src/features/candidate` — private application projection, profile persistence and stage stepper.
- `frontend/src/features/apply` — existing form/validation plus submission/material/status storage.
- `frontend/src/features/theme` — safe preference initialization and synchronization.
- `frontend/src/components` — shared navigation and labeled fields.
- `frontend/src/App.css` — shared light/dark tokens and responsive states.
- `frontend/e2e` — real UI journeys.

See CHANGELOG.md for migration details. The discovery PRD is the sole upstream source; inferred decisions and file inventory are in the separately published development plan.
