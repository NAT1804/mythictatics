import { Injectable, computed, inject, resource } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import type {
  DatasetCard,
  DatasetIcon,
  DatasetKeyword,
  DatasetRealm,
  God,
  Keyword,
  Realm,
  Spell,
  Unit,
} from '@mythictatics/shared/contracts';
import { REALM_CODES } from '@mythictatics/shared/contracts';
import { DEFAULT_LOCALE, toCard, toKeyword, toRealm } from '@mythictatics/shared/domain';

/**
 * The dataset, as the browser sees it.
 *
 * `data/canonical/` is served verbatim as a static asset and mapped here with the same `toCard`
 * the tests run over, rather than baked into a second, site-shaped file at build time. One source
 * of truth, one mapping, and nothing to regenerate after a patch — the cost is that the fetch
 * carries every locale, which is a few tens of kilobytes gzipped and only on this route.
 *
 * The builder route is client-rendered, so this never runs during SSR.
 */
const CANONICAL = 'data/canonical';

export interface Catalog {
  units: readonly Unit[];
  gods: readonly God[];
  spells: readonly Spell[];
  realms: readonly Realm[];
  keywords: ReadonlyMap<string, Keyword>;
  /** Sprite name (`icon_taunt`) to the path the site serves it from. */
  icons: ReadonlyMap<string, string>;
  unitById: ReadonlyMap<string, Unit>;
  godById: ReadonlyMap<string, God>;
}

@Injectable({ providedIn: 'root' })
export class CatalogService {
  private readonly document = inject(DOCUMENT);

  /** Absolute so the fetch works from any route depth, and from the Worker's own origin. */
  private readonly base = computed(() => new URL(this.document.baseURI));

  private readonly data = resource({
    loader: async ({ abortSignal }): Promise<Catalog> => {
      const [cards, keywords, realms, icons] = await Promise.all([
        this.read<DatasetCard[]>('cards.json', abortSignal),
        this.read<DatasetKeyword[]>('keywords.json', abortSignal),
        this.read<DatasetRealm[]>('realms.json', abortSignal),
        this.read<DatasetIcon[]>('icons.json', abortSignal),
      ]);
      return buildCatalog(cards, keywords, realms, icons);
    },
  });

  readonly value = this.data.value;
  readonly isLoading = this.data.isLoading;
  readonly error = this.data.error;

  readonly units = computed<readonly Unit[]>(() => this.value()?.units ?? []);
  readonly gods = computed<readonly God[]>(() => this.value()?.gods ?? []);
  readonly spells = computed<readonly Spell[]>(() => this.value()?.spells ?? []);
  readonly realms = computed<readonly Realm[]>(() => this.value()?.realms ?? []);

  /** Where an inline rules icon is served from, or undefined for a sprite the dataset lacks. */
  iconSrc(sprite: string): string | undefined {
    return this.value()?.icons.get(sprite);
  }

  /** A keyword's readable title, or the raw code where the dataset has nothing for it. */
  keywordTitle(code: string): string {
    return this.value()?.keywords.get(code)?.title ?? code;
  }

  keyword(code: string): Keyword | undefined {
    return this.value()?.keywords.get(code);
  }

  unit(id: string): Unit | undefined {
    return this.value()?.unitById.get(id);
  }

  god(id: string): God | undefined {
    return this.value()?.godById.get(id);
  }

  reload(): void {
    this.data.reload();
  }

  private async read<T>(file: string, signal: AbortSignal): Promise<T> {
    const url = new URL(`${CANONICAL}/${file}`, this.base());
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error(`${file}: ${response.status} ${response.statusText}`);
    return (await response.json()) as T;
  }
}

/** Kept out of the service so it can be tested without an injector or a network. */
export function buildCatalog(
  cards: readonly DatasetCard[],
  keywords: readonly DatasetKeyword[],
  realms: readonly DatasetRealm[],
  icons: readonly DatasetIcon[] = [],
  locale = DEFAULT_LOCALE,
): Catalog {
  const units: Unit[] = [];
  const gods: God[] = [];
  const spells: Spell[] = [];
  for (const entry of cards) {
    if (entry.kind === 'unit') units.push(toCard(entry, locale) as Unit);
    else if (entry.kind === 'god') gods.push(toCard(entry, locale) as God);
    // Spells never go on a board; the builder ignores them and the collection lists them.
    else spells.push(toCard(entry, locale) as Spell);
  }

  // Cheapest Tier first, then name, which is the order the unit pool wants and the order a
  // player scanning for a Tier expects.
  units.sort((one, other) => one.tier - other.tier || one.name.localeCompare(other.name));
  gods.sort((one, other) => one.realm.localeCompare(other.realm) || one.id.localeCompare(other.id));
  spells.sort((one, other) => one.tier - other.tier || one.name.localeCompare(other.name));

  const order = new Map(REALM_CODES.map((code, index) => [code, index]));
  const mapped = realms.map((realm) => toRealm(realm, locale));
  mapped.sort((one, other) => (order.get(one.code) ?? 0) - (order.get(other.code) ?? 0));

  return {
    units,
    gods,
    spells,
    realms: mapped,
    keywords: new Map(keywords.map((entry) => [entry.key, toKeyword(entry, locale)])),
    icons: new Map(icons.map((icon) => [icon.sprite, icon.image])),
    unitById: new Map(units.map((unit) => [unit.id, unit])),
    godById: new Map(gods.map((god) => [god.id, god])),
  };
}
