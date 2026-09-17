import { DOCUMENT } from '@angular/common';
import { Injectable, computed, inject, resource } from '@angular/core';
import type { Comp } from '@mythictatics/shared/contracts';

/**
 * The community comps, as the browser sees them.
 *
 * `data/canonical/comps.json` is served as a static asset next to the card dataset, the same way
 * the catalog reads `cards.json`. It names cards by id only, so it is always read together with the
 * catalog — which is where every name, picture and realm comes from.
 *
 * The comps routes are client-rendered, so this never runs during SSR.
 */
const COMPS = 'data/canonical/comps.json';

@Injectable({ providedIn: 'root' })
export class CompsService {
  private readonly document = inject(DOCUMENT);

  private readonly data = resource({
    loader: async ({ abortSignal }): Promise<readonly Comp[]> => {
      const url = new URL(COMPS, this.document.baseURI);
      const response = await fetch(url, { signal: abortSignal });
      if (!response.ok) throw new Error(`comps.json: ${response.status} ${response.statusText}`);
      return (await response.json()) as Comp[];
    },
  });

  readonly comps = computed<readonly Comp[]>(() => this.data.value() ?? []);
  readonly loaded = computed(() => this.data.hasValue());
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
