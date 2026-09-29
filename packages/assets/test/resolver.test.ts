import {
  createIconResolver,
  displayIcon,
  svgToDataUrl,
  svgs,
  tierColors,
} from '@walangstudio/badgetrip-assets';
import { describe, expect, it } from 'vitest';

const decode = (src: string) => decodeURIComponent(src.replace('data:image/svg+xml,', ''));

describe('built-in pack', () => {
  it('every icon is a well-formed currentColor SVG', () => {
    for (const [name, markup] of Object.entries(svgs)) {
      expect(markup, name).toMatch(
        /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="0 0 24 24"/,
      );
      expect(markup, name).toMatch(/<\/svg>$/);
      expect(markup, name).toContain('currentColor');
    }
  });

  it('the animated sparkle ships a still frame', () => {
    const a = createIconResolver().resolve({
      code: 'x',
      icon: 'sparkle-animated',
    });
    expect(a.animated).toBe(true);
    expect(a.still).toBe(svgToDataUrl(svgs.sparkle));
  });
});

describe('createIconResolver', () => {
  it('resolves the icon key, then category, then the fallback', () => {
    const r = createIconResolver({ categories: { social: 'chat' } });
    expect(decode(r.resolve({ code: 'a', icon: 'flame' }).src)).toContain('M12 22c4 0');
    expect(r.resolve({ code: 'b', category: 'social' }).svg).toBe(svgs.chat);
    expect(r.resolve({ code: 'c' }).svg).toBe(svgs.trophy);
  });

  it('a per-code override beats a series override, which beats the icon key', () => {
    const r = createIconResolver({
      overrides: {
        'fan.gold': { src: '/gold.gif', animated: true },
        fan: 'heart',
      },
    });
    const series = (tier: string) => ({
      code: `fan.${tier}`,
      icon: 'star',
      series: { code: 'fan', tier },
    });
    expect(r.resolve(series('gold'))).toEqual({
      src: '/gold.gif',
      animated: true,
    });
    expect(r.resolve(series('bronze')).svg).toBe(svgs.heart);
  });

  it('custom registry entries replace built-ins and can alias other keys', () => {
    const r = createIconResolver({
      icons: { trophy: { src: '/t.png' }, lava: 'flame' },
    });
    expect(r.resolve({ code: 'a' })).toEqual({ src: '/t.png' });
    expect(r.resolve({ code: 'b', icon: 'lava' }).svg).toBe(svgs.flame);
  });

  it('falls through an unknown key instead of failing', () => {
    const r = createIconResolver();
    expect(r.resolve({ code: 'a', icon: 'no-such-icon' }).svg).toBe(svgs.trophy);
  });

  it('survives alias cycles', () => {
    const r = createIconResolver({ icons: { a: 'b', b: 'a' } });
    expect(r.resolve({ code: 'x', icon: 'a' }).svg).toBe(svgs.trophy);
  });

  it('tints tintable icons by tier and leaves image assets alone', () => {
    const r = createIconResolver({
      overrides: { 'x.silver': { src: '/s.png' } },
    });
    const gold = r.resolve({
      code: 'x.gold',
      icon: 'medal',
      series: { code: 'x', tier: 'gold' },
    });
    expect(decode(gold.src)).toContain(`stroke="${tierColors.gold}"`);
    const silver = r.resolve({
      code: 'x.silver',
      series: { code: 'x', tier: 'silver' },
    });
    expect(silver).toEqual({ src: '/s.png' });
    const plain = createIconResolver({ tierColors: false }).resolve({
      code: 'x.gold',
      icon: 'medal',
      series: { code: 'x', tier: 'gold' },
    });
    expect(decode(plain.src)).not.toContain(tierColors.gold);
  });

  it('a concealed achievement always shows the hidden icon, ignoring overrides', () => {
    const r = createIconResolver({
      overrides: { secret: { src: '/spoiler.png' } },
    });
    expect(r.resolve({ code: 'secret', icon: 'moon', concealed: true }).svg).toBe(svgs.hidden);
  });

  it('missing() lists unresolvable keys so typos surface at startup', () => {
    const r = createIconResolver({
      categories: { social: 'chatt' },
      overrides: { a: 'nope' },
    });
    expect(
      r
        .missing([
          { code: 'a', icon: 'trophy' },
          { code: 'b', icon: 'trophhy' },
          { code: 'c', category: 'social' },
        ])
        .sort(),
    ).toEqual(['chatt', 'nope', 'trophhy']);
  });
});

