import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CallHandler } from '../src/call-handler';
import { CsvParserService } from '../src/services/csv-parser.service';
import { EnricherService } from '../src/services/enricher.service';
import { DbRepository } from '../src/repositories/db.repository';
import { SearchRepository } from '../src/repositories/search.repository';

// Deterministic mock — eliminates the ~5% random failure rate from the real mock
vi.mock('../src/operator-lookup', () => ({
  lookupOperator: vi.fn().mockImplementation((phoneNumber: string) => {
    if (phoneNumber.startsWith('+1')) {
      return Promise.resolve({ operator: 'AT&T', country: 'United States', estimatedCostPerMinute: 0.02 });
    }
    return Promise.resolve({ operator: 'BT', country: 'United Kingdom', estimatedCostPerMinute: 0.05 });
  }),
}));

const VALID_CSV = [
  'id,callStartTime,callEndTime,fromNumber,toNumber,callType,region',
  'cdr_001,2026-01-21T14:30:00.000Z,2026-01-21T14:35:30.000Z,+14155551234,+442071234567,voice,us-west',
  'cdr_002,2026-01-21T14:31:15.000Z,2026-01-21T14:33:45.000Z,+442071234567,+14155551234,voice,eu-west',
].join('\n');

function makeHandler() {
  const db = new DbRepository();
  const search = new SearchRepository();
  const handler = new CallHandler(new CsvParserService(), new EnricherService(), db, search);
  return { handler, db, search };
}

describe('CallHandler.handleBatch', () => {
  it('acknowledges a valid batch within 500 ms', async () => {
    const { handler } = makeHandler();

    const start = Date.now();
    const result = await handler.handleBatch(VALID_CSV);
    const elapsed = Date.now() - start;

    expect(result.ok).toBe(true);
    expect(elapsed).toBeLessThan(500);
  });

  it('returns ok:false for an empty payload', async () => {
    const { handler } = makeHandler();

    const result = await handler.handleBatch('');

    expect(result.ok).toBe(false);
    expect(result.error).toBe('Payload is empty');
  });

  it('returns ok:false for a whitespace-only payload', async () => {
    const { handler } = makeHandler();

    const result = await handler.handleBatch('   \n  ');

    expect(result.ok).toBe(false);
  });

  it('returns ok:false when all rows fail validation', async () => {
    const { handler } = makeHandler();
    const invalidCsv = [
      'id,callStartTime,callEndTime,fromNumber,toNumber,callType,region',
      'bad,,not-a-date,not-e164,not-e164,unknown,',
    ].join('\n');

    const result = await handler.handleBatch(invalidCsv);

    expect(result.ok).toBe(false);
    expect(result.error).toContain('Row 1');
  });

  it('acknowledges if at least one row is valid, even with invalid rows present', async () => {
    const { handler } = makeHandler();
    const mixedCsv = [
      'id,callStartTime,callEndTime,fromNumber,toNumber,callType,region',
      'cdr_001,2026-01-21T14:30:00.000Z,2026-01-21T14:35:30.000Z,+14155551234,+442071234567,voice,us-west',
      'bad,,not-a-date,not-e164,not-e164,unknown,',
    ].join('\n');

    const result = await handler.handleBatch(mixedCsv);

    expect(result.ok).toBe(true);
  });

  it('stores enriched records in db and search index after background processing', async () => {
    const { handler, db, search } = makeHandler();

    await handler.handleBatch(VALID_CSV);

    // Allow the background enrichment to complete
    await vi.waitFor(() => expect(db.getAll().length).toBeGreaterThan(0), { timeout: 2000 });

    const stored = db.getAll();
    expect(stored).toHaveLength(2);
    expect(stored[0]).toMatchObject({
      id: 'cdr_001',
      duration: 330, // (14:35:30 - 14:30:00) = 5m 30s
      fromCountry: 'United States',
      toCountry: 'United Kingdom',
    });

    expect(search.findById('cdr_001')).toBeDefined();
    expect(search.findById('cdr_002')).toBeDefined();
  });
});
