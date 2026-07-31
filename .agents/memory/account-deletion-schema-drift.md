---
name: Account deletion schema drift
description: Constraint for account deletion when development schema and deployed database differ.
---

Account deletion must only issue cleanup queries for tables that exist in the target database. A missing optional table inside the transaction rolls back the entire deletion, leaving the user email registered.

**Why:** The application schema contained an administrative push table that was not present in the database, so the delete endpoint returned an error and PostgreSQL reverted every prior delete.

**How to apply:** Keep account deletion based on the actual deployed schema, explicitly clean indirect records through appointment tokens and join tables, and verify deletion with counts rather than assuming a 204 response means every related record was removed.