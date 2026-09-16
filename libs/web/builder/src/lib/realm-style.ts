import type { RealmCode } from '@mythictatics/shared/contracts';

/**
 * Each realm's colour, written out class by class.
 *
 * Tailwind scans source for whole class names, so `text-realm-${code}` would compile to nothing.
 * These are the literals it needs to see; the theme itself is in `apps/web/src/styles.css`.
 */
export const REALM_TEXT: Record<RealmCode, string> = {
  babylon: 'text-realm-babylon',
  daehan: 'text-realm-daehan',
  kami: 'text-realm-kami',
  neutral: 'text-realm-neutral',
  niles: 'text-realm-niles',
  olympus: 'text-realm-olympus',
  shenzhou: 'text-realm-shenzhou',
  yggdrasil: 'text-realm-yggdrasil',
};

export const REALM_BORDER: Record<RealmCode, string> = {
  babylon: 'border-realm-babylon',
  daehan: 'border-realm-daehan',
  kami: 'border-realm-kami',
  neutral: 'border-realm-neutral',
  niles: 'border-realm-niles',
  olympus: 'border-realm-olympus',
  shenzhou: 'border-realm-shenzhou',
  yggdrasil: 'border-realm-yggdrasil',
};

export const REALM_BG: Record<RealmCode, string> = {
  babylon: 'bg-realm-babylon',
  daehan: 'bg-realm-daehan',
  kami: 'bg-realm-kami',
  neutral: 'bg-realm-neutral',
  niles: 'bg-realm-niles',
  olympus: 'bg-realm-olympus',
  shenzhou: 'bg-realm-shenzhou',
  yggdrasil: 'bg-realm-yggdrasil',
};
