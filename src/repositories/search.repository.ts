import { EnrichedCallRecord } from '../call-record.i';

// Production choice: Elasticsearch (or OpenSearch)
//   - Index pattern: cdr-{YYYY-MM} for time-based rollover and cost control
//   - Full-text on operator/country fields; keyword aggregations for analytics
//   - Bulk API for efficient batch writes
export interface ISearchRepository {
  indexMany(records: EnrichedCallRecord[]): Promise<void>;
}

export class SearchRepository implements ISearchRepository {
  private readonly index = new Map<string, EnrichedCallRecord>();

  async indexMany(records: EnrichedCallRecord[]): Promise<void> {
    records.forEach(record => this.index.set(record.id, record));
    console.log(`[Search] Indexed ${records.length} record(s)`);
  }

  /** Exposed for testing only */
  findById(id: string): EnrichedCallRecord | undefined {
    return this.index.get(id);
  }
}
