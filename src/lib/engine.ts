// Web Audioによる環境音の合成。各レイヤは色付きノイズをループ再生し、フィルタと
// 任意のLFO・クラックルで質感を作る。レイヤは必要になったとき初めて組み立て、以後は
// ゲインで出し入れする。音の規則(ノイズ生成)は純粋関数に任せ、ここは配線に徹する。

import { type Mix } from './mix';
import { noiseOf, makePRNG, type NoiseColor } from './noise';
import { getSound, type SoundDef } from './sounds';

type WindowWithWebkit = typeof globalThis & { webkitAudioContext?: typeof AudioContext };

const FADE = 0.5;
const BUFFER_SECONDS = 6;

interface CrackleNodes {
  readonly gain: GainNode;
  readonly filter: BiquadFilterNode;
  timer: number | null;
  rng: () => number;
}

interface LayerNodes {
  readonly def: SoundDef;
  readonly filter: BiquadFilterNode;
  readonly gain: GainNode;
  crackle?: CrackleNodes;
  on: boolean;
  volume: number;
}

export class Mixer {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private buffers = new Map<NoiseColor, AudioBuffer>();
  private layers = new Map<string, LayerNodes>();
  private masterValue = 0.8;
  private sleepTimer: number | null = null;

  static get supported(): boolean {
    return (
      typeof window !== 'undefined' &&
      !!(window.AudioContext ?? (window as WindowWithWebkit).webkitAudioContext)
    );
  }

  async resume(): Promise<void> {
    const ctx = this.tryEnsure();
    if (ctx && ctx.state === 'suspended') await ctx.resume();
  }

  /** ミックスの全レイヤとマスターを反映する */
  applyMix(mix: Mix): void {
    const ctx = this.tryEnsure();
    if (!ctx) return;
    void ctx.resume();
    this.setMaster(mix.master);
    for (const [id, layer] of Object.entries(mix.layers)) {
      this.setLayer(id, layer.on, layer.volume);
    }
  }

