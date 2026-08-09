---
name: APK release versioning
description: The update server and installed APK must be released from the same source version and Android build number.
---

The update dialog displays the version bundled into the installed APK, not the version currently configured in the repository or returned by the server. Changing the app version after an APK was built does not change already-generated APKs.

**Why:** An APK distributed as 1.0.2 continued showing an update prompt after the server was changed to 1.0.3 because the first 1.0.3-named artifact had actually been built before the client version change.

**How to apply:** Before distributing an APK, validate the resolved Expo config, increment Android `versionCode`, build a fresh artifact, verify its EAS metadata, then update the server's APK URL. Publish the server change before asking users to install the update.

For Amazon Fire TV, do not expose the Expo artifact URL directly to the update button. Proxy the APK through the published AgendaPlay API with Android download headers and byte-range support.

**Why:** Silk Browser can fail when following Expo's redirect chain to its temporary signed CDN URL, especially for large APK downloads or resumed transfers.

**How to apply:** Keep the EAS URL server-side, return a same-origin `/api/app-download.apk` URL from `/api/app-version`, and preserve `Content-Disposition`, `Content-Length`, `Accept-Ranges`, and `Content-Range`.