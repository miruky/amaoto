// localStorageの薄いラッパ。無効化された環境でも例外で落ちないよう読み書きは握りつぶす。
// ミックスは共有用の文字列のまま保存する。

const KEY = 'amaoto:mix';

export function saveString(value: string): boolean {
  try {
    localStorage.setItem(KEY, value);
    return true;
  } catch {
    return false;
  }
}

export function loadString(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}
