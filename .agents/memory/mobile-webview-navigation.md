---
name: Mobile WebView navigation
description: The Expo phone dashboard embeds the web panel in one WebView and must navigate categories internally to avoid reload flashes.
---

On phone-sized devices, keep the same WebView mounted, but use a same-origin `window.location.assign` for category changes when Android release WebViews do not notify the SPA router about history updates.

**Why:** The Android release WebView accepted `history.pushState` but did not update the Wouter route, leaving users on the overview. A same-origin navigation reliably initializes each route; native progress handling prevents the loader from getting stuck.

**How to apply:** Preserve the WebView instance and initial source, inject a relative same-origin route for phone menu actions, set readiness false on load start, and clear the loader on load end or progress 1. Keep a requested route pending until the WebView has emitted `onLoadEnd`; reload after a renderer-process termination.