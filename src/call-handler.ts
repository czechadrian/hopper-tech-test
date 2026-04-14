import { CallRecord } from './call-record.i';
import { CsvParserService } from './services/csv-parser.service';
import { EnricherService } from './services/enricher.service';
import { IDbRepository } from './repositories/db.repository';
import { ISearchRepository } from './repositories/search.repository';

type Response = {
  ok: boolean;
  error?: string;
};

export class CallHandler {
  constructor(
    private readonly parser: CsvParserService,
    private readonly enricher: EnricherService,
    private readonly db: IDbRepository,
    private readonly search: ISearchRepository,
  ) {}

  /**
   * Handle a batch of call records.
   *
   * Validates and acknowledges the batch immediately (< 500 ms SLA), then
   * enriches and persists records asynchronously in the background.
   */
  async handleBatch(payload: string): Promise<Response> {
    const { records, errors } = this.parser.parse(payload);

    if (records.length === 0) {
      return { ok: false, error: errors[0] ?? 'No valid records in batch' };
    }

    // Fire-and-forget — must not block the acknowledgment response
    this.enrichAndStore(records).catch(err =>
      console.error('[CallHandler] Background processing failed:', err),
    );

    return { ok: true };
  }

  private async enrichAndStore(records: CallRecord[]): Promise<void> {
    const enriched = await this.enricher.enrich(records);
    await Promise.all([this.db.saveMany(enriched), this.search.indexMany(enriched)]);
  }
}
