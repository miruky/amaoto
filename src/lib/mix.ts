// ミックスの状態。各レイヤ(音源)のオン/オフと音量、それにマスター音量からなる。
// 編集はすべて新しいミックスを返す純粋関数で行い、UIとエンジンはこれを差し替える。

import { SOUND_IDS } from './sounds';

export interface Layer {
  readonly on: boolean;
  /** 0..1 */
  readonly volume: number;
}

export interface Mix {
  /** 0..1 */
  readonly master: number;
  readonly layers: Readonly<Record<string, Layer>>;
}

export const DEFAULT_VOLUME = 0.6;

export function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

function blankLayers(): Record<string, Layer> {
  const layers: Record<string, Layer> = {};
  for (const id of SOUND_IDS) layers[id] = { on: false, volume: DEFAULT_VOLUME };
  return layers;
}

/** 既定のミックス。雨をそっと鳴らした状態から始める */
export function defaultMix(): Mix {
  const layers = blankLayers();
  layers.rain = { on: true, volume: 0.5 };
  return { master: 0.8, layers };
}

/** 既知の音源すべてにレイヤを揃え、値を0..1へ丸める。未知のidは捨てる */
export function normalizeMix(partial: {
  master?: number;
  layers?: Record<string, { on?: boolean; volume?: number }>;
}): Mix {
  const layers = blankLayers();
  for (const id of SOUND_IDS) {
    const src = partial.layers?.[id];
    if (src) {
      layers[id] = {
        on: Boolean(src.on),
        volume: clamp01(typeof src.volume === 'number' ? src.volume : DEFAULT_VOLUME),
      };
    }
  }
  return { master: clamp01(typeof partial.master === 'number' ? partial.master : 0.8), layers };
}

export function setMaster(mix: Mix, master: number): Mix {
  return { ...mix, master: clamp01(master) };
}

function patchLayer(mix: Mix, id: string, patch: Partial<Layer>): Mix {
  const current = mix.layers[id];
  if (!current) return mix;
  return { ...mix, layers: { ...mix.layers, [id]: { ...current, ...patch } } };
}

export function setLayerOn(mix: Mix, id: string, on: boolean): Mix {
  return patchLayer(mix, id, { on });
}

export function toggleLayer(mix: Mix, id: string): Mix {
  const current = mix.layers[id];
  if (!current) return mix;
  return patchLayer(mix, id, { on: !current.on });
}

/** 音量を変えると、止まっていたレイヤは鳴っている状態にする(操作した=鳴らしたい) */
export function setLayerVolume(mix: Mix, id: string, volume: number): Mix {
  const current = mix.layers[id];
  if (!current) return mix;
  return patchLayer(mix, id, { volume: clamp01(volume), on: true });
}

export function activeCount(mix: Mix): number {
  return SOUND_IDS.reduce((n, id) => (mix.layers[id]?.on ? n + 1 : n), 0);
}

/** 全レイヤを止める(マスターと音量は保つ) */
export function silenceAll(mix: Mix): Mix {
  const layers: Record<string, Layer> = {};
  for (const id of SOUND_IDS) layers[id] = { ...mix.layers[id]!, on: false };
  return { ...mix, layers };
}

export interface Scene {
  readonly id: string;
  readonly name: string;
  readonly mix: Mix;
}

function scene(id: string, name: string, volumes: Record<string, number>): Scene {
  const layers = blankLayers();
  for (const [soundId, volume] of Object.entries(volumes)) {
    if (layers[soundId]) layers[soundId] = { on: true, volume: clamp01(volume) };
  }
  return { id, name, mix: { master: 0.8, layers } };
}

export const SCENES: readonly Scene[] = [
  scene('shosai', '雨の書斎', { rain: 0.55, brown: 0.25 }),
  scene('umibe', '海辺', { waves: 0.8, wind: 0.3 }),
  scene('takibi', '焚き火の夜', { fire: 0.7, wind: 0.2 }),
  scene('keiryu', '渓流', { stream: 0.6, wind: 0.25 }),
  scene('arashi', '嵐', { rain: 0.7, wind: 0.6, waves: 0.4 }),
  scene('shuchu', '集中', { brown: 0.7 }),
];
