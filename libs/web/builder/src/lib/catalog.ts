import {
  Injectable,
  PLATFORM_ID,
  TransferState,
  computed,
  inject,
  makeStateKey,
  resource,
  signal,
} from '@angular/core';
import { DOCUMENT, PlatformLocation, isPlatformServer } from '@angular/common';
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
 * On the server nothing is loaded unless a page asks for it with `renderOnServer()`: the builder
 * and the collection are prerendered as their loading state, which is exactly what the browser
 * starts from, so hydration has nothing to reconcile. A page that does ask (the comps) is drawn
 * with the full catalog, and only the cards it actually read are handed to the browser, which
 * looks them up there until its own fetch of the full catalog lands.
 */
const CANONICAL = 'data/canonical';

/** The part of a catalog the server drew a page with, in a shape that survives JSON. */
interface CatalogSeed {
  units: Unit[];
  gods: God[];
  realms: Realm[];
  keywords: [string, Keyword][];
  icons: [string, string][];
}

/** Unset when the page never got its catalog, which JSON then leaves out altogether. */
const SEED = makeStateKey<CatalogSeed | undefined>('catalog');

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
  private readonly location = inject(PlatformLocation);
  private readonly transfer = inject(TransferState);
  private readonly server = isPlatformServer(inject(PLATFORM_ID));

  /**
   * Absolute so the fetch works from any route depth. The server's DOM has no `baseURI`; there the
   * files are on the page's own origin, which prerendering answers from the build's assets.
   */
  private readonly base = computed(() =>
    this.server ? new URL('/', this.location.href) : new URL(this.document.baseURI),
  );

  /** Server only: set by a page that is drawn with its cards rather than as a loading state. */
  private readonly wanted = signal(false);

  /** Server only: the units and gods a page looked up, which is all the browser is sent. */
  private readonly read = { units: new Set<string>(), gods: new Set<string>() };

  /** Browser only: the cards the server drew this page with, until the full catalog is in. */
  private readonly seed = fromSeed(this.transfer.get(SEED, null));

  private readonly data = resource({
    params: () => (!this.server || this.wanted() ? true : undefined),
    loader: async ({ abortSignal }): Promise<Catalog> => {
      const [cards, keywords, realms, icons] = await Promise.all([
        this.fetchFile<DatasetCard[]>('cards.json', abortSignal),
        this.fetchFile<DatasetKeyword[]>('keywords.json', abortSignal),
        this.fetchFile<DatasetRealm[]>('realms.json', abortSignal),
        this.fetchFile<DatasetIcon[]>('icons.json', abortSignal),
      ]);
      return buildCatalog(cards, keywords, realms, icons);
    },
  });

  /**
   * The full catalog, once it is in. A seed never shows up here: whatever lists or restores from
   * the whole catalog (the unit pool, a share link) must not act on a page's handful of cards.
   */
  readonly value = this.data.value;
  readonly isLoading = this.data.isLoading;
  readonly error = this.data.error;

  /** What single lookups answer from: the full catalog, or until then the server's seed. */
  private readonly lookup = computed(() => this.value() ?? this.seed);

  /** True once a lookup by id can answer — which a hydrating comps page needs from its first render. */
  readonly canLookUp = computed(() => !!this.lookup());

  readonly units = computed<readonly Unit[]>(() => this.value()?.units ?? []);
  readonly gods = computed<readonly God[]>(() => this.value()?.gods ?? []);
  readonly spells = computed<readonly Spell[]>(() => this.value()?.spells ?? []);
  readonly realms = computed<readonly Realm[]>(() => this.value()?.realms ?? []);

  /** Where an inline rules icon is served from, or undefined for a sprite the dataset lacks. */
  iconSrc(sprite: string): string | undefined {
    return this.lookup()?.icons.get(sprite);
  }

  /** A keyword's readable title, or the raw code where the dataset has nothing for it. */
  keywordTitle(code: string): string {
    return this.lookup()?.keywords.get(code)?.title ?? code;
  }

  keyword(code: string): Keyword | undefined {
    return this.lookup()?.keywords.get(code);
  }

  unit(id: string): Unit | undefined {
    if (this.server) this.read.units.add(id);
    return this.lookup()?.unitById.get(id);
  }

  god(id: string): God | undefined {
    if (this.server) this.read.gods.add(id);
    return this.lookup()?.godById.get(id);
  }

  /**
   * Draws the calling page with its cards when it is rendered on the server, and sends the cards it
   * read along with the HTML so the browser hydrates the same markup. A no-op in the browser.
   */
  renderOnServer(): void {
    if (!this.server || this.wanted()) return;
    this.wanted.set(true);
    this.transfer.onSerialize(SEED, () => {
      const catalog = this.value();
      return catalog && toSeed(catalog, this.read);
    });
  }

  reload(): void {
    this.data.reload();
  }

  private async fetchFile<T>(file: string, signal: AbortSignal): Promise<T> {
    const url = new URL(`${CANONICAL}/${file}`, this.base());
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error(`${file}: ${response.status} ${response.statusText}`);
    return (await response.json()) as T;
  }
}

/**
 * The cards a page read, plus the small tables every card leans on (keywords, realms, icons) whole,
 * so a card preview opened before the full catalog lands still has its keywords.
 */
function toSeed(
  catalog: Catalog,
  read: { units: ReadonlySet<string>; gods: ReadonlySet<string> },
): CatalogSeed {
  const pick = <T>(byId: ReadonlyMap<string, T>, ids: ReadonlySet<string>) =>
    [...ids].map((id) => byId.get(id)).filter((card) => card !== undefined);
  return {
    units: pick(catalog.unitById, read.units),
    gods: pick(catalog.godById, read.gods),
    realms: [...catalog.realms],
    keywords: [...catalog.keywords],
    icons: [...catalog.icons],
  };
}

function fromSeed(seed: CatalogSeed | null | undefined): Catalog | undefined {
  if (!seed) return undefined;
  return {
    units: seed.units,
    gods: seed.gods,
    spells: [],
    realms: seed.realms,
    keywords: new Map(seed.keywords),
    icons: new Map(seed.icons),
    unitById: new Map(seed.units.map((unit) => [unit.id, unit])),
    godById: new Map(seed.gods.map((god) => [god.id, god])),
  };
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
