---
name: APK release versioning
description: The update server and installed APK must be released from the same source version and Android build number.
---

The update dialog displays the version bundled into the installed APK, not the version currently configured in the repository or returned by the server. Changing the app version after an APK was built does not change already-generated APKs.

**Why:** An APK distributed as 1.0.2 continued showing an update prompt after the server was changed to 1.0.3 because the first 1.0.3-named artifact had actually been built before the client version change.

**How to apply:** Before distributing an APK, validate the resolved Expo config, increment Android `versionCode`, build a fresh artifact, verify its EAS metadata, then update the server's APK URL. Publish the server change before asking users to install the update.