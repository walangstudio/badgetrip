# htmx and server-rendered pages

The engine lives on your server. It returns plain HTML fragments, and htmx swaps them into the page. There's no client-side JavaScript to write beyond htmx itself.

```sh
npm install @walangstudio/badgetrip-core @walangstudio/badgetrip-html @walangstudio/badgetrip-assets express
```

This uses the `engine` from [Getting started](getting-started.md). The examples use Express, but anything that can return a string works the same way: Hono, Fastify, Next.js route handlers, or a Deno server.

## The server

```ts
// server.ts
import { renderCatalog } from '@walangstudio/badgetrip-html';
import express from 'express';
import { engine } from './badges';

const app = express();

// Replace with your real session lookup.
const currentUser = (req: express.Request) => String(req.header('x-user') ?? 'ana');

app.get('/badges', async (req, res) => {
  res.send(renderCatalog(await engine.catalog(currentUser(req))));
});

app.post('/habits', async (req, res) => {
  const user = currentUser(req);
  await engine.emit({
    id: crypto.randomUUID(),
    actor: user,
    type: 'habit.done',
    ts: Date.now(),
    payload: {},
  });
  res.send(renderCatalog(await engine.catalog(user)));
});

app.listen(3000);
```

## The page

```html
<!-- Self-host htmx, or copy the tag with its integrity hash from htmx.org/docs -->
<script src="/htmx.min.js"></script>

<button hx-post="/habits" hx-target="#badges">Done for today</button>

<div id="badges" hx-get="/badges" hx-trigger="load"></div>
```

The badges load with the page. Every click posts the event and swaps in the updated grid, with any newly unlocked badge now in color.

## Things to know

- **Never trust the client for the user id.** Work out who's asking from the session on the server, like `currentUser` does above. The header here is only a stand-in.
- **Use a stable event id when you can.** If the event comes from a form, generate the id when you render the form and post it back. That way a double-submit counts once.
- **The output is escaped.** Achievement names and descriptions are HTML-escaped, so you can safely let users write their own.
- **Themes work server-side too.** Pass `theme` to `renderCatalog` for its icons, and put `themeCss(theme)` (from `@walangstudio/badgetrip-assets`) in a `<style>` in the page head for its colors. See [Themes](themes.md).
- **Not using Node on the server?** A Python, PHP or Go backend can call a small Node service that runs the engine and returns these same fragments.
