---
name: Static Expo server security
description: Security boundary for the standalone Expo static-build server and release scanning expectations.
---

The standalone Expo server must index the static build at startup and serve content only by exact URL-key lookup. It must not read a filesystem path derived from an HTTP URL during a request, even when path normalization and root checks are present; static-analysis scanners flag that pattern as path traversal.

**Why:** A previous implementation was functionally protected against encoded traversal, but SAST still reported high findings and the server kept file descriptors open. An in-memory allowlist removed both the report and the descriptor leak while preserving 403 responses for traversal attempts.

**How to apply:** When changing the static server, keep manifest routes allowlisted, skip symlinks while indexing, reject decoded `.`/`..` segments and backslashes, and test valid assets plus encoded traversal. Treat dependency-audit highs separately from SAST/HoundDog results; they may remain as transitive advisories even when application-code scans are clean.