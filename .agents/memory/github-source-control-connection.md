---
name: GitHub source-control connection
description: Distinguishes the GitHub data integration from the Replit source-control connection used by git push and EAS GitHub builds.
---

GitHub authorization through the integrations system can show as active while `git push` still reports that no GitHub source-control credentials exist. These are separate connection paths. A repository used for EAS “Build from GitHub” must be connected through the Replit Git/source-control pane and pushed to the remote; the data connector alone is not sufficient.

**Why:** The AgendaPlay project had an authorized GitHub connector, but the Replit git push helper could not find source-control credentials, and the connector credentials were withheld from the sandbox.

**How to apply:** When GitHub integration is active but `gitPush` returns `NO_CREDENTIALS`, open the Replit Git pane, connect the GitHub repository there, then push the relevant branch before using Expo/EAS GitHub builds.