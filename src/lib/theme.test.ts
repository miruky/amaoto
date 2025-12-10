import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  applyTheme,
  isTheme,
  loadTheme,
  nextTheme,
  resolveTheme,
  saveTheme,
  THEME_LABEL,
  THEMES,
} from './theme';

// app.test.ts と同じく、テスト環境のlocalStorageをメモリ実装へ差し替える。
function installStorage(): Storage {
  const mem = new Map<string, string>();
  const fake: Storage = {
    get length() {
      return mem.size;
    },
    clear: () => mem.clear(),
    getItem: (k) => (mem.has(k) ? mem.get(k)! : null),
    key: (i) => [...mem.keys()][i] ?? null,
    removeItem: (k) => void mem.delete(k),
    setItem: (k, v) => void mem.set(k, String(v)),
  };
  (globalThis as { localStorage: Storage }).localStorage = fake;
  return fake;
}

beforeEach(() => {
  installStorage();
});

afterEach(() => {
  localStorage.clear();
});

describe('isTheme', () => {
  it('既知の値だけ受け入れる', () => {
    expect(isTheme('auto')).toBe(true);
    expect(isTheme('light')).toBe(true);
    expect(isTheme('dark')).toBe(true);
    expect(isTheme('sepia')).toBe(false);
    expect(isTheme(null)).toBe(false);
  });
});

describe('nextTheme', () => {
  it('auto → light → dark → auto を巡回する', () => {
    expect(nextTheme('auto')).toBe('light');
    expect(nextTheme('light')).toBe('dark');
    expect(nextTheme('dark')).toBe('auto');
  });

  it('全テーマを3手で一巡する', () => {
    let t = THEMES[0]!;
    const seen = new Set([t]);
    for (let i = 0; i < THEMES.length; i++) {
      t = nextTheme(t);
      seen.add(t);
    }
    expect(seen.size).toBe(THEMES.length);
  });
});

describe('保存と読み込み', () => {
  it('明示テーマは保存され読み戻せる', () => {
    saveTheme('dark');
    expect(loadTheme()).toBe('dark');
    expect(localStorage.getItem('amaoto:theme')).toBe('dark');
  });

  it('auto はキーを残さない(既定に戻す)', () => {
    saveTheme('light');
    saveTheme('auto');
    expect(localStorage.getItem('amaoto:theme')).toBeNull();
    expect(loadTheme()).toBe('auto');
  });

  it('壊れた保存値は auto として読む', () => {
    localStorage.setItem('amaoto:theme', 'bogus');
    expect(loadTheme()).toBe('auto');
  });
});

describe('resolveTheme', () => {
  it('明示テーマはそのまま', () => {
    expect(resolveTheme('light')).toBe('light');
    expect(resolveTheme('dark')).toBe('dark');
  });

  it('auto は matchMedia 不在なら light に倒す', () => {
    expect(resolveTheme('auto')).toBe('light');
  });
});

describe('applyTheme', () => {
  it('明示テーマは data-theme を立て、auto は外す', () => {
    const root = { setAttribute: () => {}, removeAttribute: () => {} } as unknown as HTMLElement;
    const calls: string[] = [];
    root.setAttribute = (_n: string, v: string) => calls.push(`set:${v}`);
    root.removeAttribute = () => calls.push('remove');
    applyTheme('dark', root);
    applyTheme('auto', root);
    expect(calls).toEqual(['set:dark', 'remove']);
  });
});

describe('THEME_LABEL', () => {
  it('全テーマに日本語ラベルがある', () => {
    for (const t of THEMES) expect(THEME_LABEL[t]).toBeTruthy();
  });
});
