import { describe, expect, it } from 'vitest';
import { brownNoise, makePRNG, noiseOf, pinkNoise, whiteNoise } from './noise';

function meanAbsDiff(buf: Float32Array): number {
  let sum = 0;
  for (let i = 1; i < buf.length; i++) sum += Math.abs(buf[i]! - buf[i - 1]!);
  return sum / (buf.length - 1);
}

function inRange(buf: Float32Array): boolean {
  for (const v of buf) if (v < -1 || v > 1) return false;
  return true;
}

describe('makePRNG', () => {
  it('同じseedは同じ列、違うseedは違う列', () => {
    const a = makePRNG(42);
    const b = makePRNG(42);
    const c = makePRNG(43);
    expect(a()).toBe(b());
    expect(makePRNG(42)()).not.toBe(c());
  });

  it('0..1の範囲を返す', () => {
    const rng = makePRNG(7);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('各ノイズの基本性質', () => {
  it('長さが指定どおりで[-1,1]に収まる', () => {
    for (const color of ['white', 'pink', 'brown'] as const) {
      const buf = noiseOf(color, 2048, makePRNG(1));
      expect(buf).toHaveLength(2048);
      expect(inRange(buf)).toBe(true);
    }
  });

  it('seedが同じなら決定的', () => {
    expect(whiteNoise(64, makePRNG(9))).toEqual(whiteNoise(64, makePRNG(9)));
    expect(brownNoise(64, makePRNG(9))).toEqual(brownNoise(64, makePRNG(9)));
  });
});

describe('色による質感の違い', () => {
  it('ブラウンは白色より隣接サンプルの差が小さい(低域寄り)', () => {
    const white = whiteNoise(8192, makePRNG(3));
    const brown = brownNoise(8192, makePRNG(3));
    expect(meanAbsDiff(brown)).toBeLessThan(meanAbsDiff(white));
  });

  it('ピンクは白色とブラウンの中間の滑らかさ', () => {
    const white = meanAbsDiff(whiteNoise(8192, makePRNG(5)));
    const pink = meanAbsDiff(pinkNoise(8192, makePRNG(5)));
    const brown = meanAbsDiff(brownNoise(8192, makePRNG(5)));
    expect(pink).toBeLessThan(white);
    expect(pink).toBeGreaterThan(brown);
  });
});
