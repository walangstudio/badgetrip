# @walangstudio/badgetrip-html

Achievement badges as HTML, for anything that is not React: server rendering, htmx, vanilla JS, Tauri/Electron webviews, and Angular/Svelte/Vue through custom elements. Same markup and behaviour as the React `AchievementBadge`.

[HTML guide](../../docs/guide/html.md) · [htmx guide](../../docs/guide/htmx.md) · [badgetrip](../../README.md)

## Install

```sh
npm install @walangstudio/badgetrip-html @walangstudio/badgetrip-core
```

No other dependencies.

## Strings

```ts
import { renderBadge, renderCatalog } from '@walangstudio/badgetrip-html';

const html = renderCatalog(await engine.catalog('u1'));
const one = renderBadge(view, { size: 64, reducedMotion: true, icons });
```

`renderBadge(view, opts?)` returns a `<figure data-unlocked data-concealed>` with the icon (greyscale while locked), name, description, and a `<progress>` bar while locked and not concealed. It stretches to its grid cell so bars align. `renderCatalog(views, opts?)` wraps badges in a `repeat(auto-fill, minmax(140px, 1fr))` grid.

Options: `icons` (a `createIconResolver(...)` from `@walangstudio/badgetrip-assets`), `reducedMotion` (animated icons show their still frame), `size` (px, default 48), `showProgress` (default true), `className`.

Every text and attribute value is HTML-escaped. Icon URLs with `javascript:`, `vbscript:` or a non-image `data:` scheme render as an empty `src`.

## Custom elements

```ts
import { observe } from '@walangstudio/badgetrip-core';
import { defineBadgetripElements } from '@walangstudio/badgetrip-html';

const observed = observe(engine);
defineBadgetripElements(observed, { icons, tagPrefix: 'badgetrip' });

// Emit through observed.engine so the elements re-render.
await observed.engine.emit({ id, actor: 'u1', type: 'win', ts: Date.now(), payload: {} });
```

```html
<badgetrip-catalog actor="u1"></badgetrip-catalog>
<badgetrip-badge actor="u1" code="first_win"></badgetrip-badge>
```

Elements re-render after every emit/replay/seed/refresh on `observed.engine`, when `actor` or `code` changes, and when `prefers-reduced-motion` flips. They unsubscribe when removed. A failed query (e.g. an unknown `code`) dispatches a bubbling `badgetrip-error` event with the error as `detail`.

`defineBadgetripElements` is safe to import and call on the server (no DOM, it does nothing). Calling it again with the same prefix is a no-op: the first engine stays bound.

## htmx

Render on the server, swap on change. No client-side engine.

```ts
// Hono / Express / any server
app.get('/achievements/:actor', async (c) =>
  c.html(renderCatalog(await engine.catalog(c.req.param('actor')))),
);

app.post('/events/:actor/:type', async (c) => {
  const actor = c.req.param('actor');
  await engine.emit({ id: crypto.randomUUID(), actor, type: c.req.param('type'), ts: Date.now(), payload: {} });
  return c.html(renderCatalog(await engine.catalog(actor)));
});
```

```html
<div id="achievements" hx-get="/achievements/u1" hx-trigger="load"></div>
<button hx-post="/events/u1/win" hx-target="#achievements">Win</button>
```

Authenticate the actor on the server; never trust the one in the URL for anything that matters.

## License

MIT
