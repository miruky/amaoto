// 線画のSVGアイコン。currentColorでテーマに追従し、装飾なので aria-hidden を付ける。
// 文字列で返し、ボタンの innerHTML に差し込んで使う。

const PATHS: Readonly<Record<string, string>> = {
  rain: '<path d="M7 16a4 4 0 0 1-.5-7.97 5 5 0 0 1 9.6-1.2A3.5 3.5 0 0 1 17 16" /><path d="M8 19l-1 2M12 19l-1 2M16 19l-1 2" />',
  waves: '<path d="M3 9c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2" /><path d="M3 14c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2" /><path d="M3 19c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2" />',
  wind: '<path d="M3 8h9a2.5 2.5 0 1 0-2.5-2.5" /><path d="M3 12h13a3 3 0 1 1-3 3" /><path d="M3 16h7a2 2 0 1 1-2 2" />',
  fire: '<path d="M12 3c1 3 4 4 4 8a4 4 0 0 1-8 0c0-1.5.5-2.5 1.2-3.3C9.8 7 11 5.5 12 3z" /><path d="M12 13a2 2 0 0 0 1.8 3.4A2 2 0 0 1 10 16c0-1 .8-1.5 2-3z" />',
  stream: '<path d="M5 5c2 1 2 4 0 5s-2 4 0 5 2 4 0 5" /><path d="M12 5c2 1 2 4 0 5s-2 4 0 5 2 4 0 5" /><path d="M19 5c2 1 2 4 0 5s-2 4 0 5 2 4 0 5" />',
  noise: '<path d="M4 12h2l1.5-5 3 14 3-18 3 14L20 12h0" />',
  power: '<path d="M12 4v8" /><path d="M7.5 7a7 7 0 1 0 9 0" />',
  link: '<path d="M9 14a4 4 0 0 0 5.66 0l2.83-2.83a4 4 0 0 0-5.66-5.66L10.5 6.5" /><path d="M15 10a4 4 0 0 0-5.66 0L6.5 12.84a4 4 0 0 0 5.66 5.66L13.5 17.5" />',
  shuffle: '<path d="M4 6h3.5L17 18h3" /><path d="M17 6h3M4 18h3.5L11 13" /><path d="M17 4l3 2-3 2M17 16l3 2-3 2" />',
  timer: '<circle cx="12" cy="13" r="8" /><path d="M12 13V9M9 2h6" />',
  check: '<path d="M5 12.5 10 17 19 7" />',
  sun: '<circle cx="12" cy="12" r="3.6" /><path d="M12 3v2.4M12 18.6V21M3 12h2.4M18.6 12H21M5.6 5.6l1.7 1.7M16.7 16.7l1.7 1.7M18.4 5.6l-1.7 1.7M7.3 16.7l-1.7 1.7" />',
  moon: '<path d="M20 14.4A8 8 0 1 1 9.6 4 6.3 6.3 0 0 0 20 14.4z" />',
  auto: '<circle cx="12" cy="12" r="8.4" /><path d="M12 3.6a8.4 8.4 0 0 1 0 16.8z" fill="currentColor" stroke="none" />',
};

export function icon(name: keyof typeof PATHS, size = 20): string {
  return (
    `<svg class="icon" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" ` +
    `stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" ` +
    `aria-hidden="true">${PATHS[name]}</svg>`
  );
}

export type IconName = keyof typeof PATHS;
