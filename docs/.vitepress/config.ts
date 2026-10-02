import { posix } from 'node:path';
import { defineConfig } from 'vitepress';

const repo = 'https://github.com/walangstudio/badgetrip';

export default defineConfig({
  title: 'badgetrip',
  description:
    'Points, streaks, tiers, leaderboards and achievements for any JavaScript app, with unlock celebrations.',
  base: '/badgetrip/',
  cleanUrls: true,
  lastUpdated: true,
  // Local notes live next to the docs but are not part of the site.
  srcExclude: ['PLAN.md', 'FINDINGS-todont.md', 'specs/**'],
  head: [['link', { rel: 'icon', type: 'image/svg+xml', href: '/badgetrip/trophy.svg' }]],
  markdown: {
    config(md) {
      // Docs link to the repo with relative paths so they work on GitHub. On the site, anything
      // outside docs/ goes to GitHub, and the playground goes to the hosted one.
      md.core.ruler.push('repo-links', (state) => {
        const page = posix.dirname(state.env.relativePath ?? '');
        for (const block of state.tokens) {
          for (const token of block.children ?? []) {
            const href = token.type === 'link_open' ? token.attrGet('href') : null;
            if (!href || /^([a-z]+:|#|\/)/i.test(href)) continue;
            const target = posix.normalize(posix.join('docs', page, href));
            if (target.startsWith('docs/')) continue;
            if (target.replace(/[?#].*$/, '').replace(/\/$/, '') === 'examples/playground') {
              token.attrSet('href', '/playground/');
              token.attrSet('target', '_self');
            } else {
              token.attrSet('href', `${repo}/tree/main/${target}`);
            }
          }
        }
      });
    },
  },
  themeConfig: {
    logo: '/trophy.svg',
    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'Reference', link: '/ACHIEVEMENTS' },
      { text: 'Playground', link: '/playground/', target: '_self' },
      { text: 'Changelog', link: `${repo}/blob/main/CHANGELOG.md` },
    ],
    sidebar: [
      {
        text: 'Guide',
        items: [
          { text: 'Getting started', link: '/guide/getting-started' },
          { text: 'Unlock celebrations', link: '/guide/celebrations' },
          { text: 'Themes', link: '/guide/themes' },
          { text: 'Animations', link: '/guide/animations' },
        ],
      },
      {
        text: 'Frameworks',
        items: [
          { text: 'React', link: '/guide/react' },
          { text: 'React Native and Expo', link: '/guide/react-native' },
          { text: 'Vue', link: '/guide/vue' },
          { text: 'Angular', link: '/guide/angular' },
          { text: 'Plain HTML', link: '/guide/html' },
          { text: 'htmx', link: '/guide/htmx' },
          { text: 'Electron', link: '/guide/electron' },
          { text: 'Tauri', link: '/guide/tauri' },
        ],
      },
      {
        text: 'Reference',
        items: [
          { text: 'Achievements', link: '/ACHIEVEMENTS' },
          { text: 'Rules', link: '/RULES' },
          { text: 'Writing a store', link: '/ADAPTERS' },
          { text: 'Architecture', link: '/ARCHITECTURE' },
          { text: 'Platform support', link: '/CROSS_PLATFORM' },
          { text: 'ADR-0001: persistence', link: '/adr/0001-store-agnostic-persistence' },
        ],
      },
    ],
    socialLinks: [{ icon: 'github', link: repo }],
    editLink: { pattern: `${repo}/edit/main/docs/:path` },
    search: { provider: 'local' },
    footer: { message: 'MIT licensed', copyright: 'walang studio' },
  },
});