  setMaster(value: number): void {
    this.masterValue = Math.min(1, Math.max(0, value));
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.masterValue, this.ctx.currentTime, 0.05);
    }
  }

  setLayer(id: string, on: boolean, volume: number): void {
    const def = getSound(id);
    if (!def) return;
    if (!on && !this.layers.has(id)) return; // まだ作っていない無音レイヤは触らない
    const ctx = this.tryEnsure();
    if (!ctx) return;
    const layer = this.ensureLayer(def);
    layer.on = on;
    layer.volume = volume;
    const target = on ? volume * def.gain : 0;
    layer.gain.gain.setTargetAtTime(target, ctx.currentTime, FADE / 3);
    if (layer.crackle) this.driveCrackle(layer, on);
  }

  /** 何分後にゆっくり消音するスリープタイマー。fadeは消えるまでの秒数 */
  startSleep(minutes: number, fade = 8, onEnd?: () => void): void {
    this.cancelSleep();
    const ctx = this.tryEnsure();
    if (!ctx || !this.master) return;
    const startFadeAfter = Math.max(0, minutes * 60 - fade) * 1000;
    this.sleepTimer = window.setTimeout(() => {
      if (this.master && this.ctx) {
        const now = this.ctx.currentTime;
        this.master.gain.cancelScheduledValues(now);
        this.master.gain.setValueAtTime(this.master.gain.value, now);
        this.master.gain.linearRampToValueAtTime(0, now + fade);
      }
      this.sleepTimer = window.setTimeout(() => {
        this.suspend();
        onEnd?.();
      }, fade * 1000);
    }, startFadeAfter);
  }

  cancelSleep(): void {
    if (this.sleepTimer !== null) {
      clearTimeout(this.sleepTimer);
      this.sleepTimer = null;
    }
    if (this.master && this.ctx) {
      this.master.gain.cancelScheduledValues(this.ctx.currentTime);
      this.master.gain.setTargetAtTime(this.masterValue, this.ctx.currentTime, 0.1);
    }
  }

  private suspend(): void {
    if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend();
  }

  private ensureLayer(def: SoundDef): LayerNodes {
    const existing = this.layers.get(def.id);
    if (existing) return existing;
    const ctx = this.ensure();
    const master = this.master!;

    const source = ctx.createBufferSource();
    source.buffer = this.buffer(def.color);
    source.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = def.filter.kind;
    filter.frequency.value = def.filter.freq;
    filter.Q.value = def.filter.q;

    const gain = ctx.createGain();
    gain.gain.value = 0;

    source.connect(filter).connect(gain).connect(master);
    source.start();

    if (def.lfo) {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = def.lfo.rate;
      const lfoGain = ctx.createGain();
      if (def.lfo.target === 'filterFreq') {
        lfoGain.gain.value = def.lfo.depth;
        lfo.connect(lfoGain).connect(filter.frequency);
      } else {
        lfoGain.gain.value = def.gain * def.lfo.depth;
        lfo.connect(lfoGain).connect(gain.gain);
      }
      lfo.start();
    }

    const layer: LayerNodes = { def, filter, gain, on: false, volume: def.gain };

    if (def.crackle) {
      const cGain = ctx.createGain();
      cGain.gain.value = 0;
      const cFilter = ctx.createBiquadFilter();
      cFilter.type = 'highpass';
      cFilter.frequency.value = 1600;
      const cSource = ctx.createBufferSource();
      cSource.buffer = this.buffer('white');
      cSource.loop = true;
      cSource.connect(cFilter).connect(cGain).connect(master);
      cSource.start();
      layer.crackle = { gain: cGain, filter: cFilter, timer: null, rng: makePRNG(0x9e37 ^ def.id.length) };
    }

    this.layers.set(def.id, layer);
    return layer;
  }

  // パチパチという爆ぜ音を、ポアソン的な間隔で短い減衰の山として重ねる。
  private driveCrackle(layer: LayerNodes, on: boolean): void {
    const crackle = layer.crackle;
    if (!crackle) return;
    if (crackle.timer !== null) {
      clearTimeout(crackle.timer);
      crackle.timer = null;
    }
    if (!on) return;
    const def = layer.def.crackle!;
    const tick = (): void => {
      if (!layer.on || !this.ctx) return;
      const now = this.ctx.currentTime + 0.01;
      const amp = (0.15 + crackle.rng() * 0.5) * layer.volume;
      crackle.gain.gain.setValueAtTime(Math.max(0.0001, amp), now);
      crackle.gain.gain.exponentialRampToValueAtTime(0.0001, now + def.decay);
      const wait = (-Math.log(Math.max(1e-6, crackle.rng())) / def.rate) * 1000;
      crackle.timer = window.setTimeout(tick, Math.min(1500, wait));
    };
    tick();
  }

  private buffer(color: NoiseColor): AudioBuffer {
    const cached = this.buffers.get(color);
    if (cached) return cached;
    const ctx = this.ensure();
    const length = Math.floor(ctx.sampleRate * BUFFER_SECONDS);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    buffer.getChannelData(0).set(noiseOf(color, length, makePRNG(color.length * 2654435761)));
    this.buffers.set(color, buffer);
    return buffer;
  }

  private tryEnsure(): AudioContext | null {
    try {
      return this.ensure();
    } catch {
      return null;
    }
  }

  private ensure(): AudioContext {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as WindowWithWebkit).webkitAudioContext;
      if (!Ctor) throw new Error('このブラウザはWeb Audioに対応していない');
      this.ctx = new Ctor();
      const compressor = this.ctx.createDynamicsCompressor();
      compressor.threshold.value = -10;
      compressor.ratio.value = 4;
      compressor.connect(this.ctx.destination);
      this.master = this.ctx.createGain();
      this.master.gain.value = this.masterValue;
      this.master.connect(compressor);
    }
    return this.ctx;
  }
}
