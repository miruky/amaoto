// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mountApp } from './app';
import { SOUNDS } from './lib/sounds';

// Node 25 の実験的localStorageが空のグローバルを差し込むため、メモリ実装へ差し替える。
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

let storage: Storage;

function setup(): HTMLElement {
  const root = document.createElement('div');
  document.body.append(root);
  mountApp(root);
  return root;
}

const card = (root: HTMLElement, id: string): HTMLElement => root.querySelector(`.sound[data-id="${id}"]`)!;

beforeEach(() => {
  storage = installStorage();
  location.hash = '';
});

afterEach(() => {
  document.body.replaceChildren();
});

describe('初期描画', () => {
  it('全音源のカードが並ぶ', () => {
    const root = setup();
    expect(root.querySelectorAll('.sound')).toHaveLength(SOUNDS.length);
  });

  it('既定では雨が鳴っている', () => {
    const root = setup();
    expect(card(root, 'rain').classList.contains('is-on')).toBe(true);
    expect(card(root, 'fire').classList.contains('is-on')).toBe(false);
  });
});

describe('レイヤの操作', () => {
  it('カードのトグルでオンオフが切り替わる', () => {
    const root = setup();
    card(root, 'fire').querySelector<HTMLButtonElement>('.sound-toggle')!.click();
    expect(card(root, 'fire').classList.contains('is-on')).toBe(true);
  });

  it('音量スライダーを動かすと止まっていた音が鳴る', () => {
    const root = setup();
    const range = card(root, 'waves').querySelector<HTMLInputElement>('.sound-range')!;
    range.value = '40';
    range.dispatchEvent(new Event('input'));
    expect(card(root, 'waves').classList.contains('is-on')).toBe(true);
  });

  it('数字キーで対応する音をトグルする', () => {
    const root = setup();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '4' }));
    expect(card(root, SOUNDS[3]!.id).classList.contains('is-on')).toBe(true);
  });
});

describe('シーンと一括操作', () => {
  it('シーンを選ぶと対応する音が鳴る', () => {
    const root = setup();
    const umibe = [...root.querySelectorAll<HTMLButtonElement>('.chip')].find((b) => b.textContent === '海辺')!;
    umibe.click();
    expect(card(root, 'waves').classList.contains('is-on')).toBe(true);
    expect(card(root, 'wind').classList.contains('is-on')).toBe(true);
    expect(card(root, 'rain').classList.contains('is-on')).toBe(false);
  });

  it('すべて止めると鳴っている音がなくなる', () => {
    const root = setup();
    const stop = [...root.querySelectorAll<HTMLButtonElement>('.ghost')].find((b) =>
      b.textContent?.includes('すべて止める'),
    )!;
    stop.click();
    expect(root.querySelectorAll('.sound.is-on')).toHaveLength(0);
  });
});

describe('永続化', () => {
  it('操作するとURLハッシュとlocalStorageへ保存される', () => {
    const root = setup();
    card(root, 'fire').querySelector<HTMLButtonElement>('.sound-toggle')!.click();
    expect(location.hash.startsWith('#m=')).toBe(true);
    expect(storage.getItem('amaoto:mix')).not.toBeNull();
  });
});
