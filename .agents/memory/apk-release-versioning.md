---
name: APK release versioning
description: The update server and installed APK must be released from the same source version and Android build number.
---

The update dialog displays the version bundled into the installed APK, not the version currently configured in the repository or returned by the server. Changing the app version after an APK was built does not change already-generated APKs.

**Why:** An APK distributed as 1.0.2 continued showing an update prompt after the server was changed to 1.0.3 because the first 1.0.3-named artifact had actually been built before the client version change.

**How to apply:** Before distributing an APK, validate the resolved Expo config, increment Android `versionCode`, build a fresh artifact, verify its EAS metadata, then update the server's APK URL. Publish the server change before asking users to install the update.

Keep the app-facing APK URL on AgendaPlay, but redirect the browser to the EAS CDN instead of streaming the APK through the API.

**Why:** Proxying the 84 MB APK produced premature stream closures and 5xx responses on full downloads; the original EAS artifact was intact, and a full CDN download matched it.

**How to apply:** Return a stable same-origin `/api/app-download.apk` URL from `/api/app-version`, then redirect that endpoint to the current EAS artifact URL. Verify a complete download and test the target Android browser, since device-level redirect behavior is not covered by server tests.

The app's update checker must compare the server version with the version embedded in the installed binary, not a separate hard-coded constant.

**Why:** A stale client constant can repeatedly announce the same or an older APK, sending Fire TV users to a download that cannot update the installed app.

**How to apply:** Read the installed app version from native Expo constants, with the resolved Expo config version as a fallback, and keep the server version synchronized with the newly built APK.

For Fire TV downloads, resolve the stable Expo artifact server-side and redirect directly to its signed CDN URL instead of sending Silk through Expo's multi-hop redirect chain.

**Why:** Silk displayed a blank page for the multi-hop APK URL even though the artifact was valid and reachable over HTTP.

**How to apply:** Keep `/api/app-download.apk` stable, request the current signed CDN target from Expo when each download starts, validate its host, and redirect without proxying the APK bytes.