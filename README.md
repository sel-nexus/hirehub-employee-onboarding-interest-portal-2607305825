# HireHub 2.0

A React 18/Vite JavaScript **browser-local hiring demo**: public home/culture and interest form, candidate registration and application tracking, recruiter pipeline management, mock materials, persistent themes and repeatable seeded data. There is no backend, API, cloud database or production Node.js server.

## Run and build

Use **Node 20.19.x** for the supplied Playwright 1.50.1 test runner (Node 24 stalled in its ESM loader in the sandbox).

```sh
cd frontend
npm ci --no-bin-links
npm run dev
# production static output:
npm run build
npm run preview -- --host 0.0.0.0 --port 4173
```

`frontend/.env.example` documents HOST, PORT and BASE_URL for local tooling. Copy it to `.env` to customize. No secrets or API URL are needed. Static assets are generated in `frontend/dist`; configuration is build/tool-time, not a production runtime environment contract.

## Demo accounts

Select **Candidate** or **Recruiter / Admin** on `/login`.

| Username | Password | Demo journey |
|---|---|---|
| alex@example.com | password123 | Interview Scheduled |
| jordan@example.com | password123 | Under Review |
| taylor@example.com | password123 | Offer Extended |
| admin | admin | Recruiter |
| recruiter@hirehub.demo | admin123 | Recruiter |

All credentials are intentionally public demo data. Candidate accounts can also be created at `/register`; registration signs the new candidate in.

## Candidate journey

1. Sign in and open `/portal` to see only applications belonging to that local account.
2. Follow Application Received → Profile Screening → Interview Scheduled → Final Decision. Offers explicitly display **Offer Extended**; archived applications have distinct closed-outcome messaging.
3. Inspect mock interview date/time/timezone/location when present. No real interview is booked and no video call is provided.
4. Update name, email and ten-digit mobile number. The login username does not change when contact email changes.
5. Submit one application per department, across Engineering, Design, Product, Marketing and Operations. Supply a safe HTTP(S) portfolio URL **or** a sample mock resume. Presets include Full-Stack Developer Resume (Sample) and UI/UX Case Study; portfolio-only submissions explain that no mock resume was selected.

## Recruiter journey

1. Sign in with either administrator account to reach `/recruiter`.
2. Search names/emails while typing and combine with department chips. Search/filter state is in the URL, so refresh and browser navigation retain it.
3. Change status, edit permitted contact/department fields, maintain internal notes, preview mock resume text and portfolio anchors, or confirm deletion in accessible dialogs.
4. Change Alex's Engineering application from Interview Scheduled to Offer Extended, log out, and sign in as Alex: the candidate portal reflects the persisted update.

Moving an unscheduled record to Interview Scheduled uses an explicitly labeled deterministic **mock** schedule; it is not a scheduler or real invitation. Portfolio links open only after user action and are not fetched automatically. Candidate views do not show internal notes.

## Data, reset and compatibility

Data stays in the current browser profile/origin under `hirehub_submissions`, `hirehub_users`, `hirehub_session`, `hirehub_theme` and department configuration. Initial missing data is seeded with eight applications across five departments and all stages. Intentional empty arrays are preserved. **Reset Mock Data** in the footer restores the curated eight applications/default accounts and clears stale test records and both demo sessions while keeping theme and unrelated storage.

Existing valid six-field public-interest submissions are adopted without overwriting them. The public `/apply` form and legacy `/admin` / `/admin/login` sessionStorage-admin paths remain compatible. Public interest submissions retain their global duplicate-email rule; signed-in candidate applications use per-user/per-department uniqueness. Legacy records can be displayed and maintained by recruiters; notes/status changes add validated lifecycle metadata with explicit missing-material explanations. No manual migration or database operation is needed. Reset deliberately replaces existing submissions, so do not reset data you wish to retain.

Corrupt demo data is recovered with visible warning. Denied reads, storage quotas and failed saves are reported rather than claiming persistence. Multi-key contact/reset operations have best-effort rollback, not atomic transactions. Browser developer tools can alter accounts and roles: this is **not secure authentication**, shared multi-user storage, cross-device synchronization, encryption or backup. Do not enter real passwords or sensitive personal data.

## Testing and evidence

```sh
cd frontend
npm test
node node_modules/@playwright/test/cli.js install chromium
npm run test:e2e
# optional representative ARIA/style/HTML/screenshot capture against live preview:
node scripts/preflight.js
```

Scripts invoke Node package entrypoints without bin symlinks. Playwright can start a real Vite server or reuse production preview using BASE_URL. Desktop and iPhone-layout Chromium run with one worker; tests exercise real localStorage and fail on console/page errors, with no API mocks. On this Ubuntu sandbox browser install/execution used `PLAYWRIGHT_HOST_PLATFORM_OVERRIDE=ubuntu24.04-x64`.

Verified in this revision: **797 unit/component tests**, **50 distinct desktop/mobile browser tests** on final source (16 affected-spec tests plus 34 remaining tests), and production Vite build. The first browser run had eight failures; source fixes and regression tests corrected StrictMode recovery-warning loss and logout routing races. Independent critic round four passed with score 1.00 and zero high failures. Preflight saved ten desktop/mobile captures of Home, candidate light/dark, recruiter and materials dialog; viewport overflow was corrected and all captured error arrays were empty.

Generated `frontend/preflight-evidence`, `frontend/playwright-report` and `frontend/test-results` are ignored. The last HTML browser report covers the last 34-test batch; the separately published test report records both final batches. Backend API/integration, database and compose tests are not applicable. The inherited standalone Docker image was not built in this revision; remote deployment performance remains unmeasured.

## Static hosting

Serve `frontend/dist` with an SPA history fallback to `index.html` for deep routes. Vercel: select project Root Directory **frontend**, Vite framework, build `npm run build`, output `dist`; the inherited `frontend/vercel.json` supplies the SPA rewrite. Repository-root Vercel configuration requires corresponding project build/output settings; do not assume it detects nested frontend automatically.

The inherited `frontend/Dockerfile` builds assets then serves them using nginx and `frontend/nginx.conf` without a backend proxy:

```sh
docker build -t hirehub-demo frontend
docker run --rm -p 8080:80 hirehub-demo
```

Production needs only static hosting/nginx, not Node. This container command is supplied for operators, **not claimed as executed** here.

## Structure

`frontend/src/features/{home,apply,admin}` retain the original experience; `{demo,access,candidate,recruiter,theme}` implement this revision. Shared navigation is in `components/Header.jsx`; CSS custom-property themes and responsive styles are in `src/App.css`. Unit tests are colocated with features; browser specs are under `frontend/e2e`.

The canonical discovery PRD is the sole upstream input. The published development plan records the approved resolution of product gaps, feature inventory, baseline install repair, risks and verification. See `CHANGELOG.md` for this run's changes.
