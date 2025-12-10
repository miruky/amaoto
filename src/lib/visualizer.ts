// マスター直後の波形を、なめらかなSVGのラインとして流す可視化。実際に鳴っている
// 音に反応するので、雨や波の揺らぎがそのまま線の起伏になる。動きを止める設定では
// 静かな一筆の波を一度だけ描く。requestAnimationFrame が無い環境では静的描画に留める。

export interface WaveOptions {
  /** 重ねて奥行きを出す複数のライン。先頭が前面、後ろほど淡い */
  readonly paths: readonly SVGPathElement[];
  /** 0..255 の時間領域データを返す。null なら静的な待機波を描く */
  readonly read: () => Uint8Array | null;
  /** いま動かすべきか(鳴っていて、動きを許可しているか) */
  readonly active: () => boolean;
}

const VIEW_W = 1200;
const VIEW_H = 200;
const BASE_Y = VIEW_H / 2;
const POINTS = 96;

export interface WaveHandle {
  /** アニメーションを開始する。reduced-motion 環境では一度だけ描く */
  start(): void;
  stop(): void;
}

function smoothPath(samples: readonly number[]): string {
  // 各点を通る滑らかな曲線を、中点を制御点にした二次ベジェで結ぶ。
  const n = samples.length;
  if (n === 0) return '';
  const x = (i: number): number => (i / (n - 1)) * VIEW_W;
  let d = `M ${x(0).toFixed(1)} ${samples[0]!.toFixed(1)}`;
  for (let i = 1; i < n; i++) {
    const mx = (x(i - 1) + x(i)) / 2;
    const my = (samples[i - 1]! + samples[i]!) / 2;
    d += ` Q ${x(i - 1).toFixed(1)} ${samples[i - 1]!.toFixed(1)} ${mx.toFixed(1)} ${my.toFixed(1)}`;
  }
  d += ` T ${x(n - 1).toFixed(1)} ${samples[n - 1]!.toFixed(1)}`;
  return d;
}

function hasRaf(): boolean {
  return typeof requestAnimationFrame === 'function' && typeof cancelAnimationFrame === 'function';
}

export function createWaveform(opts: WaveOptions): WaveHandle {
  const layers = opts.paths.length;
  let raf = 0;
  let phase = 0;
  let smoothLevel = 0;

  // 待機時とreduced-motion時の、ほとんど動かない穏やかな波。
  function idleSamples(depth: number, t: number): number[] {
    const out = new Array<number>(POINTS);
    const amp = 5 + depth * 3;
    for (let i = 0; i < POINTS; i++) {
      const u = i / (POINTS - 1);
      out[i] = BASE_Y + Math.sin(u * Math.PI * 3 + t + depth) * amp;
    }
    return out;
  }

  function liveSamples(wave: Uint8Array, depth: number, gain: number): number[] {
    const out = new Array<number>(POINTS);
    const stride = wave.length / POINTS;
    const amp = (BASE_Y - 14) * (0.25 + 0.75 * gain) * (1 - depth * 0.28);
    for (let i = 0; i < POINTS; i++) {
      const v = (wave[Math.floor(i * stride)]! - 128) / 128;
      out[i] = BASE_Y + v * amp;
    }
    return out;
  }

  function draw(t: number): void {
    const wave = opts.read();
    if (wave) {
      const lvl = (() => {
        let s = 0;
        for (let i = 0; i < wave.length; i += 8) {
          const v = (wave[i]! - 128) / 128;
          s += v * v;
        }
        return Math.min(1, Math.sqrt(s / (wave.length / 8)) * 1.7);
      })();
      smoothLevel += (lvl - smoothLevel) * 0.1;
    } else {
      smoothLevel += (0 - smoothLevel) * 0.05;
    }
    for (let d = 0; d < layers; d++) {
      const samples =
        wave && smoothLevel > 0.012
          ? liveSamples(wave, d, smoothLevel)
          : idleSamples(d, t * 0.0009 + d * 0.6);
      opts.paths[d]!.setAttribute('d', smoothPath(samples));
    }
  }

  function frame(now: number): void {
    phase = now;
    draw(now);
    if (opts.active()) {
      raf = requestAnimationFrame(frame);
    } else {
      raf = 0;
    }
  }

  return {
    start(): void {
      if (!hasRaf()) {
        draw(0); // 静的環境では待機波を一度だけ
        return;
      }
      if (raf) return;
      raf = requestAnimationFrame(frame);
    },
    stop(): void {
      if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
      // 止めたあとは穏やかな待機波で固定する
      draw(phase);
    },
  };
}
