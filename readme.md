# Hopper Tech Test

## Getting Started

Please refer to [coding-exercise.md](./coding-exercise.md) for the full problem description and instructions.

## Submitting your solution

Create your solution in a fork of this repository. Once you're ready to submit, please add dmanning-resilient as a collaborator on your private repository and send us a message.

## Candidate Notes

### Running the code

```bash
pnpm install
pnpm test          # run tests once
pnpm test:watch    # watch mode
```

---

### Architecture

```
Incoming CSV
     │
     ▼
CsvParserService          ← validates each row with Zod; collects all errors
     │
     ▼ records[]
CallHandler.handleBatch
     │
     ├─ return { ok: true }   ◄── immediate acknowledgment (< 500 ms SLA)
     │
     └─ (background) enrichAndStore()
              │
              ▼
        EnricherService
          · deduplicates phone numbers across the batch
          · fires all lookupOperator() calls in parallel (Promise.all)
          · gracefully degrades if a lookup fails (partial enrichment)
              │
              ▼
        Promise.all([
          DbRepository.saveMany()       ← mock PostgreSQL
          SearchRepository.indexMany()  ← mock Elasticsearch
        ])
```

#### Key design decisions

| Decision | Rationale |
|----------|-----------|
| **Fire-and-forget enrichment** | Enrichment takes 100–300 ms per API call. Awaiting it would break the < 500 ms SLA for even a single-record batch. The handler validates and acknowledges synchronously, then enriches in the background. |
| **Parallel + deduplicated lookups** | A 10-record batch can have up to 20 phone numbers. Sequential lookups at 100–300 ms each would take 2–6 s. Deduplicating first and using `Promise.all` keeps enrichment time bounded by the slowest single lookup (~300 ms). |
| **Graceful lookup degradation** | The mock API has a ~5 % failure rate. A failed lookup sets the relevant fields to `undefined` rather than failing the whole batch — partial enrichment is better than none. |
| **Zod at the boundary** | Validation only happens when untrusted data enters the system (CSV rows). Once a `CallRecord` is in memory it is trusted; no re-validation downstream. |
| **Constructor injection** | `CallHandler` receives its dependencies (parser, enricher, repos) via the constructor, keeping it testable without any module mocking. |

#### Technology choices (production)

- **Database: PostgreSQL via Supabase**
  PostgreSQL's ACID guarantees are important for billing data (`estimatedCost`). Native `TIMESTAMPTZ` and range queries make CDR time-series lookups efficient, and table partitioning on `callStartTime` keeps hot data in fast partitions. Upsert with `ON CONFLICT (id) DO NOTHING` gives idempotent re-delivery for free.
  Supabase is chosen on top because its managed Postgres includes PgBouncer connection pooling out of the box — important at high ingest volume where each batch could open a new serverless connection. Row-Level Security would allow future multi-tenant operators to scope their own data, and Supabase Realtime can push enriched records to dashboards without a separate websocket service.

- **Search: Elasticsearch**
  Index pattern `cdr-{YYYY-MM}` for time-based rollover and cost control; full-text on operator/country fields; keyword aggregations for per-region and per-operator analytics.

- **Queue (if scaling further)**: A durable message queue (e.g. Supabase pgmq, SQS, or BullMQ) between the HTTP handler and an enrichment worker would fully decouple acknowledgment from processing and add automatic retry for failed operator lookups.

---

### Agent guide

See [CLAUDE.md](./CLAUDE.md) for the full coding conventions used in this project (Zod patterns, service design, testing rules, etc.).
