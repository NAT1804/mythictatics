import { DOCUMENT, PlatformLocation, isPlatformServer } from '@angular/common';
import {
  Injectable,
  PLATFORM_ID,
  TransferState,
  computed,
  inject,
  makeStateKey,
  resource,
} from '@angular/core';
import type { Comp } from '@mythictatics/shared/contracts';

/**
 * The community comps, as the browser sees them.
 *
 * `data/canonical/comps.json` is served as a static asset next to the card dataset, the same way
 * the catalog reads `cards.json`. It names cards by id only, so it is always read together with the
 * catalog — which is where every name, picture and realm comes from.
 *
 * The comps routes are prerendered, and the list goes out with the HTML so the browser hydrates
 * the same comps without fetching them again. It is the whole file, not the one comp a page shows,
 * because the list page and every comp page share it and moving between them should not wait on
 * the network.
 */
const COMPS = 'data/canonical/comps.json';

const SEED = makeStateKey<readonly Comp[]>('comps');

@Injectable({ providedIn: 'root' })
export class CompsService {
  private readonly document = inject(DOCUMENT);
  private readonly location = inject(PlatformLocation);
  private readonly server = isPlatformServer(inject(PLATFORM_ID));
  private readonly transfer = inject(TransferState);

  /** Browser only: the comps the server rendered with, which makes the fetch unnecessary. */
  private readonly seed = this.transfer.get(SEED, null);

  private readonly data = resource({
    params: () => (this.seed ? undefined : true),
    loader: async ({ abortSignal }): Promise<readonly Comp[]> => {
      // The server's DOM has no `baseURI`; there the file is on the page's own origin, which
      // prerendering answers from the build's assets.
      const base = this.server ? new URL('/', this.location.href) : this.document.baseURI;
      const response = await fetch(new URL(COMPS, base), { signal: abortSignal });
      if (!response.ok) throw new Error(`comps.json: ${response.status} ${response.statusText}`);
      const comps = (await response.json()) as Comp[];
      if (this.server) this.transfer.set(SEED, comps);
      return comps;
    },
  });

  readonly comps = computed<readonly Comp[]>(() => this.seed ?? this.data.value() ?? []);
  readonly loaded = computed(() => !!this.seed || this.data.hasValue());
  readonly isLoading = this.data.isLoading;
  readonly error = this.data.error;

  private readonly bySlug = computed(() => new Map(this.comps().map((comp) => [comp.slug, comp])));

  comp(slug: string): Comp | undefined {
    return this.bySlug().get(slug);
  }

  reload(): void {
    this.data.reload();
  }
}
