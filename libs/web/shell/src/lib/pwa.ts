import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  Injectable,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SwUpdate } from '@angular/service-worker';

/** Chromium's install prompt, which no DOM typing describes yet. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * The site as an installed app: the install prompt, and the new version waiting behind the old.
 *
 * A service worker keeps serving the version it cached until it is told otherwise, and an installed
 * app can stay open for days — across a game patch, and so across a dataset that no longer matches
 * the game. So the worker is asked for a new version whenever the app comes back to the
 * foreground, not only when a page loads, and a version it has ready is offered as a reload rather
 * than swapped in under a board someone is halfway through building.
 *
 * Everything here is a no-op on the server, in development (where no worker is registered), and in
 * a browser that has no install prompt to give — iOS installs from the share sheet, without asking
 * the page.
 */
@Injectable({ providedIn: 'root' })
export class Pwa {
  private readonly document = inject(DOCUMENT);
  private readonly updates = inject(SwUpdate, { optional: true });

  /** A new version is cached and takes over on the next load. */
  readonly updateReady = signal(false);
  /** The browser will install the site when asked to. */
  readonly canInstall = signal(false);

  private deferredPrompt: BeforeInstallPromptEvent | null = null;

  constructor() {
    const window = this.document.defaultView;
    if (!isPlatformBrowser(inject(PLATFORM_ID)) || !window) return;
    const listening = new AbortController();
    inject(DestroyRef).onDestroy(() => listening.abort());
    const options = { signal: listening.signal };

    window.addEventListener(
      'beforeinstallprompt',
      (event) => {
        // Held back from the browser's own mini-infobar, and offered from the header instead.
        event.preventDefault();
        this.deferredPrompt = event as BeforeInstallPromptEvent;
        this.canInstall.set(true);
      },
      options,
    );
    window.addEventListener('appinstalled', () => this.forgetPrompt(), options);

    const updates = this.updates;
    if (!updates?.isEnabled) return;
    updates.versionUpdates.pipe(takeUntilDestroyed()).subscribe((event) => {
      if (event.type === 'VERSION_READY') this.updateReady.set(true);
    });
    // The cached version can no longer be served in full; only a fresh load recovers.
    updates.unrecoverable.pipe(takeUntilDestroyed()).subscribe(() => this.reload());
    this.document.addEventListener(
      'visibilitychange',
      () => {
        if (this.document.visibilityState === 'visible')
          void updates.checkForUpdate().catch(() => false);
      },
      options,
    );
  }

  async install(): Promise<void> {
    const prompt = this.deferredPrompt;
    if (!prompt) return;
    await prompt.prompt();
    await prompt.userChoice;
    // A prompt answers once, whichever way it went; the browser sends a new one if it may ask again.
    this.forgetPrompt();
  }

  reload(): void {
    this.document.location.reload();
  }

  private forgetPrompt(): void {
    this.deferredPrompt = null;
    this.canInstall.set(false);
  }
}

/** Offers the version the worker has ready; dismissed, it simply waits for the next load. */
@Component({
  selector: 'mt-update-notice',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (pwa.updateReady() && !dismissed()) {
      <div
        role="status"
        data-testid="update-notice"
        class="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-md items-center gap-3 rounded-lg border border-gold/50 bg-panel px-4 py-3 text-sm text-ink shadow-lg shadow-black/50"
      >
        <p class="flex-1">A new version of the site is ready.</p>
        <button
          type="button"
          class="rounded-md border border-gold px-3 py-1.5 text-xs text-gold hover:bg-gold/20"
          (click)="pwa.reload()"
        >
          Reload
        </button>
        <button
          type="button"
          aria-label="Dismiss"
          class="text-lg leading-none text-ink-faint hover:text-ink"
          (click)="dismissed.set(true)"
        >
          ×
        </button>
      </div>
    }
  `,
})
export class UpdateNotice {
  protected readonly pwa = inject(Pwa);
  protected readonly dismissed = signal(false);
}
