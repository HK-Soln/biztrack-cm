# CLAUDE.md — BizTrack CM

Context for Claude Code working in this repo. Keep this file lean and current.

## What this is

BizTrack CM is an **offline-first, OHADA-compliant POS & business-management
platform** for small shops in Cameroon (HK-Solutions). Target hardware is
low-end Android on unreliable power and network.

**Core invariant — offline is the default, not a fallback.** The app must run
fully with no connectivity and sync opportunistically.

- Sales and expenses are **append-only events** (conflict-free by design). Only
  concurrent edits to products/settings need timestamp resolution.
- Payments split across cash / MTN MoMo / Orange Money. Reporting is OHADA-shaped.

## Monorepo layout (Turborepo + pnpm workspaces)

- `apps/api` — NestJS + PostgreSQL. The sync authority / source of truth.
- `apps/desktop-v2` — Vite + React POS, packaged with **Electron**
  (electron-builder). **Dual-target:** the same renderer ships both as a cloud
  web app (Vercel) and as a desktop installer (Win/macOS/Linux). Uses
  `better-sqlite3` (native — rebuilt against Electron's ABI on install).
- `apps/desktop` — **DEPRECATED** (old Electron + Next.js). Replaced by
  desktop-v2. No CI/CD.
- `apps/admin-web` — Next.js SSR admin dashboard (Vercel).
- `apps/mobile` — Expo / React Native POS. **Not ready — no CI/CD yet.**
- `packages/*` — shared: `@biztrack/types`, `utils`, `ui`, `theme`,
  `eslint-config`, `typescript-config`.

## Conventions

- Package manager is **pnpm** (workspaces); orchestration via **Turborepo**.
- TypeScript throughout. Run tasks with `pnpm turbo run <task>`.
- **Data-safety rules (non-negotiable, offline-first):**
  - Never ship a change that could wipe a device's local SQLite data.
  - Never rotate the desktop signing identity without a migration plan — a
    changed identity blocks auto-updates and can force a reinstall that destroys
    offline data.

## Deployment (see CICD_SETUP.md for full detail)

Only two apps have active CI/CD right now: `api` and `desktop-v2`.

- **API** → Docker image to GHCR → Railway now, AWS later (swap deploy job only).
- **desktop-v2 (cloud)** → Vercel (Vite web build).
- **desktop-v2 (desktop)** → electron-builder for Win/macOS/Linux → one GitHub
  Release per tag, with electron-updater metadata for auto-updates.
- **admin-web** → Vercel (pipeline exists; confirm the app is still in use).
- **mobile** → deferred until the app is ready.

## Current task: finish CI/CD setup

Active workflows in `.github/workflows/`: `ci`, `api-deploy`, `desktop-v2-web`,
`desktop-v2-release` (and `admin-web-deploy`, pending confirmation the app still
exists). They are drafted; help complete and verify them. Open TODOs:

1. **API Dockerfile** (`apps/api/Dockerfile`) — confirm the 3 flagged values:
   package name (`@biztrack/api`?), entry (`dist/main.js`?), port (`3000`?).
2. **Turbo tasks** — confirm task names in `turbo.json` match the CI steps
   (`typecheck`, `lint`, `test`, `build`).
3. **desktop-v2 build script** — confirm `pnpm run build` in `apps/desktop-v2`
   compiles the renderer + Electron main and does NOT itself run electron-builder
   (the release workflow runs electron-builder separately).
4. **desktop-v2 output dir** — confirm electron-builder `directories.output`
   matches `RELEASE_DIR` in `desktop-v2-release.yml` (default `release`).
5. **Secrets/variables** — see the checklist in `CICD_SETUP.md` (note desktop-v2
   needs its own `VERCEL_DESKTOP_V2_PROJECT_ID`).

When done with a step, tell me before moving to the next; don't assume repo
values — read the actual files (`turbo.json`, `apps/*/package.json`,
electron-builder config) first.
