---
name: OpenAPI query parameter codegen
description: Orval Zod export collision when a path endpoint gains query parameters.
---

When an operation has both a path parameter and a query parameter, Orval can generate a Zod path schema and a TypeScript query-input type with the same operation-based name. The public `@workspace/api-zod` barrel must export the query input under an unambiguous type alias while preserving the generated schema and enum values.

**Why:** A wildcard re-export produces a duplicate export error, which blocks the required library typecheck after code generation.

**How to apply:** After adding query inputs to a path endpoint, run API code generation and the library typecheck. If this collision appears, update the public barrel deliberately rather than editing generated files.