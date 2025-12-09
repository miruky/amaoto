import { describe, expect, it } from 'vitest';
import { decodeMix, encodeMix } from './share';
import { activeCount, defaultMix, normalizeMix, SCENES, silenceAll } from './mix';

describe('encode と decode の往復', () => {
  it('既定のミックスを復元できる', () => {
    const mix = defaultMix();
    expect(decodeMix(encodeMix(mix))).toEqual(mix);
  });

  it('全シーンが往復する', () => {
    for (const scene of SCENES) {
      expect(decodeMix(encodeMix(scene.mix))).toEqual(scene.mix);
    }
  });

  it('全消音(レイヤなし)も妥当。鳴っていない音の音量は持ち越さない', () => {
    const quiet = silenceAll(defaultMix());
    const restored = decodeMix(encodeMix(quiet))!;
    expect(activeCount(restored)).toBe(0);
    expect(restored.master).toBe(quiet.master);
  });
});

describe('decodeMix の頑健さ', () => {
  it('先頭の # や m= を許す', () => {
    const encoded = encodeMix(defaultMix());
    expect(decodeMix(`#m=${encoded}`)).toEqual(defaultMix());
  });

  it('欠けたレイヤは既定で補われる', () => {
    const mix = decodeMix('1|80|rain:50');
    expect(mix).toEqual(normalizeMix({ master: 0.8, layers: { rain: { on: true, volume: 0.5 } } }));
  });

  it('形式や範囲が不正なら null', () => {
    expect(decodeMix('')).toBeNull();
    expect(decodeMix('1|80')).toBeNull();
    expect(decodeMix('2|80|rain:50')).toBeNull();
    expect(decodeMix('1|150|rain:50')).toBeNull();
    expect(decodeMix('1|80|rain:200')).toBeNull();
    expect(decodeMix('1|80|bogus:50')).toBeNull();
  });
});
