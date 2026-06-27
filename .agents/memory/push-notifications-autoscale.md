---
name: Push notifications on autoscale
description: Why server-side setInterval schedulers fail on autoscale, and how to fix with client-driven triggers.
---

## Problem

A server-side `setInterval` timer (e.g. every 60 seconds) for sending push notification reminders does **not** work reliably on autoscale platforms. If the server process is idle between HTTP requests, the container scales to zero or the timer stops firing because the Node process is suspended.

## Solution

Instead of relying solely on `setInterval`, add a **client-driven trigger**:

1. **Add a POST endpoint** (e.g. `/api/push/trigger-reminders`) that, when called, immediately checks whether any reminders are due in the current 14-16 minute window and sends them.

2. **Have the client ping this endpoint** on a relevant page (e.g. the appointment confirmation/cancel page). Use `setInterval` in the browser to POST every 60 seconds. As long as any client has the page open, reminders get triggered.

3. **Keep the server-side `setInterval`** as a fallback for non-browser clients, but do not depend on it exclusively.

## Why this works

Browsers keep JavaScript timers running while the tab is open. Multiple clients pinging the same endpoint create overlapping coverage, so even if one tab closes, another may still be open.

## How to apply

- Relevant when: implementing scheduled push notifications, email digests, or any time-based task on autoscale.
- Always pair server-side scheduling with at least one client-driven fallback for critical reminders.
