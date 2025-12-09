// ミックスをURLで共有するためのエンコード/デコード。鳴っているレイヤだけを短く畳んで
// ハッシュに載せ、開いたときに復元する。壊れた入力は捨てて既定へ戻せるよう厳密に検証する。

import { type Mix, normalizeMix } from './mix';
import { SOUND_IDS } from './sounds';

const VERSION = '1';
const ID_SET = new Set(SOUND_IDS);

const pct = (x: number): number => Math.round(x * 100);

/** ミックスを共有用の文字列にする(先頭の # は付けない) */
export function encodeMix(mix: Mix): string {
  const active = SOUND_IDS.filter((id) => mix.layers[id]?.on)
    .map((id) => `${id}:${pct(mix.layers[id]!.volume)}`)
    .join(',');
  return [VERSION, pct(mix.master), active].join('|');
}

/** 共有用の文字列からミックスを復元する。形式が不正なら null */
export function decodeMix(input: string): Mix | null {
  const body = input.replace(/^#/, '').replace(/^m=/, '');
  const parts = body.split('|');
  if (parts.length !== 3) return null;
  const [version, masterRaw, layersRaw] = parts;
  if (version !== VERSION) return null;

  const master = toInt(masterRaw);
  if (master === null || master < 0 || master > 100) return null;

  const layers: Record<string, { on: boolean; volume: number }> = {};
  if (layersRaw && layersRaw.length > 0) {
    for (const entry of layersRaw.split(',')) {
      const fields = entry.split(':');
      if (fields.length !== 2) return null;
      const id = fields[0]!;
      const volume = toInt(fields[1]!);
      if (!ID_SET.has(id)) return null;
      if (volume === null || volume < 0 || volume > 100) return null;
      layers[id] = { on: true, volume: volume / 100 };
    }
  }

  return normalizeMix({ master: master / 100, layers });
}

function toInt(value: string | undefined): number | null {
  if (value === undefined || !/^\d+$/.test(value)) return null;
  return Number.parseInt(value, 10);
}
