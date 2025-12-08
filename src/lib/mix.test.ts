import { describe, expect, it } from 'vitest';
import { SOUND_IDS } from './sounds';
import {
  activeCount,
  clamp01,
  defaultMix,
  normalizeMix,
  SCENES,
  setLayerVolume,
  setMaster,
  silenceAll,
  toggleLayer,
} from './mix';

describe('clamp01', () => {
  it('0..1へ丸める', () => {
    expect(clamp01(-0.5)).toBe(0);
    expect(clamp01(1.5)).toBe(1);
    expect(clamp01(0.3)).toBe(0.3);
  });
});

describe('defaultMix', () => {
  it('全音源にレイヤがあり、雨だけ鳴っている', () => {
    const mix = defaultMix();
    expect(Object.keys(mix.layers).sort()).toEqual([...SOUND_IDS].sort());
    expect(mix.layers.rain!.on).toBe(true);
    expect(activeCount(mix)).toBe(1);
  });
});

describe('編集ヘルパは元を壊さない', () => {
  it('toggleLayerで切り替わる', () => {
    const base = defaultMix();
    const next = toggleLayer(base, 'rain');
    expect(next.layers.rain!.on).toBe(false);
    expect(base.layers.rain!.on).toBe(true);
  });

  it('setLayerVolumeは音量を変え、止まっていた音を鳴らす', () => {
    const next = setLayerVolume(defaultMix(), 'fire', 0.4);
    expect(next.layers.fire!.volume).toBe(0.4);
    expect(next.layers.fire!.on).toBe(true);
  });

  it('setMasterは0..1へ丸める', () => {
    expect(setMaster(defaultMix(), 2).master).toBe(1);
  });

  it('silenceAllは全レイヤを止め音量は保つ', () => {
    const mix = setLayerVolume(defaultMix(), 'waves', 0.9);
    const quiet = silenceAll(mix);
    expect(activeCount(quiet)).toBe(0);
    expect(quiet.layers.waves!.volume).toBe(0.9);
  });

  it('未知のidは無視', () => {
    expect(toggleLayer(defaultMix(), 'nope')).toEqual(defaultMix());
  });
});

describe('normalizeMix', () => {
  it('欠けたレイヤを補い、未知のidと範囲外の値を整える', () => {
    const mix = normalizeMix({ master: 5, layers: { rain: { on: true, volume: 9 }, bogus: { on: true } } });
    expect(mix.master).toBe(1);
    expect(mix.layers.rain).toEqual({ on: true, volume: 1 });
    expect(Object.keys(mix.layers).sort()).toEqual([...SOUND_IDS].sort());
    expect('bogus' in mix.layers).toBe(false);
  });
});

describe('SCENES', () => {
  it('idは重複せず、各シーンに鳴る音がある', () => {
    const ids = SCENES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of SCENES) expect(activeCount(s.mix)).toBeGreaterThan(0);
  });

  it('全レイヤが揃っている', () => {
    for (const s of SCENES) {
      expect(Object.keys(s.mix.layers).sort()).toEqual([...SOUND_IDS].sort());
    }
  });
});
