# BizTrack CM — CI/CD setup

One shared CI workflow for the whole monorepo, plus CD pipelines for the two
active apps: `api` and `desktop-v2`. Copy the `.github/` and `apps/api/` files
into your repo root, then add the secrets below.

Mobile is deferred (app not ready). The old `apps/desktop` (Electron + Next.js)
is deprecated and replaced by `apps/desktop-v2` (Vite + React + Electron).

## What each workflow does

| Workflow           | File                     | Trigger                                      | Target                                                |
| ------------------ | ------------------------ | -------------------------------------------- | ----------------------------------------------------- |
| CI (all apps)      | `ci.yml`                 | PR + push to `main`/`develop`                | Turbo typecheck/lint/test/build                       |
| API                | `api-deploy.yml`         | push to `main` (api/packages paths) + manual | GHCR image → Railway                                  |
| desktop-v2 cloud   | `desktop-v2-web.yml`     | push to `main` (desktop-v2 paths) + manual   | Vercel (Vite web build)                               |
| desktop-v2 desktop | `desktop-v2-release.yml` | tag `desktop-v*` + manual                    | electron-builder (Win/macOS/Linux) → 1 GitHub Release |
| admin-web          | `admin-web-deploy.yml`   | push to `main` (admin-web paths) + manual    | Vercel (production)                                   |

> `desktop-v2` is one Vite + React codebase with two delivery targets: the web
> build goes to Vercel; the Electron build produces installers for all three
> desktop OSes in a single Release (with electron-updater metadata).
> Confirm whether `admin-web` still exists — if it was folded into desktop-v2's
> cloud build, delete `admin-web-deploy.yml`.

## Required secrets & variables

Repo → Settings → Secrets and variables → Actions.

**API (Railway)**

- Secret `RAILWAY_TOKEN` — project token (Railway → project → Settings → Tokens).
- Variable `RAILWAY_SERVICE_ID` — the API service's ID.
- One-time: set the Railway service **Source** to the GHCR image
  `ghcr.io/<owner>/biztrack-api:latest`. Then each run pushes a new `:latest`
  digest and `railway redeploy` pulls it. (GHCR auth uses the built-in
  `GITHUB_TOKEN` — no extra secret needed for a public/owned image.)

**desktop-v2 cloud (Vercel)**

- Secrets `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_DESKTOP_V2_PROJECT_ID`
  (a project separate from admin-web's).
- Get the id via `vercel link` in `apps/desktop-v2`, or the Vercel dashboard.
- In that Vercel project: **Root Directory = `apps/desktop-v2`**, Framework = Vite.

**desktop-v2 desktop release (GitHub Releases)**

- No secret needed for unsigned builds (`GITHUB_TOKEN` is built in). Unsigned
  installers work but show OS warnings — **macOS is strictest** (without
  notarization, users must right-click → Open the first time).
- Optional signing (add when you have certs): `CSC_LINK` + `CSC_KEY_PASSWORD`
  (Windows/macOS), and for macOS notarization `APPLE_ID`,
  `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`.

**admin-web (Vercel)** — only if the app still exists

- Secrets `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`.
- In the Vercel project, set **Root Directory = `apps/admin-web`**.

**Optional (all) — Turborepo remote cache**

- Secrets `TURBO_TOKEN`, `TURBO_TEAM` to share the build cache across runs.

## Three values to confirm in the API Dockerfile

`apps/api/Dockerfile` assumes the conventional NestJS setup. Confirm:

1. Package name `@biztrack/api` (the `turbo prune` + `--filter` lines).
2. Entry `apps/api/dist/main.js` (the final `CMD`).
3. Port `3000` (`EXPOSE` / `PORT`).

## Releasing

- **desktop-v2 installers:** `git tag desktop-v2.0.0 && git push origin desktop-v2.0.0`
  → builds Windows/macOS/Linux and aggregates them into one GitHub Release. Bump
  the `apps/desktop-v2` package.json version to match the tag first. The release
  is created ready to share; add electron-updater in-app for auto-updates.
- **desktop-v2 cloud & API:** automatic on push to `main` touching their paths.

## Desktop values to confirm

1. `apps/desktop-v2` has a `build` script that compiles the renderer + Electron
   main/preload and does **not** run electron-builder itself.
2. electron-builder `directories.output` matches `RELEASE_DIR` in
   `desktop-v2-release.yml` (default `apps/desktop-v2/release`).
3. electron-builder targets are set per-OS (e.g. nsis / dmg / AppImage+deb).

## Moving the API to AWS later

The deploy unit is already a Docker image in GHCR, so the migration is contained:
keep `build-and-push` as-is and replace only the `deploy-railway` job — e.g. push
the same image to ECR and update an ECS service, or point AWS App Runner at the
GHCR/ECR image. No application changes, no Dockerfile changes. Choosing an AWS
region close to your Cameroon/Africa client base (e.g. `af-south-1` Cape Town,
or an EU region) is the latency win you flagged.