describe('resolver review fixes', () => {
  it('prototype keys fall through instead of resolving to Object members', () => {
    const r = createIconResolver();
    expect(r.resolve({ code: 'a', icon: 'constructor' }).svg).toBe(svgs.trophy);
    expect(r.missing([{ code: 'a', icon: 'toString' }])).toEqual(['toString']);
  });

  it('missing() reports a misspelled fallback', () => {
    expect(createIconResolver({ fallback: 'trohpy' }).missing([])).toEqual(['trohpy']);
  });

  it('tints the still frame of an animated icon too', () => {
    const a = createIconResolver().resolve({
      code: 'x.gold',
      icon: 'sparkle-animated',
      series: { code: 'x', tier: 'gold' },
    });
    expect(decode(a.still as string)).toContain(`stroke="${tierColors.gold}"`);
  });

  it('never tints the hidden icon of a concealed tier', () => {
    const a = createIconResolver().resolve({
      code: 'x.gold',
      concealed: true,
      series: { code: 'x', tier: 'gold' },
    });
    expect(decode(a.src)).not.toContain(tierColors.gold);
  });
});

describe('resolver options', () => {
  const gold = { code: 'x.gold', icon: 'medal', series: { code: 'x', tier: 'gold' } };
  const bronze = { code: 'x.bronze', icon: 'medal', series: { code: 'x', tier: 'bronze' } };

  it('ships 18 built-in icons', () => {
    expect(Object.keys(svgs)).toHaveLength(18);
  });

  it('a partial tierColors map overrides one tier and keeps the other defaults', () => {
    const r = createIconResolver({ tierColors: { bronze: '#111111' } });
    expect(decode(r.resolve(bronze).src)).toContain('stroke="#111111"');
    expect(decode(r.resolve(gold).src)).toContain(`stroke="${tierColors.gold}"`);
  });

  it('paints untiered built-in icons with the color option', () => {
    const src = decode(
      createIconResolver({ color: '#123456' }).resolve({ code: 'a', icon: 'flame' }).src,
    );
    expect(src).toContain('#123456');
    expect(src).not.toContain('currentColor');
  });

  it('uses the fallback key when nothing else matches', () => {
    const r = createIconResolver({ fallback: 'star' });
    expect(r.resolve({ code: 'nothing' })).toEqual(r.resolve({ code: 'y', icon: 'star' }));
    expect(r.resolve({ code: 'nothing' })).not.toEqual(
      createIconResolver().resolve({ code: 'nothing' }),
    );
  });
});

describe('displayIcon', () => {
  const asset = { src: '/a.gif', still: '/a.png', animated: true };

  it('plays only when unlocked and motion is allowed', () => {
    expect(displayIcon(asset, { unlocked: true, reducedMotion: false }).src).toBe('/a.gif');
    expect(displayIcon(asset, { unlocked: false, reducedMotion: false })).toEqual({
      src: '/a.png',
      still: '/a.png',
      animated: false,
    });
    expect(displayIcon(asset, { unlocked: true, reducedMotion: true }).src).toBe('/a.png');
  });

  it('has nothing to freeze to without a still frame', () => {
    const bare = { src: '/a.gif', animated: true };
    expect(displayIcon(bare, { unlocked: false, reducedMotion: true })).toBe(bare);
  });
});
