import { describe, expect, it } from 'vitest';
import {
  cleanName,
  hasPreset,
  type Preset,
  parsePresets,
  removePreset,
  serializePresets,
  upsertPreset,
} from './presets';

const p = (name: string, mix = '1|80|rain:50'): Preset => ({ name, mix });

describe('cleanName', () => {
  it('前後の空白を落とし、長すぎる名前を切り詰める', () => {
    expect(cleanName('  夜の雨  ')).toBe('夜の雨');
    expect(cleanName('あ'.repeat(60))).toHaveLength(40);
  });
});

describe('upsertPreset', () => {
  it('追加され末尾に積まれる', () => {
    const list = upsertPreset(upsertPreset([], '雨', '1|80|rain:50'), '波', '1|80|waves:60');
    expect(list.map((x) => x.name)).toEqual(['雨', '波']);
  });

  it('同名は上書きして末尾へ移す', () => {
    let list = upsertPreset([], '雨', '1|80|rain:30');
    list = upsertPreset(list, '波', '1|80|waves:60');
    list = upsertPreset(list, '雨', '1|90|rain:70');
    expect(list.map((x) => x.name)).toEqual(['波', '雨']);
    expect(list.find((x) => x.name === '雨')!.mix).toBe('1|90|rain:70');
  });

  it('空名は無視する', () => {
    expect(upsertPreset([], '   ', '1|80|')).toEqual([]);
  });

  it('24件を超えると古いものから落ちる', () => {
    let list: Preset[] = [];
    for (let i = 0; i < 30; i++) list = upsertPreset(list, `p${i}`, '1|80|');
    expect(list).toHaveLength(24);
    expect(list[0]!.name).toBe('p6');
    expect(list.at(-1)!.name).toBe('p29');
  });
});

describe('removePreset / hasPreset', () => {
  it('名前で消せる', () => {
    const list = [p('雨'), p('波')];
    expect(removePreset(list, '雨').map((x) => x.name)).toEqual(['波']);
    expect(hasPreset(list, ' 波 ')).toBe(true);
    expect(hasPreset(list, '風')).toBe(false);
  });
});

describe('parse / serialize', () => {
  it('往復しても保たれる', () => {
    const list = [p('雨', '1|80|rain:50'), p('焚き火', '1|70|fire:60')];
    expect(parsePresets(serializePresets(list))).toEqual(list);
  });

  it('壊れた入力は空の一覧として扱う', () => {
    expect(parsePresets(null)).toEqual([]);
    expect(parsePresets('{')).toEqual([]);
    expect(parsePresets('{"a":1}')).toEqual([]);
    expect(parsePresets('[{"name":"雨"},{"mix":"x"},{"name":"波","mix":"1|80|waves:1"}]')).toEqual([
      p('波', '1|80|waves:1'),
    ]);
  });
});
