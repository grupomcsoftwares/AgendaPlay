---
name: Android notification sound names
description: Android resource naming constraints for Expo notification sound assets.
---

Expo's Android notification plugin derives resource names from notification sound filenames. Use lowercase letters, digits, and underscores only; hyphens cause Android prebuild to fail.

**Why:** Android rejects resource names containing hyphens during the native prebuild step, before the APK compilation starts.

**How to apply:** Name bundled notification files with underscore-separated names and use the same filenames in the Expo plugin configuration and native notification channel sound values.