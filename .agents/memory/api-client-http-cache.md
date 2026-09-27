---
name: API client HTTP cache
description: Keep the shared React Query API client from treating conditional HTTP responses as empty API data.
---

The shared API client uses `cache: "no-store"` by default; React Query owns client-side caching. The client treats non-2xx responses as errors, so a raw bodyless 304 cannot substitute for an API response unless a caller deliberately implements revalidation and reuses prior data.

**Why:** Production logs on 2026-09-27 showed repeated 304 responses for dashboard and appointment queries. A WebView that exposes those responses to fetch can leave the pages in query error or empty states.

**How to apply:** Keep no-store as the default for JSON API requests and allow explicit cache-mode overrides only for endpoints with a defined 304 recovery path.