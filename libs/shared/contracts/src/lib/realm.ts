import { z } from 'zod';
import { REALM_CODES } from './constants';

export const RealmCodeSchema = z.enum(REALM_CODES);
export type RealmCode = z.infer<typeof RealmCodeSchema>;

export const RealmSchema = z.object({
  code: RealmCodeSchema,
  name: z.string().min(1),
});
export type Realm = z.infer<typeof RealmSchema>;

/** Community-sourced data is not always verified against the game client. */
export const DataConfidenceSchema = z.enum(['confirmed', 'inferred']);
export type DataConfidence = z.infer<typeof DataConfidenceSchema>;
