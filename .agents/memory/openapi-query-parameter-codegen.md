---
name: OpenAPI query parameter codegen
description: Orval Zod export collision when a path endpoint gains query parameters.
---

When an operation has both a path parameter and a query parameter, Orval can generate a Zod path schema and a TypeScript query-input type with the same operation-based name. The public `@workspace/api-zod` barrel must export the query input under an unambiguous type alias while preserving generated schemas and enum values.

Orval 8.41 may infer Zod 4 from its own dependency tree even though the workspace consumer uses Zod 3; pin the generator output version to the consumer's major. Its generated fetch client also uses `Headers.entries`, requiring the `DOM.Iterable` TypeScript library. Explicitly re-export any schema values that collide with generated type names.

**Why:** A wildcard re-export produces duplicate-export errors, and generating Zod 4 APIs for a Zod 3 consumer or omitting DOM iterable declarations breaks the library typecheck.

**How to apply:** After changing the OpenAPI spec or generator version, run API code generation and the library typecheck. Keep generator output aligned with the workspace dependency major, and resolve export collisions in the public barrel rather than editing generated files.