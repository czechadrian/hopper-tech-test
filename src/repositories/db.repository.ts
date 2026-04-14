import { EnrichedCallRecord } from '../call-record.i';

// Production choice: PostgreSQL via Supabase
//
// Why PostgreSQL:
//   - Strong ACID guarantees suit financial/billing data (estimatedCost)
//   - Native TIMESTAMPTZ and range queries make time-series CDR lookups efficient
//   - Table partitioning on callStartTime keeps hot data in fast partitions
//   - Indexed on (fromNumber, toNumber) for per-number call history
//   - Upsert with ON CONFLICT (id) DO NOTHING gives idempotent re-delivery at no cost
//
// Why Supabase on top:
//   - Managed Postgres with built-in connection pooling (PgBouncer) — important at
//     high CDR ingest volume where each batch could open a new serverless connection
//   - Row-Level Security lets future multi-tenant operators scope their own data
//   - Supabase Realtime can push enriched records to dashboards without a separate
//     websocket service
//   - Edge Functions + Supabase work well together if the handler ever moves to the edge
export interface IDbRepository {
  saveMany(records: EnrichedCallRecord[]): Promise<void>;
}

export class DbRepository implements IDbRepository {
  private readonly store: EnrichedCallRecord[] = [];

  async saveMany(records: EnrichedCallRecord[]): Promise<void> {
    this.store.push(...records);
    console.log(`[DB] Stored ${records.length} record(s)`);
  }

  /** Exposed for testing only */
  getAll(): EnrichedCallRecord[] {
    return [...this.store];
  }
}
