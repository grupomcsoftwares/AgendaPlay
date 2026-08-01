---
name: EAS monorepo .easignore
description: EAS uploads from the monorepo root; the root .easignore governs, and workspace packages the app depends on must not be excluded.
---

EAS builds in this pnpm monorepo compress the archive from the repo root, so the `.easignore` at the repo root is the one applied — the app-level `.easignore` inside the artifact dir is ignored for archive contents.

**Why:** A build failed in PREBUILD with `ERR_PNPM_WORKSPACE_PKG_NOT_FOUND` for a `workspace:*` dependency because the root `.easignore` excluded `lib/`, leaving only 2 workspace projects in the archive.

**How to apply:** Before an EAS build, ensure the root `.easignore` includes every workspace package the mobile app depends on (e.g. `lib/`), while still excluding heavy dirs (`attached_assets/`, other artifacts like the 1GB web app) to keep upload size down. If the worker log says "Scope: all N workspace projects" with N too small, the archive is missing packages. Also, when the Expo build UI keeps demanding Google Service Account keys for an internal APK, bypass it by running `EAS_NO_VCS=1 pnpm exec eas build --platform android --profile preview --non-interactive --no-wait` from the app dir (EXPO_TOKEN authenticates).
