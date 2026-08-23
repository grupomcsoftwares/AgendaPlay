---
name: Vite and React typecheck quirks
description: Build-time environment defaults and React ref typing details needed by the web and mockup Vite artifacts.
---

Vite configs should use workflow-provided `PORT` and `BASE_PATH` when present, but safe defaults are needed for standalone production builds. React 19 ref callback types can require an explicit ref cast in third-party component adapters, and SVG wrapper props should omit `ref` when forwarding to icon components.

**Why:** Full monorepo validation exposed failures that were invisible during normal workflows: builds lacked environment variables and shared mockup components had React type incompatibilities.

**How to apply:** Preserve the workflow values in development while allowing `vite build` without a server port; use the narrowest compatibility cast or `ComponentPropsWithoutRef` rather than weakening project-wide TypeScript settings.