---
name: Expo/EAS version alignment
description: Expo native packages must stay on the same SDK major and use one authoritative Expo version before EAS builds.
---

Expo/EAS builds can fail when an Expo SDK 54 app declares a native module from SDK 57 or declares Expo in multiple dependency sections with different ranges. Preview APK profiles should explicitly use internal distribution.

**Why:** Native module versions are coupled to the Expo SDK; local development may still run while the clean EAS install rejects or misbuilds the project.

**How to apply:** Before an Android or iOS build, keep one Expo declaration, align Expo modules with the SDK's expected versions, regenerate the lockfile, validate the resolved app config, and set preview APK profiles to `distribution: "internal"` so EAS does not enter Play Store submission credential setup.