---
name: Mobile WebView navigation
description: The Expo phone dashboard embeds the web panel in one WebView and must navigate categories internally to avoid reload flashes.
---

On phone-sized devices, dashboard category changes should use in-WebView history navigation rather than changing the WebView source URL. Keep the WebView mounted so the embedded panel does not flash during every category change.

**Why:** Replacing the WebView source reloads the entire web panel and produces a visible blink on Android.

**How to apply:** Preserve the initial mobile source and use `history.pushState` plus a `popstate` event for subsequent menu navigation. Keep source replacement for tablet/TV flows where the current behavior is intentional. Keep a requested route pending until the WebView has emitted `onLoadEnd`; sending injected JavaScript before the bridge is ready can lose navigation and show a blank page. Provide an event fallback for older Android WebViews and reload after a renderer-process termination.