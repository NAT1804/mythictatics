import { REALM_CODES, type RealmCode } from '@mythictatics/shared/contracts';
import type { RealmDraft } from './draft';

/**
 * The builder's state that `?d=` cannot carry.
 *
 * `?d=` is byte-compatible with the Mythic Tactics Codex teambuilder, so it holds a board and a
 * patron god and nothing else — appending to it would make links this site writes unreadable
 * there. Everything the builder knows on top of that travels in its own query parameters, which
 * the Codex ignores and this site treats as optional. A link with only `?d=` still opens.
 *
 * - `r` — the realms the player picked, lowest-first so the same draft always writes the same
 *   link. The god's locked realm is not written: it is read back off the god.
 * - `lock` — `0` only when the player released a lock their god has. Absent means the default.
 * - `ds` — the slot the god descended onto.
 */
export interface DraftParams {
  realms: readonly RealmCode[];
  lockEnabled: boolean;
  descendSlot: number | null;
}

export const DRAFT_PARAM_KEYS = { realms: 'r', lock: 'lock', descend: 'ds' } as const;

const REALM_SET: ReadonlySet<string> = new Set(REALM_CODES);

/**
 * Query parameters for a draft, leaving out everything that is still at its default.
 *
 * A value of `null` means "drop this parameter", which is what Angular's router wants in order to
 * strip it from the URL rather than write an empty one.
 */
export function encodeDraftParams(params: DraftParams): Record<string, string | null> {
  return {
    [DRAFT_PARAM_KEYS.realms]: params.realms.length ? [...params.realms].sort().join('-') : null,
    [DRAFT_PARAM_KEYS.lock]: params.lockEnabled ? null : '0',
    [DRAFT_PARAM_KEYS.descend]: params.descendSlot === null ? null : String(params.descendSlot),
  };
}

/**
 * Draft state read back out of the query string. Nothing here can fail the way a share code can:
 * a realm the dataset no longer has, or a slot index out of range, is dropped and the rest of the
 * link still opens.
 */
export function decodeDraftParams(query: Record<string, string | undefined>): DraftParams {
  const realms = (query[DRAFT_PARAM_KEYS.realms] ?? '')
    .split('-')
    .filter((code): code is RealmCode => REALM_SET.has(code));
  const descend = Number(query[DRAFT_PARAM_KEYS.descend]);
  return {
    realms: [...new Set(realms)],
    lockEnabled: query[DRAFT_PARAM_KEYS.lock] !== '0',
    descendSlot: Number.isInteger(descend) && descend >= 0 ? descend : null,
  };
}

/** The realms of a draft as the query string writes them — the picks, without the locked realm. */
export function draftToParams(
  draft: RealmDraft,
  lockEnabled: boolean,
  descendSlot: number | null,
): DraftParams {
  return { realms: draft.picked, lockEnabled, descendSlot };
}
