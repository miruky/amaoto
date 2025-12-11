// 名前を付けて保存したミックス(プリセット)の管理。中身は共有用の文字列なので、
// シーンと同じ仕組みで呼び戻せる。一覧の操作は純粋関数で行い、保存はlocalStorageへ。
// 壊れた保存内容は黙って捨て、空の一覧として扱う。

export interface Preset {
  readonly name: string;
  /** encodeMix が返す共有用の文字列(先頭の # は含まない) */
  readonly mix: string;
}

const KEY = 'amaoto:presets';
const MAX = 24;
const NAME_LIMIT = 40;

/** 名前を整える。前後の空白を除き、長すぎる名前は切り詰める */
export function cleanName(name: string): string {
  return name.trim().slice(0, NAME_LIMIT);
}

/** 保存文字列を一覧へ復元する。配列でない・要素が不正なものは捨てる */
export function parsePresets(raw: string | null): Preset[] {
  if (!raw) return [];
  try {
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    const out: Preset[] = [];
    for (const item of data) {
      if (item && typeof item.name === 'string' && typeof item.mix === 'string') {
        const name = cleanName(item.name);
        if (name) out.push({ name, mix: item.mix });
      }
    }
    return out.slice(-MAX);
  } catch {
    return [];
  }
}

export function serializePresets(list: readonly Preset[]): string {
  return JSON.stringify(list);
}

/** 同名は上書きし、新しいものを末尾へ。上限を超えたら古いものから落とす */
export function upsertPreset(list: readonly Preset[], name: string, mix: string): Preset[] {
  const clean = cleanName(name);
  if (!clean) return [...list];
  const without = list.filter((p) => p.name !== clean);
  return [...without, { name: clean, mix }].slice(-MAX);
}

export function removePreset(list: readonly Preset[], name: string): Preset[] {
  return list.filter((p) => p.name !== name);
}

export function hasPreset(list: readonly Preset[], name: string): boolean {
  const clean = cleanName(name);
  return list.some((p) => p.name === clean);
}

export function loadPresets(): Preset[] {
  try {
    return parsePresets(localStorage.getItem(KEY));
  } catch {
    return [];
  }
}

export function persistPresets(list: readonly Preset[]): void {
  try {
    localStorage.setItem(KEY, serializePresets(list));
  } catch {
    // 保存できない環境でも操作自体は続行する
  }
}
