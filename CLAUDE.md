# CLAUDE.md — Agent Coding Guide

This file defines the conventions for all code written in this repository.
Follow these rules consistently. When in doubt, prefer simplicity (KISS) over cleverness.

---

## Project Overview

A TypeScript CDR (Call Detail Record) processing system that:
1. Accepts CSV batches of call records
2. Validates them with Zod at runtime
3. Acknowledges receipt in **< 500 ms** (fire-and-forget enrichment)
4. Enriches records via a parallel operator-lookup API
5. Persists enriched records to a mock DB and search index

---

## Stack

| Concern          | Tool                          |
|------------------|-------------------------------|
| Language         | TypeScript (strict)           |
| Runtime validation | Zod                         |
| CSV parsing      | papaparse                     |
| Testing          | vitest                        |
| TS execution     | tsx                           |
| Package manager  | **pnpm** (never npm / yarn)   |

---

## Project Structure

```
src/
  schemas/          # Zod schemas — single source of runtime + compile-time types
  services/         # Business logic — one class per concern (SRP)
  repositories/     # Data-access abstractions — interfaces + mock implementations
  call-handler.ts   # Orchestrator — thin, delegates to services/repos
  call-record.i.ts  # Shared TypeScript interfaces
  operator-lookup.ts  # Mock external API (do not modify)
tests/              # Vitest tests — mirror src/ structure
```

---

## TypeScript Conventions

- Enable `strict` mode (already in tsconfig via `@tsconfig/recommended`).
- Prefer **interface** for public contracts, **type** for derived/utility types.
- Infer types from Zod schemas with `z.infer<typeof Schema>` rather than duplicating.
- No `any`. Use `unknown` + type narrowing when the shape is uncertain.
- Prefer `const` over `let`; avoid `var`.
- Destructure function parameters and return objects when it aids clarity.

---

## Zod Schema Rules

- Every externally-sourced input (CSV rows, API responses) **must** have a Zod schema in `src/schemas/`.
- Use `.safeParse()` — never `.parse()` — so errors are handled explicitly.
- Collect all validation errors across a batch; don't short-circuit on the first failure.
- Co-locate the Zod schema and its inferred type in the same file.

```ts
// Pattern
export const FooSchema = z.object({ ... });
export type Foo = z.infer<typeof FooSchema>;
```

---

## Service Design (SOLID)

- **Single Responsibility**: one class = one job (parsing, enriching, persisting).
- **Dependency Injection**: inject dependencies via constructor — no `new` inside business logic.
- **Interfaces for repos**: define an `IXxxRepository` interface so consumers depend on the abstraction.
- Keep classes small — if a method body exceeds ~20 lines, extract a private helper.

```ts
// Pattern — constructor injection
export class SomeService {
  constructor(private readonly dep: IDependency) {}
}
```

---

## Error Handling

- Validate at the boundary (CSV in, API response in). Trust validated data downstream.
- Never swallow errors silently — either return them in a result type or log + rethrow.
- Background tasks (fire-and-forget) must `.catch(logger)` to surface failures.
- Use a discriminated result type for recoverable errors:

```ts
type Result<T> = { ok: true; data: T } | { ok: false; error: string };
```

---

## Performance Pattern — Sub-500 ms Acknowledgment

The handler must return `{ ok: true }` before enrichment completes.

```ts
// Correct pattern
this.enrichAndStore(records).catch(console.error); // fire-and-forget
return { ok: true };                               // immediate acknowledgment
```

Operator lookups must be **parallelised and deduplicated** across a batch:

```ts
const uniqueNumbers = [...new Set(records.flatMap(r => [r.fromNumber, r.toNumber]))];
const results = await Promise.all(uniqueNumbers.map(n => lookup(n)));
```

---

## Testing Conventions

- Framework: **vitest** (`pnpm test`).
- Test file location: `tests/<name>.test.ts`.
- One `describe` block per class; one `it` per behaviour.
- Prefer real service instances with injected mocks over module-level `vi.mock`.
- The 500 ms SLA must be verified in at least one test:

```ts
const start = Date.now();
const result = await handler.handleBatch(csv);
expect(Date.now() - start).toBeLessThan(500);
```

- A well-written happy-path test is sufficient; don't over-spec edge cases.

---

## What to Avoid

- Do **not** add features beyond what was asked — no extra logging middleware, retry loops, etc.
- Do **not** add comments that just restate the code; only comment non-obvious decisions.
- Do **not** create helper utilities for one-off operations.
- Do **not** use `npm` or `yarn` — always use `pnpm`.
