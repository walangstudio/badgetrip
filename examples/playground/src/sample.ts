/** Starting configs, one per topic. Plain JSON: rules are data, so each can be edited live. */
const game = {
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
      when: { kind: 'count', eventType: 'level.complete', gte: 1 },
    },
    collector: {
      name: 'Collector ({tier})',
      description: 'Collect {n} items',
      icon: 'star',
      when: { kind: 'count', eventType: 'item.collect' },
      tiers: { bronze: 5, silver: 20, gold: { at: 50, celebration: 'epic' } },
    },
    regular: {
      name: 'Regular',
      description: 'Log in 3 days in a row',
      icon: 'flame',
      celebration: 'modal',
      when: { kind: 'streak', streak: 'daily', gte: 3 },
    },
    boss_slayer: {
      name: 'Boss slayer',
      description: 'Defeat a boss',
      icon: 'crown',
      rarity: 5,
      when: { kind: 'count', eventType: 'boss.defeat', gte: 1 },
    },
    veteran: {
      name: 'Veteran',
      description: 'Earn 1000 xp',
      icon: 'medal',
      when: { kind: 'score', score: 'xp', gte: 1000 },
    },
    explorer: {
      name: 'Explorer',
      description: 'Found the secret room',
      lockedDescription: 'Some doors only open for the curious',
      icon: 'moon',
      hidden: true,
      when: { kind: 'count', eventType: 'secret.found', gte: 1 },
    },
  },
};

export type Sample = { label: string; note: string; sound?: boolean; config: object };

export const samples: Record<string, Sample> = {
  basics: {
    label: 'Basics: a small game',
    note: 'Fire item.collect a few times, or login.daily three times.',
    config: {
      ...game,
      celebrations: {
        default: { position: 'bottom-right' },
        rarity: { '5': 'epic' },
        overrides: {
          collector: { progress: { every: 1 } },
          veteran: { progress: { at: [25, 50, 75] } },
        },
      },
    },
  },
  animations: {
    label: 'Animations',
    note: 'Each achievement moves differently. Use Preview to compare them, or fire level.complete and boss.defeat.',
    config: {
      ...game,
      celebrations: {
        default: {
          position: 'top-right',
          animation: { enter: 'slide', exit: 'fade', duration: 400, easing: 'ease-out' },
        },
        presets: { modal: { animation: { enter: 'scale', exit: 'scale', easing: 'spring' } } },
        rarity: { '5': 'epic' },
        overrides: {
          boss_slayer: { animation: { enter: 'bounce', duration: 900 } },
          collector: { animation: { enter: 'pop', exit: 'slide', easing: 'spring' } },
          explorer: {
            animation: { enter: 'slide-up', distance: 120, easing: 'cubic-bezier(.2,1.4,.4,1)' },
          },
          veteran: { animation: { enter: 'none', exit: 'none' } },
        },
      },
    },
  },
  images: {
    label: 'Your own images',
    note: 'Collector, Regular and Boss slayer use GIFs from samples/. Locked badges show the still PNG.',
    config: {
      ...game,
      theme: {
        icons: {
          icons: {
            star: { src: 'samples/star.gif', still: 'samples/star.png', animated: true },
          },
          overrides: {
            regular: { src: 'samples/flame.gif', still: 'samples/flame.png', animated: true },
            boss_slayer: { src: 'samples/trophy.gif', still: 'samples/trophy.png', animated: true },
          },
        },
      },
    },
  },
  sounds: {
    label: 'Sounds',
    note: 'Sound is on. Every achievement plays a different sound; use Preview to hear each one.',
    sound: true,
    config: {
      ...game,
      celebrations: {
        default: { sound: 'pop' },
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
        rarity: { '5': 'epic' },
        presets: { epic: { sound: 'fanfare' } },
        overrides: {
          first_steps: { sound: 'levelup' },
          collector: { sound: 'coin' },
          regular: { sound: 'sparkle' },
          veteran: { sound: false },
        },
      },
    },
  },
  theme: {
    label: 'Theme and gradients',
    note: 'The theme block is layered on the Theme picker. Switch the picker to see it over arcade or dark.',
    config: {
      ...game,
      theme: {
        style: {
          accent: '#fde68a',
          fg: '#ffffff',
          bg: { colors: ['#f97316', '#db2777'], angle: 135 },
          radius: '14px',
          font: '600 15px/1.4 Georgia, serif',
          iconBg: { colors: ['rgba(255,255,255,.3)', 'rgba(255,255,255,.1)'], to: 'bottom' },
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
        icons: { color: { colors: ['#ffffff', '#fde68a'], to: 'bottom right' } },
        celebrations: {
          rarity: { '5': 'epic' },
          presets: { epic: { confetti: { colors: ['#f97316', '#db2777', '#fde68a'] } } },
        },
      },
    },
  },
  layouts: {
    label: 'Layouts and positions',
    note: 'Toasts in different corners, a modal, a fullscreen boss screen, and one silent unlock. Use Preview to see each.',
    config: {
      ...game,
      achievements: {
        ...game.achievements,
        boss_slayer: { ...game.achievements.boss_slayer, celebration: 'boss' },
      },
      celebrations: {
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
        overrides: {
          first_steps: { position: 'top-left' },
          collector: { position: 'right' },
          regular: { layout: 'modal' },
          veteran: { quiet: true },
        },
      },
    },
  },
};
