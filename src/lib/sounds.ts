// 環境音の定義。各音は「色付きノイズ + フィルタ + 任意のLFO/クラックル」で組み立てる。
// エンジンはこのパラメータを読んでWeb Audioのノード網を作る。音そのものの規則は
// ここにデータとして集約し、見た目も発音もこの1か所から導く。

import type { NoiseColor } from './noise';

export type FilterKind = 'lowpass' | 'highpass' | 'bandpass';

export interface LfoSpec {
  /** 周期の速さ(Hz) */
  readonly rate: number;
  /** 揺れの深さ。targetにより意味が変わる */
  readonly depth: number;
  /** 揺らす対象。フィルタ周波数か、レイヤ音量か */
  readonly target: 'filterFreq' | 'gain';
}

export interface CrackleSpec {
  /** 1秒あたりの平均発生回数 */
  readonly rate: number;
  /** 1回の減衰時間(秒) */
  readonly decay: number;
}

export interface SoundDef {
  readonly id: string;
  readonly name: string;
  /** 一覧でアイコンに使う名前 */
  readonly icon: string;
  readonly color: NoiseColor;
  readonly filter: { readonly kind: FilterKind; readonly freq: number; readonly q: number };
  readonly gain: number;
  readonly lfo?: LfoSpec;
  readonly crackle?: CrackleSpec;
}

export const SOUNDS: readonly SoundDef[] = [
  {
    id: 'rain',
    name: '雨',
    icon: 'rain',
    color: 'pink',
    filter: { kind: 'highpass', freq: 820, q: 0.7 },
    gain: 0.5,
    lfo: { rate: 0.08, depth: 0.12, target: 'gain' },
  },
  {
    id: 'waves',
    name: '波',
    icon: 'waves',
    color: 'brown',
    filter: { kind: 'lowpass', freq: 520, q: 0.6 },
    gain: 0.85,
    lfo: { rate: 0.1, depth: 360, target: 'filterFreq' },
  },
  {
    id: 'wind',
    name: '風',
    icon: 'wind',
    color: 'pink',
    filter: { kind: 'bandpass', freq: 500, q: 1.2 },
    gain: 0.7,
    lfo: { rate: 0.16, depth: 280, target: 'filterFreq' },
  },
  {
    id: 'fire',
    name: '焚き火',
    icon: 'fire',
    color: 'brown',
    filter: { kind: 'lowpass', freq: 420, q: 0.5 },
    gain: 0.7,
    crackle: { rate: 11, decay: 0.05 },
  },
  {
    id: 'stream',
    name: '小川',
    icon: 'stream',
    color: 'white',
    filter: { kind: 'highpass', freq: 1200, q: 0.6 },
    gain: 0.4,
    lfo: { rate: 0.7, depth: 0.1, target: 'gain' },
  },
  {
    id: 'white',
    name: 'ホワイトノイズ',
    icon: 'noise',
    color: 'white',
    filter: { kind: 'lowpass', freq: 18000, q: 0.3 },
    gain: 0.32,
  },
  {
    id: 'pink',
    name: 'ピンクノイズ',
    icon: 'noise',
    color: 'pink',
    filter: { kind: 'lowpass', freq: 18000, q: 0.3 },
    gain: 0.5,
  },
  {
    id: 'brown',
    name: 'ブラウンノイズ',
    icon: 'noise',
    color: 'brown',
    filter: { kind: 'lowpass', freq: 18000, q: 0.3 },
    gain: 0.85,
  },
];

const BY_ID = new Map(SOUNDS.map((s) => [s.id, s]));

export function getSound(id: string): SoundDef | undefined {
  return BY_ID.get(id);
}

export const SOUND_IDS: readonly string[] = SOUNDS.map((s) => s.id);
