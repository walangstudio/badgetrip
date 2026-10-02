import { rules } from '@walangstudio/badgetrip-core';

/**
 * The editor tabs. Each holds one object written like the docs: plain JavaScript, with
 * `rules` in scope. Samples are source text, so their comments show up in the editor.
 */
// What the tabs can use. The define* names pass their object through, so a whole call
// pasted from the docs works; Apply validates the result once.
const same = <T>(x: T) => x;
export const scope = {
  rules,
  defineAchievements: same,
  defineTheme: same,
  createCelebrationResolver: same,
};

export type Sample = { label: string; code: string; note: string; sound?: boolean };
export type Tab = { key: TabKey; label: string; help: string; samples: Sample[] };
export type TabKey = 'achievements' | 'theme' | 'animations' | 'sounds' | 'popups';

const DOCS = 'https://walangstudio.github.io/badgetrip';

const game = `{
  scores: ['xp'],
  points: [
    { on: 'level.complete', score: 'xp', delta: 50 },
    { on: 'boss.defeat', score: 'xp', delta: 500 },
  ],
  streaks: [
    {
      code: 'daily',
      tickEvents: ['login.daily'],
      resetEvents: ['login.missed'],
      scoping: 'per-actor',
    },
  ],
  achievements: {
    first_steps: {
      name: 'First steps',
      description: 'Complete your first level',
      icon: 'sprout',
      when: rules.count('level.complete', 1),
    },
    // One entry, three badges: bronze, silver and gold
    collector: {
      name: 'Collector ({tier})',
      description: 'Collect {n} items',
      icon: 'star',
      when: rules.count('item.collect'),
      tiers: { bronze: 5, silver: 20, gold: { at: 50, celebration: 'epic' } },
    },
    regular: {
      name: 'Regular',
      description: 'Log in 3 days in a row',
      icon: 'flame',
      celebration: 'modal',
      when: rules.streak('daily', 3),
    },
    boss_slayer: {
      name: 'Boss slayer',
      description: 'Defeat a boss',
      icon: 'crown',
      rarity: 5, // 1 to 5; the Popups tab gives rarity 5 the fullscreen 'epic'
      when: rules.count('boss.defeat', 1),
    },
    veteran: {
      name: 'Veteran',
      description: 'Earn 1000 xp',
      icon: 'medal',
      when: rules.score('xp', 1000),
    },
    // Shows as "Hidden achievement" until it unlocks
    explorer: {
      name: 'Explorer',
      description: 'Found the secret room',
      lockedDescription: 'Some doors only open for the curious',
      icon: 'moon',
      hidden: true,
      when: rules.count('secret.found', 1),
    },
  },
}`;

const habits = `{
  // The engine from the Getting started guide
  scores: ['xp'],
  points: [{ on: 'habit.done', score: 'xp', delta: 10 }],
  streaks: [
    {
      code: 'daily',
      tickEvents: ['day.completed'],
      resetEvents: ['day.missed'],
      scoping: 'per-actor',
    },
  ],
  achievements: {
    first_step: {
      name: 'First step',
      description: 'Log your first habit',
      icon: 'sprout',
      points: 5,
      when: rules.count('habit.done', 1),
    },
    regular: {
      name: 'Regular ({tier})',
      description: 'Log {n} habits',
      icon: 'medal',
      when: rules.count('habit.done'),
      tiers: { bronze: 10, silver: 50, gold: 200 },
    },
    on_a_roll: {
      name: 'On a roll',
      description: 'Keep a 7-day streak',
      icon: 'flame',
      points: 20,
      when: rules.streak('daily', 7),
    },
    centurion: {
      name: 'Centurion',
      description: 'Log 100 habits',
      icon: 'trophy',
      rarity: 5,
      when: rules.count('habit.done', 100),
    },
  },
}`;

