import Papa from 'papaparse';
import { CallRecord } from '../call-record.i';
import { CallRecordSchema } from '../schemas/call-record.schema';

export type ParseResult = {
  records: CallRecord[];
  errors: string[];
};

export class CsvParserService {
  parse(csv: string): ParseResult {
    if (!csv?.trim()) {
      return { records: [], errors: ['Payload is empty'] };
    }

    const { data } = Papa.parse<Record<string, string>>(csv.trim(), {
      header: true,
      skipEmptyLines: true,
    });

    const records: CallRecord[] = [];
    const errors: string[] = [];

    data.forEach((row, index) => {
      const result = CallRecordSchema.safeParse(row);
      if (result.success) {
        records.push(result.data);
      } else {
        result.error.issues.forEach(e =>
          errors.push(`Row ${index + 1} [${e.path.join('.')}]: ${e.message}`)
        );
      }
    });

    return { records, errors };
  }
}
