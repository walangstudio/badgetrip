import type { IconResolver } from '@walangstudio/badgetrip-assets';
import {
  type AchievementView,
  type Engine,
  type Observable,
  toObservable,
} from '@walangstudio/badgetrip-core';
import { renderBadge, renderCatalog } from './render.js';

export type ElementOptions = {
  icons?: IconResolver;
  /** Tag prefix: `'badgetrip'` gives `<badgetrip-catalog>` and `<badgetrip-badge>`. */
  tagPrefix?: string;
};

const MOTION = '(prefers-reduced-motion: reduce)';

/**
 * Register `<{prefix}-catalog actor>` and `<{prefix}-badge actor code>`. They re-render
 * after every emit/replay/seed/refresh through `observed.engine`, on attribute change,
 * and when `prefers-reduced-motion` flips. A failed query dispatches a bubbling
 * `badgetrip-error` event with the error as `detail`. Safe to import and call outside a
 * browser (it does nothing); a tag that is already defined is left as is.
 */
export function defineBadgetripElements(
  source: Engine | Observable,
  opts: ElementOptions = {},
): void {
  if (typeof customElements === 'undefined') return;
  const observed = toObservable(source);
  const prefix = opts.tagPrefix ?? 'badgetrip';
  const { icons } = opts;
  const { engine } = observed;

  // Every element for one actor shares one catalog query per engine version.
  let cacheVersion = -1;
  const cache = new Map<string, Promise<AchievementView[]>>();
  const catalog = (actor: string) => {
    if (cacheVersion !== observed.getVersion()) {
      cacheVersion = observed.getVersion();
      cache.clear();
    }
    let p = cache.get(actor);
    if (!p) {
      p = engine.catalog(actor);
      cache.set(actor, p);
      p.catch(() => cache.delete(actor));
    }
    return p;
  };

  abstract class BadgetripElement extends HTMLElement {
    static observedAttributes = ['actor', 'code', 'secret'];
    #unsubscribe?: () => void;
    #motion?: MediaQueryList;
    #run = 0;
    readonly #rerender = () => void this.#render();

    protected abstract html(actor: string, reducedMotion: boolean): Promise<string>;

    connectedCallback() {
      this.#unsubscribe = observed.subscribe(this.#rerender);
      this.#motion = globalThis.matchMedia?.(MOTION);
      this.#motion?.addEventListener('change', this.#rerender);
      void this.#render();
    }

    disconnectedCallback() {
      this.#unsubscribe?.();
      this.#unsubscribe = undefined;
      this.#motion?.removeEventListener('change', this.#rerender);
      this.#motion = undefined;
    }

    attributeChangedCallback() {
      if (this.#unsubscribe) void this.#render();
    }

    async #render() {
      const run = ++this.#run;
      const actor = this.getAttribute('actor');
      try {
        const html = actor ? await this.html(actor, !!this.#motion?.matches) : '';
        if (run === this.#run && this.#unsubscribe) this.innerHTML = html;
      } catch (err) {
        if (run === this.#run) {
          this.dispatchEvent(new CustomEvent('badgetrip-error', { detail: err, bubbles: true }));
        }
      }
    }
  }

  const define = (tag: string, ctor: CustomElementConstructor) => {
    if (!customElements.get(tag)) customElements.define(tag, ctor);
  };

  define(
    `${prefix}-catalog`,
    class extends BadgetripElement {
      protected async html(actor: string, reducedMotion: boolean) {
        return renderCatalog(await catalog(actor), {
          icons,
          reducedMotion,
          secret: this.hasAttribute('secret'),
        });
      }
    },
  );

  define(
    `${prefix}-badge`,
    class extends BadgetripElement {
      protected async html(actor: string, reducedMotion: boolean) {
        const code = this.getAttribute('code');
        const view = (await catalog(actor)).find((a) => a.code === code);
        if (!view) throw new Error(`unknown achievement: ${code}`);
        return renderBadge(view, { icons, reducedMotion });
      }
    },
  );
}
