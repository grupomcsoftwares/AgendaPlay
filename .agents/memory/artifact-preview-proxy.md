---
name: Artifact preview proxy checks
description: Distinguish a local shell port probe from the routed artifact preview.
---

When diagnosing an artifact preview, a failed `localhost:<localPort>` probe from the shell does not by itself prove the visitor-facing preview is down. Check the artifact's development domain and workflow state as well; the application router can serve the artifact when the shell-local probe cannot.

**Why:** During a web preview failure, the local port probe timed out while the artifact development domain returned the AgendaPlay page with HTTP 200.

**How to apply:** Verify the routed development domain and workflow logs before treating a shell-local port timeout as the root cause or changing port configuration.
