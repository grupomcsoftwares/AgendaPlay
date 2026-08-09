---
name: Multiple client appointments
description: Public-link behavior when one client has more than one active appointment.
---

A client may have multiple active appointments at the same barbershop. Returning to the public booking link must not overwrite or hide earlier bookings: keep all active cancel tokens locally, show a chooser when there is more than one, and open the selected token's management page. Cancelling one removes only that token. When booking for another person, preserve that person's explicitly entered name even if the responsible client's phone is reused.

**Why:** A single local-storage token made the second booking replace the first, preventing the client from cancelling or rescheduling the earlier appointment. The returning-client name lookup also used the shared phone number and could replace the second person's name with the responsible client's name.

**How to apply:** Maintain backward compatibility with the legacy single-token key, filter cancelled/completed/rejected appointments from the chooser, preserve direct token links, keep the chooser local to the same browser/device where the bookings were made, and skip responsible-client name synchronization when the booking flow carries an explicit other-person name.