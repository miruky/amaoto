// 環境音の素になる色付きノイズを生成する。音声ファイルを持たず、すべてその場で
// 合成するため、ここでノイズ列を作りWeb Audioのループバッファに流し込む。
// シード付きの擬似乱数で決定的に生成するので、結果をテストできる。

/** mulberry32。軽量で素性の良い32bit擬似乱数。seedごとに決定的な列を返す */
export function makePRNG(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(x: number): number {
  return x < -1 ? -1 : x > 1 ? 1 : x;
}

/** 白色ノイズ。全帯域に均一なエネルギー */
export function whiteNoise(length: number, rng: () => number): Float32Array {
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) out[i] = rng() * 2 - 1;
  return out;
}

/**
 * ピンクノイズ。-3dB/oct で高域が落ちる、自然界に多い質感。
 * Paul Kellet の近似フィルタで白色ノイズを整形する。
 */
export function pinkNoise(length: number, rng: () => number): Float32Array {
  const out = new Float32Array(length);
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let b3 = 0;
  let b4 = 0;
  let b5 = 0;
  let b6 = 0;
  for (let i = 0; i < length; i++) {
    const w = rng() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.016898;
    out[i] = clamp((b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11);
    b6 = w * 0.115926;
  }
  return out;
}

/**
 * ブラウン(赤色)ノイズ。-6dB/oct で低域が強い、波や遠雷のような重い質感。
 * 白色ノイズを軽い漏れ積分にかけて作る。
 */
export function brownNoise(length: number, rng: () => number): Float32Array {
  const out = new Float32Array(length);
  let last = 0;
  for (let i = 0; i < length; i++) {
    const w = rng() * 2 - 1;
    last = (last + 0.02 * w) / 1.02;
    out[i] = clamp(last * 3.5);
  }
  return out;
}

export type NoiseColor = 'white' | 'pink' | 'brown';

/** 色を指定してノイズ列を作る */
export function noiseOf(color: NoiseColor, length: number, rng: () => number): Float32Array {
  if (color === 'white') return whiteNoise(length, rng);
  if (color === 'brown') return brownNoise(length, rng);
  return pinkNoise(length, rng);
}
