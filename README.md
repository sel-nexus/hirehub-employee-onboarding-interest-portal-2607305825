# HireHub

A responsive candidate-interest **demo** built with React 18, Vite, JavaScript/JSX and React Router 6. Public landing, validated application form, demo administrator login and submission review/edit/delete run entirely in the browser.

## Run locally

Requires Node.js 20+ and npm.

```sh
cd frontend
npm ci --no-bin-links
npm run dev
```

Configuration defaults are in `frontend/.env.example`; copy to `.env` to customize HOST, PORT and BASE_URL. The app makes no API calls and needs no secrets. Browser storage requires a trustworthy origin (localhost or HTTPS) for `crypto.randomUUID()`.

## Demo journey

1. Open Home and choose Express Your Interest or Apply Now.
2. Enter an alphabetic full name (max 100 characters), valid email, exactly ten mobile digits and a department.
3. Submit; the confirmation clears after four seconds. Duplicate email checks ignore letter case and surrounding whitespace.
4. Choose Admin. Demo credentials are **admin / admin**.
5. Review the counts and table, edit permitted fields or confirm deletion. Email, record identity and submission time cannot be edited.
6. Logout returns home. Closing the tab clears the demo session; candidate records remain in the same browser origin.

## Important limitations

This is not real authentication or a production recruitment service. Credentials and browser session state are visible and editable by anyone using browser developer tools. Do not collect real sensitive candidate information. No backend, database, central storage, email notifications, accounts or external integrations exist. Records are local to the current browser/origin, can be lost when browser data is cleared, and are not backed up. Corrupt/invalid datasets reset to an empty array; unavailable storage produces visible errors. Browser storage is not safe for concurrent multi-user administration.

## Build and host

```sh
cd frontend
npm run build
npm run preview -- --host 0.0.0.0 --port 4173
```

Build output is `frontend/dist`. On Vercel, set the **Root Directory to frontend**, framework Vite, normal build `npm run build`, and output `dist` in the project settings. `frontend/vercel.json` contains only the specified SPA rewrite. The root rewrite is included as the repository-level copy; do not configure the repository root as the Vercel build root without setting the corresponding build/output directories externally. Reloading `/apply` and `/admin` requires the SPA rewrite.

A portable nginx image is also supplied:

```sh
docker build -t hirehub-demo frontend
docker run --rm -p 8080:80 hirehub-demo
```

Its nginx configuration serves static files with SPA fallback and no backend proxy. Container build was not executed in this run; production Vite build and local serving were verified. DevOps independently validates the container deployment. The PRD's under-one-second Vercel load target remains unverified until deployed and measured on a stated standard connection.

## Tests

From `frontend`:

```sh
npm test
node node_modules/@playwright/test/cli.js install chromium
npm run test:e2e
```

Scripts invoke Node entrypoints directly for environments where npm bin symlinks are disabled. Playwright starts a real Vite server when no server is available, and can reuse a production preview at BASE_URL. Desktop Chromium and mobile iPhone-layout Chromium projects run with one worker; there is no API mocking. Browser specs cover navigation, validation, duplicate rejection, real localStorage CRUD, reload persistence, corruption recovery, actual tab closure and demo-session lifecycle. Console errors fail tests.

For the Ubuntu 26.04 sandbox, Chromium installation/testing required `PLAYWRIGHT_HOST_PLATFORM_OVERRIDE=ubuntu24.04-x64`; OS browser libraries also had to be installed. This is a sandbox compatibility setting, not required for supported development hosts.

Verified: **304 unit/component tests**, **20 full-suite browser tests**, and **16 capture-producing reruns** after enabling HTML evidence retention. The latter overlap the full suite, not 16 extra distinct tests. Independent test critic passed in round two with score 1.00 and zero high failures. A timer regression was reproduced red before fixing the source and passed afterward.

HTML browser report and screenshot/ARIA/HTML/computed-style attachments are in `frontend/playwright-report` after E2E. These generated outputs are not committed. No backend API, backend integration, database persistence or compose test is applicable to this explicitly static product.

## Structure

- `frontend/src/features/home` — public culture messaging.
- `frontend/src/features/apply` — validation, local storage service and form.
- `frontend/src/features/admin` — demo session, login, dashboard and edit dialog.
- `frontend/src/components` — persistent navigation and reusable labeled fields.
- `frontend/src/App.css` — single supplied light-theme design system.
- `frontend/e2e` — real user journeys.

The canonical discovery PRD was the only upstream design input. HLD/LLD were absent; layout/module decisions are explicitly inferred in the separately published development plan.
