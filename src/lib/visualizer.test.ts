import { describe, expect, it } from 'vitest';
import { createWaveform } from './visualizer';

// setAttribute だけ持つ最小のパス要素を用意し、描かれたdを覗く。
function fakePath(): { d: string; el: SVGPathElement } {
  const store = { d: '' };
  const el = {
    setAttribute: (name: string, value: string) => {
      if (name === 'd') store.d = value;
    },
  } as unknown as SVGPathElement;
  return Object.assign(store, { el });
}

function silentWave(): Uint8Array {
  return new Uint8Array(64).fill(128); // 128 = 無音の中心
}

describe('createWaveform', () => {
  it('start で各ラインに有効なSVGパスを描く', () => {
    const line = fakePath();
    const echo = fakePath();
    const wave = createWaveform({
      paths: [line.el, echo.el],
      read: () => silentWave(),
      active: () => false,
    });
    wave.start();
    expect(line.d.startsWith('M ')).toBe(true);
    expect(echo.d.length).toBeGreaterThan(0);
  });

  it('読み取りが null でも待機波を描いて落ちない', () => {
    const line = fakePath();
    const wave = createWaveform({ paths: [line.el], read: () => null, active: () => false });
    expect(() => {
      wave.start();
      wave.stop();
    }).not.toThrow();
    expect(line.d).toContain('M ');
  });

  it('鳴っている波は無音の中心線と異なる起伏になる', () => {
    const flat = fakePath();
    const loud = fakePath();
    createWaveform({ paths: [flat.el], read: () => silentWave(), active: () => false }).start();
    const noisy = new Uint8Array(64);
    for (let i = 0; i < noisy.length; i++) noisy[i] = i % 2 === 0 ? 30 : 226;
    createWaveform({ paths: [loud.el], read: () => noisy, active: () => false }).start();
    expect(loud.d).not.toEqual(flat.d);
  });
});
