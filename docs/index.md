---
layout: home

hero:
  name: badgetrip
  text: Achievements for any JavaScript app
  tagline: Points, streaks, tiers, leaderboards and badges. You tell the engine what your users did. It works out the rest, and celebrates the unlocks.
  image:
    src: /trophy.svg
    alt: A trophy, one of the built-in badge icons
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: Try the playground
      link: /playground/
      target: _self
    - theme: alt
      text: GitHub
      link: https://github.com/walangstudio/badgetrip

features:
  - title: Achievements as config
    details: A keyed object with rule builders like rules.count and rules.streak. Tiers expand one entry into bronze, silver and gold. Hidden ones stay secret until earned.
  - title: Celebrations and themes
    details: Toasts in any corner, a modal, or fullscreen with confetti and sound. A theme swaps colors, icons and sounds at once, live.
  - title: Progress you can see
    details: Badges show "3/5" while locked, and optional popups report progress along the way.
  - title: Any framework
    details: React, React Native, Vue, Angular, plain HTML, htmx, Electron and Tauri, all on one zero-dependency core.
  - title: Idempotent and validated
    details: Events carry an id, so a retry counts once. Typos and impossible rules fail at startup, not in production.
  - title: Your database
    details: Four small store interfaces and a conformance suite. Plug in Postgres, SQLite, KV or anything else.
---
