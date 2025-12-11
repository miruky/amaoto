import { describe, expect, it } from 'vitest';
import { SOUNDS, SOUND_IDS, getSound } from './sounds';

describe('音のパレット', () => {
  it('idは一意で、SOUND_IDSと並びが一致する', () => {
    const ids = SOUNDS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...SOUND_IDS]).toEqual(ids);
  });

  it('各音のパラメータは妥当な範囲にある', () => {
    for (const s of SOUNDS) {
      expect(s.name, s.id).not.toBe('');
      expect(s.icon, s.id).not.toBe('');
      expect(['white', 'pink', 'brown'], s.id).toContain(s.color);
      expect(['lowpass', 'highpass', 'bandpass'], s.id).toContain(s.filter.kind);
      expect(s.filter.freq, s.id).toBeGreaterThan(0);
      expect(s.filter.freq, s.id).toBeLessThanOrEqual(20000);
      expect(s.filter.q, s.id).toBeGreaterThan(0);
      expect(s.gain, s.id).toBeGreaterThan(0);
      expect(s.gain, s.id).toBeLessThanOrEqual(1);
      if (s.lfo) {
        expect(s.lfo.rate, s.id).toBeGreaterThan(0);
        expect(s.lfo.depth, s.id).toBeGreaterThan(0);
        expect(['filterFreq', 'gain'], s.id).toContain(s.lfo.target);
      }
      if (s.crackle) {
        expect(s.crackle.rate, s.id).toBeGreaterThan(0);
        expect(s.crackle.decay, s.id).toBeGreaterThan(0);
      }
    }
  });

  it('getSoundはidで引け、未知のidはundefined', () => {
    expect(getSound('rain')?.name).toBe('雨');
    expect(getSound('waterfall')?.name).toBe('滝');
    expect(getSound('downpour')?.name).toBe('豪雨');
    expect(getSound('missing')).toBeUndefined();
  });
});
