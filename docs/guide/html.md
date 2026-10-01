# Plain HTML and JavaScript

```sh
npm install @walangstudio/badgetrip-core @walangstudio/badgetrip-html
```

No framework needed. `@walangstudio/badgetrip-html` gives you two custom elements that draw themselves and stay up to date. They also work inside Svelte, Solid, Lit, Alpine, or any page that renders HTML.

This uses the `engine` from [Getting started](getting-started.md). You'll need a bundler such as Vite to resolve the npm imports.

## The page

```html
<!doctype html>
<html lang="en">
  <body>
    <button id="log">Done for today</button>

    <!-- every badge for one user -->
    <badgetrip-catalog actor="ana"></badgetrip-catalog>

    <!-- or just one -->
    <badgetrip-badge actor="ana" code="on_a_roll"></badgetrip-badge>

    <script type="module" src="./main.js"></script>
  </body>
</html>
```

## The script

```js
// main.js
import { observe } from '@walangstudio/badgetrip-core';
import { defineBadgetripElements } from '@walangstudio/badgetrip-html';
import { engine } from './badges.js';

defineBadgetripElements(engine);

// Emit through observe(engine) so the elements hear about it.
const live = observe(engine).engine;

document.getElementById('log').addEventListener('click', async () => {
  const { unlocked } = await live.emit({
    id: crypto.randomUUID(),
    actor: 'ana',
    type: 'habit.done',
    ts: Date.now(),
    payload: {},
  });
  if (unlocked.length) alert(`Unlocked: ${unlocked.join(', ')}`);
});
```

The one thing to get right is that last comment. `observe(engine)` always returns the same wrapper for the same engine, and only events sent through that wrapper tell the elements to redraw. Calling `engine.emit` directly still records the event; the page just won't notice until something else changes.

Change the `actor` attribute and the element redraws for the new user. Remove an element and it stops listening. If a query fails, the element fires a `badgetrip-error` event that bubbles up, so one listener on `document` catches them all.

## Drawing it yourself

Prefer to control when things render? Skip the elements and use the string functions:

```js
import { renderCatalog } from '@walangstudio/badgetrip-html';

document.querySelector('#badges').innerHTML = renderCatalog(await engine.catalog('ana'));
```

Everything in the output is escaped, including names and descriptions, and icon URLs using `javascript:` are dropped. So it's safe even when achievement text comes from your users.

## Styling

The badges come with just enough inline style to lay out properly: a flex column, grayscale while locked, and a full-width progress bar. Add a `className` to hang your own CSS on them:

```js
renderCatalog(badges, { className: 'trophy', size: 64 });
```

For the custom elements, target `badgetrip-catalog figure` in your stylesheet. They render into the page's normal DOM (no shadow DOM), so your CSS applies directly.

## Celebrate unlocks

`createNotifier(observed, { actor: 'ana' })` shows each unlock on top of the page: a toast, a modal or fullscreen confetti, with optional sound. Add `secret` to `<badgetrip-catalog>` to leave hidden achievements out and show how many remain. Both are covered in [Unlock celebrations](celebrations.md).

## Themes

A theme sets colors, icons and celebrations in one object. Put its colors on the page, and hand it to the elements (in place of the plain `defineBadgetripElements(engine)` call above) and the notifier:

```js
import { themes } from '@walangstudio/badgetrip-assets';
import { applyTheme, createNotifier, defineBadgetripElements } from '@walangstudio/badgetrip-html';

applyTheme(themes.dark);
const elements = defineBadgetripElements(engine, { theme: themes.dark });
const notifier = createNotifier(engine, { actor: 'ana', theme: themes.dark });

// switch later
const next = themes.arcade;
applyTheme(next);
elements.setTheme(next);
notifier.update({ theme: next });
```

The [themes guide](themes.md) covers making your own.
