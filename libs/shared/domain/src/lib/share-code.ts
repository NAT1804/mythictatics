import { BOARD_SIZE, type Build, type Rank } from '@mythictatics/shared/contracts';
import { createEmptyBoard } from './board';

/**
 * Compact board token, byte-compatible with the Mythic Tactics Codex teambuilder `?d=` links.
 *
 * Byte layout (then base64url, no padding):
 *   [0]  format version (1)
 *   [1]  occupancy bitmask for slots 0-5
 *   [2]  patron god number (`champNNN`, 0 = none)
 *   per occupied slot, in index order: unit number as little-endian uint16 (`mNNNNN`), then rank (0-2)
 *
 * This is an encoding, not encryption.
 */
export const SHARE_CODE_VERSION = 1;

export type ShareCodeError = 'corrupted' | 'unsupported-version';

export type DecodeResult = { ok: true; build: Build } | { ok: false; error: ShareCodeError };

export interface DecodeOptions {
  /** Drop units that are not in the current catalog (e.g. removed in a patch). */
  isKnownUnit?: (unitId: string) => boolean;
  isKnownGod?: (godId: string) => boolean;
}

export function encodeShareCode(build: Build): string {
  const mask = build.board.reduce((bits, slot, index) => (slot ? bits | (1 << index) : bits), 0);
  const godNumber = build.patronGodId ? Number(build.patronGodId.slice('champ'.length)) : 0;
  const bytes = [SHARE_CODE_VERSION, mask, godNumber];
  for (const slot of build.board) {
    if (!slot) continue;
    const unitNumber = Number(slot.unitId.slice(1));
    bytes.push(unitNumber & 0xff, (unitNumber >> 8) & 0xff, slot.rank);
  }
  return toBase64Url(Uint8Array.from(bytes));
}

export function decodeShareCode(token: string, options: DecodeOptions = {}): DecodeResult {
  const bytes = fromBase64Url(token);
  if (!bytes || bytes.length < 3) return { ok: false, error: 'corrupted' };
  if (bytes[0] !== SHARE_CODE_VERSION) return { ok: false, error: 'unsupported-version' };

  const [, mask, godNumber] = bytes;
  const board = createEmptyBoard();
  let offset = 3;
  for (let index = 0; index < BOARD_SIZE; index++) {
    if (!(mask & (1 << index))) continue;
    if (offset + 3 > bytes.length) return { ok: false, error: 'corrupted' };
    const unitNumber = bytes[offset] | (bytes[offset + 1] << 8);
    const rank = Math.min(2, bytes[offset + 2] & 0x03) as Rank;
    offset += 3;
    const unitId = `m${String(unitNumber).padStart(5, '0')}`;
    if (options.isKnownUnit?.(unitId) ?? true) board[index] = { unitId, rank };
  }

  let patronGodId: string | null = null;
  if (godNumber) {
    const godId = `champ${String(godNumber).padStart(3, '0')}`;
    if (options.isKnownGod?.(godId) ?? true) patronGodId = godId;
  }
  return { ok: true, build: { board, patronGodId } };
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(token: string): Uint8Array | null {
  let base64 = token.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) base64 += '=';
  try {
    return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}
