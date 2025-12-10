// テーマの解決と保存。OS設定に従う 'auto' と、明示的な 'light' / 'dark' を持つ。
// 実際の色切り替えは data-theme 属性で行い、メディアクエリは auto のときだけ効く。
// 初回描画前の確定は index.html 先頭のスクリプトが担い、ここは操作後の更新を扱う。

export type Theme = 'auto' | 'light' | 'dark';

const KEY = 'amaoto:theme';
export const THEMES: readonly Theme[] = ['auto', 'light', 'dark'];

export function isTheme(value: unknown): value is Theme {
  return value === 'auto' || value === 'light' || value === 'dark';
}

/** 保存済みのテーマを読む。未保存・不正値は 'auto' */
export function loadTheme(): Theme {
  try {
    const saved = localStorage.getItem(KEY);
    return isTheme(saved) ? saved : 'auto';
  } catch {
    return 'auto';
  }
}

/** テーマを保存する。失敗しても落とさない */
export function saveTheme(theme: Theme): void {
  try {
    if (theme === 'auto') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, theme);
  } catch {
    // 保存できない環境でも操作自体は続行する
  }
}

/** ボタンの順送り: auto → light → dark → auto */
export function nextTheme(theme: Theme): Theme {
  return theme === 'auto' ? 'light' : theme === 'light' ? 'dark' : 'auto';
}

/** いま実際に表示される明暗。auto はOS設定を見て解決する */
export function resolveTheme(theme: Theme): 'light' | 'dark' {
  if (theme !== 'auto') return theme;
  const prefersDark =
    typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
  return prefersDark ? 'dark' : 'light';
}

/** ルート要素に data-theme を反映する。auto では属性を外しOSに委ねる */
export function applyTheme(theme: Theme, root: HTMLElement = document.documentElement): void {
  if (theme === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
}

export const THEME_LABEL: Readonly<Record<Theme, string>> = {
  auto: '自動',
  light: '昼',
  dark: '夜',
};