export const tabs: Tab[] = [
  {
    key: 'achievements',
    label: 'Achievements',
    help: `
      <p>What <code>createEngine</code> takes: <code>scores</code>, <code>points</code>, <code>streaks</code> and <code>achievements</code> (also <code>tiers</code>, <code>leaderboards</code>, <code>escalators</code>). Each event type a rule uses gets a button on the right.</p>
      <table>
        <tbody>
          <tr><td><code>rules.count('item.collect', 5)</code></td><td>5 events of a type</td></tr>
          <tr><td><code>rules.score('xp', 1000)</code></td><td>a score total</td></tr>
          <tr><td><code>rules.streak('daily', 3)</code></td><td>a streak length</td></tr>
          <tr><td><code>rules.unique('song.play', 'payload.song', 10)</code></td><td>10 different values</td></tr>
          <tr><td><code>rules.all(a, b)</code>, <code>rules.any(a, b)</code></td><td>combine rules</td></tr>
        </tbody>
      </table>
      <p>An achievement takes <code>name</code>, <code>description</code>, <code>when</code>, and optionally <code>icon</code>, <code>points</code>, <code>rarity</code> (1-5), <code>hidden</code>, <code>lockedDescription</code>, <code>category</code>, <code>celebration</code> (a preset name) and <code>tiers</code>.</p>
      <p>Icons: <code>trophy</code>, <code>star</code>, <code>medal</code>, <code>crown</code>, <code>flame</code>, <code>bolt</code>, <code>heart</code>, <code>check</code>, <code>target</code>, <code>clock</code>, <code>moon</code>, <code>sprout</code>, <code>chat</code>, <code>shield</code>, <code>lock</code>, <code>sparkle</code>, <code>sparkle-animated</code>.</p>
      <p><a href="${DOCS}/guide/getting-started">Getting started</a> · <a href="${DOCS}/RULES">All rules</a></p>`,
    samples: [
      {
        label: 'A small game',
        code: game,
        note: 'Fire item.collect a few times, or login.daily three times.',
      },
      {
        label: 'Habit tracker',
        code: habits,
        note: 'The Getting started engine. Fire habit.done, or day.completed seven times.',
      },
    ],
  },
  {
    key: 'theme',
    label: 'Theme',
    help: `
      <p>What <code>defineTheme</code> takes, layered on the Theme picker on the right. <code>name</code> is optional here.</p>
      <p><code>style</code>: <code>accent</code>, <code>fg</code>, <code>bg</code>, <code>radius</code>, <code>font</code>, <code>backdrop</code>, <code>fullscreenBg</code>, <code>iconBg</code>, <code>locked: { filter, opacity }</code>. Backgrounds take a color or a gradient: <code>{ colors: ['#f97316', '#db2777'], angle: 135 }</code>, <code>to: 'bottom right'</code>, or <code>type: 'radial'</code>.</p>
      <p><code>icons</code>: <code>color</code> and <code>tierColors</code> (colors or gradients), <code>icons</code> to replace an icon everywhere, <code>overrides</code> for one achievement. An image is <code>{ src: 'samples/star.gif', still: 'samples/star.png', animated: true }</code>; the playground has <code>star</code>, <code>trophy</code> and <code>flame</code> in <code>samples/</code>.</p>
      <p><a href="${DOCS}/guide/themes">Themes guide</a></p>`,
    samples: [
      {
        label: 'Start here',
        code: `{
  // Colors, fonts and icons. Remove the // in front of a line to try it,
  // or pick another sample from the menu above.
  style: {
    // accent: '#e11d48',
    // bg: { colors: ['#4c1d95', '#db2777'], angle: 135 },
    // radius: '16px',
  },
}`,
        note: 'Uncomment a line and press Apply, or load another theme sample.',
      },
      {
        label: 'Sunset gradients',
        code: `{
  style: {
    accent: '#fde68a',
    fg: '#ffffff',
    bg: { colors: ['#f97316', '#db2777'], angle: 135 },
    radius: '14px',
    font: '600 15px/1.4 Georgia, serif',
    iconBg: {
      colors: ['rgba(255,255,255,.3)', 'rgba(255,255,255,.1)'],
      to: 'bottom',
    },
    fullscreenBg: {
      type: 'radial',
      position: 'top',
      colors: [
        { color: '#fb923c', at: 0 },
        { color: '#9d174d', at: 60 },
        { color: '#1c1917', at: 100 },
      ],
    },
  },
  // The icons themselves get a gradient too
  icons: { color: { colors: ['#ffffff', '#fde68a'], to: 'bottom right' } },
  celebrations: {
    presets: {
      epic: { confetti: { colors: ['#f97316', '#db2777', '#fde68a'] } },
    },
  },
}`,
        note: 'Preview Boss slayer for the fullscreen gradient. Switch the Theme picker to see it over arcade or dark.',
      },
      {
        label: 'Neon',
        code: `{
  extends: 'dark',
  style: {
    accent: '#ff2bd6',
    bg: '#14002b',
    fg: '#ffffff',
    radius: '2px',
    font: '600 14px/1.4 ui-monospace, Consolas, monospace',
  },
  icons: {
    color: '#00f0ff',
    tierColors: { bronze: '#ff9f43', silver: '#c8d6e5', gold: '#feca57' },
  },
}`,
        note: 'A dark theme from scratch: extends dark, then changes colors, corners, font and icon colors.',
      },
      {
        label: 'GIF badges (files)',
        code: `{
  icons: {
    // Replace one icon key everywhere: every 'star' badge becomes this GIF
    icons: {
      star: {
        src: 'samples/star.gif',
        still: 'samples/star.png',
        animated: true,
      },
    },
    // Or give single achievements their own image
    overrides: {
      regular: {
        src: 'samples/flame.gif',
        still: 'samples/flame.png',
        animated: true,
      },
      boss_slayer: {
        src: 'samples/trophy.gif',
        still: 'samples/trophy.png',
        animated: true,
      },
    },
  },
}`,
        note: 'Preview Regular or Boss slayer to see their GIF move. Locked badges show the still PNG until they unlock.',
      },
      {
        label: 'Images from a URL',
        code: `{
  icons: {
    // Any image URL works: https, a path on your site, or a bundler import.
    overrides: {
      first_steps: { src: 'https://walangstudio.github.io/badgetrip/trophy.svg' },
      boss_slayer: {
        src: 'https://walangstudio.github.io/badgetrip/playground/samples/animated/crown.gif',
        still: 'https://walangstudio.github.io/badgetrip/playground/samples/animated/crown.png',
        animated: true,
      },
    },
  },
}`,
        note: 'First steps and Boss slayer load their images from walangstudio.github.io. Preview them.',
      },
    ],
  },
  {
    key: 'animations',
    label: 'Animations',
    help: `
      <p>How popups move in and out. Put <code>animation</code> on <code>default</code>, a preset in <code>presets</code>, a <code>rarity</code>, a <code>categories</code> entry, or one achievement in <code>overrides</code>.</p>
      <p><code>enter</code> and <code>exit</code>: <code>fade</code>, <code>slide</code>, <code>slide-up</code>, <code>slide-down</code>, <code>slide-left</code>, <code>slide-right</code>, <code>scale</code>, <code>pop</code>, <code>bounce</code>, <code>none</code>.<br>
      <code>duration</code>: 0-2000 ms (the exit takes 70%). <code>easing</code>: <code>ease</code>, <code>ease-in</code>, <code>ease-out</code>, <code>ease-in-out</code>, <code>linear</code>, <code>spring</code> or <code>'cubic-bezier(.2, 1.4, .4, 1)'</code>. <code>distance</code>: 0-200 px for slides.</p>
      <p>The Entrance and Exit pickers on the right set the default motion; presets and overrides in this tab still win.</p>
      <p><a href="${DOCS}/guide/animations">Animations guide</a></p>`,
    samples: [
      {
        label: 'Start here',
        code: `{
  // Remove the // to try it, or pick another sample from the menu above.
  default: {
    // animation: { enter: 'bounce', exit: 'fade', duration: 400 },
  },
}`,
        note: 'Uncomment the animation line and press Apply, or load another animation sample.',
      },
      {
        label: 'One per achievement',
        code: `{
  default: {
    animation: {
      enter: 'slide',
      exit: 'fade',
      duration: 400,
      easing: 'ease-out',
    },
  },
  presets: {
    modal: { animation: { enter: 'scale', exit: 'scale', easing: 'spring' } },
  },
  overrides: {
    boss_slayer: { animation: { enter: 'bounce', duration: 900 } },
    collector: {
      animation: { enter: 'pop', exit: 'slide', easing: 'spring' },
    },
    explorer: {
      animation: {
        enter: 'slide-up',
        distance: 120,
        easing: 'cubic-bezier(.2, 1.4, .4, 1)',
      },
    },
    veteran: { animation: { enter: 'none', exit: 'none' } },
  },
}`,
        note: 'Each achievement moves differently. Use Preview to compare them.',
      },
      {
        label: 'Calm fades',
        code: `{
  default: {
    animation: { enter: 'fade', exit: 'fade', duration: 300, easing: 'ease' },
  },
  // epic is the fullscreen preset the Popups tab gives rarity 5
  presets: {
    epic: {
      animation: { enter: 'scale', exit: 'fade', duration: 600, easing: 'ease-out' },
    },
  },
}`,
        note: 'Everything fades; the fullscreen epic popup scales in slowly. Preview Boss slayer.',
      },
      {
        label: 'Lively bounces',
        code: `{
  default: { animation: { enter: 'bounce', exit: 'slide', duration: 450 } },
  presets: {
    epic: { animation: { enter: 'pop', duration: 700, easing: 'spring' } },
  },
}`,
        note: 'Toasts bounce in and slide back out; epic unlocks pop.',
      },
    ],
  },
  {
    key: 'sounds',
    label: 'Sounds',
    help: `
      <p>Tick <b>Sound</b> on the right to hear them. Set <code>sound</code> on <code>default</code>, a preset, a rarity, a category or one achievement in <code>overrides</code>: a sound name, or <code>false</code> for silence.</p>
      <p>Built-in names: <code>chime</code> (the default), <code>fanfare</code>, <code>sparkle</code>, <code>pop</code>. Add your own under <code>sounds</code>: a file URL (any format the browser plays: MP3, WAV, OGG), or notes, <code>{ tones: [{ freq: 880, at: 0, dur: 0.3 }] }</code> (<code>at</code> and <code>dur</code> in seconds, optional <code>wave</code> and <code>gain</code>). Reusing a built-in name replaces it everywhere.</p>
      <p><a href="${DOCS}/guide/celebrations#sound">Sound in the celebrations guide</a></p>`,
    samples: [
      {
        label: 'Start here',
        code: `{
  // Tick Sound on the right first. Remove the // to try it.
  default: {
    // sound: 'sparkle',
  },
}`,
        note: 'Every unlock plays chime. Uncomment the line, tick Sound, and press Apply.',
      },
      {
        label: 'A mix of sounds',
        sound: true,
        code: `{
  default: { sound: 'pop' },
  // Your own sounds, written as notes
  sounds: {
    coin: {
      tones: [
        { freq: 988, at: 0, dur: 0.08, wave: 'square', gain: 0.2 },
        { freq: 1319, at: 0.08, dur: 0.3, wave: 'square', gain: 0.2 },
      ],
    },
    levelup: {
      tones: [
        { freq: 523, at: 0, dur: 0.12, wave: 'triangle' },
        { freq: 659, at: 0.12, dur: 0.12, wave: 'triangle' },
        { freq: 784, at: 0.24, dur: 0.12, wave: 'triangle' },
        { freq: 1047, at: 0.36, dur: 0.4, wave: 'triangle' },
      ],
    },
  },
  presets: { epic: { sound: 'fanfare' } },
  overrides: {
    first_steps: { sound: 'levelup' },
    collector: { sound: 'coin' },
    regular: { sound: 'sparkle' },
    veteran: { sound: false },
  },
}`,
        note: 'Sound is on. Every achievement plays something different; Preview each one.',
      },
      {
        label: 'Quiet except big ones',
        sound: true,
        code: `{
  default: { sound: false },
  // epic is the fullscreen preset the Popups tab gives rarity 5
  presets: { epic: { sound: 'fanfare' } },
}`,
        note: 'Sound is on, but only the fullscreen epic popup makes a sound. Preview Boss slayer.',
      },
      {
        label: 'Sound files (MP3, WAV)',
        sound: true,
        code: `{
  // Files in the playground's samples/sounds folder, drawn for badgetrip
  sounds: {
    coin: 'samples/sounds/coin.wav',
    powerup: 'samples/sounds/powerup.wav',
    levelup: 'samples/sounds/levelup.mp3',
    victory: 'samples/sounds/victory.mp3', // a short tune
  },
  default: { sound: 'coin' },
  presets: { epic: { sound: 'victory' }, modal: { sound: 'levelup' } },
  overrides: { first_steps: { sound: 'powerup' } },
}`,
        note: 'Sound is on. Preview First steps, Regular and Boss slayer to hear the WAV and MP3 files.',
      },
      {
        label: 'Sounds from a URL',
        sound: true,
        code: `{
  sounds: {
    // Any audio URL works. Reusing a built-in name (chime, fanfare,
    // sparkle, pop) replaces that sound everywhere.
    chime: 'https://walangstudio.github.io/badgetrip/playground/samples/sounds/coin.wav',
    fanfare: 'https://walangstudio.github.io/badgetrip/playground/samples/sounds/victory.mp3',
  },
}`,
        note: 'Sound is on. The default chime and the epic fanfare now load from walangstudio.github.io.',
      },
    ],
  },
  {
    key: 'popups',
    label: 'Popups',
    help: `
      <p>What <code>createCelebrationResolver</code> takes. Set fields on <code>default</code>, define <code>presets</code>, and map <code>rarity</code> (1-5), <code>categories</code> or single achievements (<code>overrides</code>) to settings or a preset name.</p>
      <p><code>layout</code>: <code>toast</code>, <code>modal</code>, <code>fullscreen</code>. <code>position</code> (toasts): <code>top-left</code>, <code>top</code>, <code>top-right</code>, <code>right</code>, <code>bottom-right</code>, <code>bottom</code>, <code>bottom-left</code>, <code>left</code>. <code>duration</code>: ms, <code>0</code> stays until closed. <code>confetti</code>: <code>true</code> or <code>{ particles, colors, duration }</code>. Also <code>title</code>, <code>quiet</code>, and <code>progress: { every: 1 }</code> or <code>{ at: [25, 50, 75] }</code>.</p>
      <p>Built-in presets: <code>toast</code>, <code>modal</code>, <code>epic</code>, <code>quiet</code>, <code>secret</code>.</p>
      <p><a href="${DOCS}/guide/celebrations">Celebrations guide</a></p>`,
    samples: [
      {
        label: 'Game defaults',
        code: `{
  default: { position: 'bottom-right' },
  // Rarity 5 gets the built-in fullscreen preset with confetti
  rarity: { 5: 'epic' },
  overrides: {
    // A progress popup on every item, and at 25/50/75% for Veteran
    collector: { progress: { every: 1 } },
    veteran: { progress: { at: [25, 50, 75] } },
  },
}`,
        note: 'Toasts bottom-right, fullscreen for rarity 5, progress popups for Collector and Veteran.',
      },
      {
        label: 'Corners and a boss screen',
        code: `{
  default: { position: 'bottom', duration: 4000 },
  presets: {
    boss: {
      layout: 'fullscreen',
      confetti: { particles: 300 },
      duration: 0,
      title: 'Boss down!',
      sound: 'fanfare',
    },
  },
  rarity: { 5: 'boss' },
  overrides: {
    first_steps: { position: 'top-left' },
    collector: { position: 'right' },
    regular: { layout: 'modal' },
    veteran: { quiet: true },
  },
}`,
        note: 'Toasts in different places, a modal, a custom fullscreen preset, and a silent unlock. Preview each.',
      },
      {
        label: 'Every unlock a modal',
        code: `{
  default: { layout: 'modal', duration: 0, confetti: true },
}`,
        note: 'Every unlock opens a modal with confetti that stays until closed.',
      },
    ],
  },
];
