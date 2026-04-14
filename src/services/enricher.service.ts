import { CallRecord, EnrichedCallRecord } from '../call-record.i';
import { OperatorInfo, lookupOperator } from '../operator-lookup';

export class EnricherService {
  async enrich(records: CallRecord[]): Promise<EnrichedCallRecord[]> {
    const callDate = this.toCallDate(records[0].callStartTime);
    const operatorMap = await this.buildOperatorMap(records, callDate);
    return records.map(record => this.buildEnrichedRecord(record, operatorMap));
  }

  private async buildOperatorMap(
    records: CallRecord[],
    callDate: string,
  ): Promise<Map<string, OperatorInfo | undefined>> {
    // Deduplicate across the batch to minimise API calls
    const uniqueNumbers = [...new Set(records.flatMap(r => [r.fromNumber, r.toNumber]))];

    const entries = await Promise.all(
      uniqueNumbers.map(async (number): Promise<[string, OperatorInfo | undefined]> => {
        try {
          return [number, await lookupOperator(number, callDate)];
        } catch {
          // Graceful degradation: partial enrichment is better than a full failure
          return [number, undefined];
        }
      }),
    );

    return new Map(entries);
  }

  private buildEnrichedRecord(
    record: CallRecord,
    operatorMap: Map<string, OperatorInfo | null>,
  ): EnrichedCallRecord {
    const duration = this.calcDurationSeconds(record.callStartTime, record.callEndTime);
    const fromInfo = operatorMap.get(record.fromNumber);
    const toInfo = operatorMap.get(record.toNumber);

    return {
      ...record,
      duration,
      fromOperator: fromInfo?.operator,
      toOperator: toInfo?.operator,
      fromCountry: fromInfo?.country,
      toCountry: toInfo?.country,
      // Billing perspective: caller pays their own operator's per-minute rate
      estimatedCost: fromInfo
        ? parseFloat((fromInfo.estimatedCostPerMinute * (duration / 60)).toFixed(4))
        : undefined,
    };
  }

  /** Converts ISO 8601 timestamp to the 'yy-MM-dd' format required by lookupOperator */
  private toCallDate(isoDate: string): string {
    const d = new Date(isoDate);
    const yy = String(d.getUTCFullYear()).slice(-2);
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
  }

  private calcDurationSeconds(start: string, end: string): number {
    return Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000);
  }
}
