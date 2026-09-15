import { z } from 'zod';
import { REALM_CODES } from './constants';

export const RealmCodeSchema = z.enum(REALM_CODES);
export type RealmCode = z.infer<typeof RealmCodeSchema>;

export const RealmSchema = z.object({
  code: RealmCodeSchema,
  /** The realm's number in the game's own id scheme — see `REALM_NUMBERS`. */
  number: z.number().int().positive(),
  name: z.string().min(1),
});
export type Realm = z.infer<typeof RealmSchema>;
