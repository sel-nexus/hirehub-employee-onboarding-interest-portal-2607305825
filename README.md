# HireHub 2.0

A responsive, browser-only recruiting demonstration built with React 18, Vite, JavaScript/JSX and React Router 6. This revision extends the existing HireHub app; it does not add a backend, cloud database, API, authentication service, tracking, remote fonts or image dependency.

## Run locally

Requires Node.js 20+ and npm.

```sh
cd frontend
npm ci --no-bin-links
npm run dev
```

`frontend/.env.example` documents HOST, PORT and BASE_URL for local Vite/Playwright configuration. Copy it to `.env` to customize those public settings. No secrets are required. Use localhost or HTTPS for `crypto.randomUUID()`.

## Explore the demo

On missing storage, HireHub seeds **eight submissions**, eight candidate accounts, two recruiter accounts, and Engineering, Design, Product, Marketing and Operations departments.

| Access | Username | Password | Initial pipeline |
|---|---|---|---|
| Candidate | alex@example.com | password123 | Interview Scheduled |
| Candidate | jordan@example.com | password123 | Under Review |
| Candidate | taylor@example.com | password123 | Offer Extended |
| Recruiter | admin | admin | All submissions |
| Recruiter | recruiter@hirehub.demo | admin123 | All submissions |

- **Home `/`** retains public culture information and application entry links.
- **Login `/login`** offers Candidate and Administrator/Recruiter tabs. The legacy Admin link `/admin` opens recruiter login when signed out.
- **Register `/register`** creates a local candidate account and signs in immediately.
- **Candidate `/candidate`** shows only submissions owned by the signed-in user, a four-milestone hiring tracker, mock interview schedule where present, selected resume and portfolio, and contact editing. Changing your email also changes your local login username. Recruiter notes are not exposed here.
- **Apply `/apply`** validates contact details, department and optional HTTP(S) portfolio/sample resume. Public submissions remain available; candidate ownership is derived from the validated local session. Duplicate application emails remain rejected.
- **Recruiter `/admin`** offers live name/email search, five department chips, stage filters, quick status controls, application editing, internal notes, deletion confirmation and local resume/portfolio preview. Filters live in the URL and survive reload/back navigation. Review/edit dialogs trap focus, close with Escape/backdrop and restore focus.
- **Theme** honors OS preference initially and immediately saves explicit light/dark choices. CSS variables adapt cards, text, borders and status colors.
- **Reset Mock Data** in the common footer restores the curated datasets, removes stale test accounts/submissions and the active session, and returns Home. It preserves theme and unrelated browser storage. Logout also returns Home while retaining application data.

Recruiter changes appear when the candidate revisits, focuses the window or receives a same-origin storage event. There is no cross-device sync. Portfolio links open only on deliberate clicks, in a protected new tab; previews render local sample text, not uploaded PDFs.

## Persistence and compatibility

Data uses `hirehub_users`, `hirehub_submissions`, `hirehub_departments`, `hirehub_session` and `hirehub_theme` in localStorage. Sessions persist across tab closure/browser restarts until Logout or Reset; old `hirehub_admin_auth` sessionStorage values are not trusted.

Valid existing six-field submissions and intentionally empty arrays are preserved. Legacy records have no candidate ownership and remain recruiter-visible; new submissions have the full 2.0 schema. Recruiter editing enriches legacy records with new-field defaults. There is no destructive automatic email-based claiming. Corrupted initialization datasets recover to defaults with feedback; the shared submission reader retains its legacy empty-array recovery. Blocked/quota writes expose retryable errors and never claim successful persistence; multi-key writes use best-effort rollback, not database transactions.

**Never use real sensitive information.** Accounts/passwords/session state are visible and editable in browser tools. Local role checks are demo behavior, not secure authentication or employer decisions. Clearing browser data loses records; no backups, employer delivery, email notifications, live scheduling or post-hire onboarding are provided. Simultaneous edits have no distributed conflict resolution, although untouched fields are merged with fresh storage records.

## Build and static hosting

```sh
cd frontend
npm run build
npm run preview -- --host 0.0.0.0 --port 4173
```

Build output: `frontend/dist`. Production needs only a static web server, not Node.js. On Vercel set **Root Directory to frontend**, build `npm run build`, output `dist`; the supplied SPA rewrite supports refreshing `/login`, `/register`, `/candidate`, `/apply` and `/admin`. The root rewrite is a repository copy; a repository-root build requires corresponding build/output project settings.

The inherited portable nginx image remains available:

```sh
docker build -t hirehub-demo frontend
docker run --rm -p 8080:80 hirehub-demo
```

It serves static assets with SPA history fallback and no backend proxy. This revision verified Vite production compilation and live browser journeys, **not Docker image execution or a hosted deployment**. DevOps independently validates deployment.

## Tests and verified results

From `frontend`:

```sh
npm test
node node_modules/@playwright/test/cli.js install chromium
npm run test:e2e
```

Scripts invoke package Node entrypoints directly where npm bin symlinks are disabled. Playwright starts a real Vite server if needed, or reuses an existing host at BASE_URL; one worker runs desktop Chrome and iPhone-layout Chromium projects. No browser API mocks are used. On the Ubuntu 26.04 sandbox, Chromium used `PLAYWRIGHT_HOST_PLATFORM_OVERRIDE=ubuntu24.04-x64` and installed OS libraries.

Final results: **771 unit/component tests across 19 files**, **46 browser tests** (23 journeys across desktop/mobile), and a green production build. Independent read-only test critic: final round 3, score 1.00, zero high failures. Review-note stale saves and BrowserRouter reset/logout navigation were reproduced failing before source fixes and passing afterward. Browser journeys cover all supplied credentials, signup, isolation, profile editing, application materials, pipeline/search/filters, review/notes/edit/delete, candidate stage handoff, themes, persistence and exact reset restoration.

`frontend/playwright-report/index.html` contains the generated browser report with screenshots and embedded ARIA/HTML/computed-style attachments; keep its `data/` sibling when sharing it. Generated reports are not committed. Production build verification is separate from the final live Vite-server browser run. No backend API/integration/database/compose layer applies.

### Known inherited dependency risk

The unchanged pinned dependency set reports **10 npm advisories** (2 moderate, 6 high, 2 critical). `npm audit --omit=dev` reports **3 high** React Router-chain advisories. This scoped revision did not blindly upgrade dependencies. Review and retest supported patched versions before any non-demo use. React Router future-flag notices in MemoryRouter tests are nonfatal.

## Feature layout

- `frontend/src/features/data` — curated datasets, strict schema validation, seed/reset and rollback.
- `frontend/src/features/admin` — local role auth, unified login, recruiter pipeline/edit/review services and dialogs.
- `frontend/src/features/auth` — candidate registration.
- `frontend/src/features/candidate` — ownership-safe application projection and contact self-service.
- `frontend/src/features/apply` — validated application entry and shared local persistence.
- `frontend/src/features/theme` — saved/system preference control.
- `frontend/src/features/home` — inherited public culture content.
- `frontend/src/components` — header, labelled fields and demo reset footer.
- `frontend/e2e` — real click journeys and review evidence.

The discovery PRD was the only upstream design input; inferred decisions and revision inventory are in the separately published development plan. See `CHANGELOG.md` for migration notes and modified modules.
