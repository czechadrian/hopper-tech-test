import { z } from 'zod';

const E164_REGEX = /^\+[1-9]\d{1,14}$/;
const ISO_DATETIME_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

export const CallRecordSchema = z.object({
  id: z.string().min(1, 'id is required'),
  callStartTime: z.string().regex(ISO_DATETIME_REGEX, 'callStartTime must be ISO 8601'),
  callEndTime: z.string().regex(ISO_DATETIME_REGEX, 'callEndTime must be ISO 8601'),
  fromNumber: z.string().regex(E164_REGEX, 'fromNumber must be E.164 format (e.g. +14155551234)'),
  toNumber: z.string().regex(E164_REGEX, 'toNumber must be E.164 format (e.g. +14155551234)'),
  callType: z.enum(['voice', 'video']),
  region: z.string().min(1, 'region is required'),
});

export type ParsedCallRecord = z.infer<typeof CallRecordSchema>;
