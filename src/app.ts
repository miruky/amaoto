import './style.css';
import { Mixer } from './lib/engine';
import {
  defaultMix,
  type Mix,
  SCENES,
  setLayerVolume,
  setMaster,
  silenceAll,
  toggleLayer,
} from './lib/mix';
import { getSound, SOUNDS } from './lib/sounds';
import { decodeMix, encodeMix } from './lib/share';
import { loadString, saveString } from './lib/storage';
import { icon, type IconName } from './icons';

type Attrs = Record<string, string | number | boolean | null | undefined>;
interface ElOptions {
  class?: string;
  text?: string;
  html?: string;
  attrs?: Attrs;
  on?: Partial<Record<string, EventListener>>;
}

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  opts: ElOptions = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (opts.class) node.className = opts.class;
  if (opts.text !== undefined) node.textContent = opts.text;
  if (opts.html !== undefined) node.innerHTML = opts.html;
  if (opts.attrs) {
    for (const [k, v] of Object.entries(opts.attrs)) {
      if (v !== null && v !== undefined && v !== false) node.setAttribute(k, v === true ? '' : String(v));
    }
  }
  if (opts.on) {
    for (const [k, v] of Object.entries(opts.on)) if (v) node.addEventListener(k, v);
  }
  for (const c of children) node.append(c);
  return node;
}

const SLEEP_OPTIONS = [0, 15, 30, 45, 60];

export function mountApp(root: HTMLElement): void {
  const mixer = new Mixer();
  const state = { mix: initialMix() };
  let started = false;

  const cards = new Map<string, HTMLElement>();
  const volumeInputs = new Map<string, HTMLInputElement>();
  const masterInput = h('input', {
    class: 'master-range',
    attrs: { type: 'range', min: 0, max: 100, step: 1, 'aria-label': 'マスター音量' },
  }) as HTMLInputElement;
  const sleepStatus = h('span', { class: 'sleep-status', attrs: { role: 'status', 'aria-live': 'polite' } });
  const shareStatus = h('span', { class: 'share-status', attrs: { role: 'status', 'aria-live': 'polite' } });

  function persist(): void {
    const encoded = encodeMix(state.mix);
    saveString(encoded);
    history.replaceState(null, '', `#m=${encoded}`);
  }

  // 最初の操作でAudioContextを起こし、既定で鳴っている音(雨など)も実際に鳴らす。
  function ensureStarted(): void {
    if (started) return;
    started = true;
    void mixer.resume();
    mixer.applyMix(state.mix);
  }

  function setMix(next: Mix): void {
    state.mix = next;
    persist();
  }

  function toggleSound(id: string): void {
    ensureStarted();
    const next = toggleLayer(state.mix, id);
    setMix(next);
    const layer = next.layers[id]!;
    mixer.setLayer(id, layer.on, layer.volume);
    syncCard(id);
  }

  function changeVolume(id: string, value: number): void {
    ensureStarted();
    const next = setLayerVolume(state.mix, id, value / 100);
    setMix(next);
    mixer.setLayer(id, true, value / 100);
    syncCard(id);
  }

  function changeMaster(value: number): void {
    ensureStarted();
    setMix(setMaster(state.mix, value / 100));
    mixer.setMaster(value / 100);
  }

  function applyMixAll(next: Mix): void {
    ensureStarted();
    setMix(next);
    mixer.applyMix(next);
    renderSounds();
    masterInput.value = String(Math.round(next.master * 100));
  }

  // ---- 描画 ----

  function syncCard(id: string): void {
    const card = cards.get(id);
    const layer = state.mix.layers[id];
    if (!card || !layer) return;
    card.classList.toggle('is-on', layer.on);
    const toggle = card.querySelector<HTMLButtonElement>('.sound-toggle');
    toggle?.setAttribute('aria-pressed', String(layer.on));
    const input = volumeInputs.get(id);
    if (input) input.value = String(Math.round(layer.volume * 100));
  }

  function buildCard(id: string): HTMLElement {
    const def = getSound(id)!;
    const layer = state.mix.layers[id]!;

    const viz = h(
      'span',
      { class: 'viz', attrs: { 'aria-hidden': 'true' } },
      Array.from({ length: 5 }, (_, i) => h('span', { class: `bar bar-${i}` })),
    );
    const toggle = h(
      'button',
      {
        class: 'sound-toggle',
        attrs: { type: 'button', 'aria-pressed': layer.on, 'aria-label': `${def.name}を鳴らす` },
        on: { click: () => toggleSound(id) },
      },
      [h('span', { class: 'sound-icon', html: icon(def.icon as IconName, 26) }), h('span', { class: 'sound-name', text: def.name }), viz],
    );

    const volume = h('input', {
      class: 'sound-range',
      attrs: { type: 'range', min: 0, max: 100, step: 1, value: Math.round(layer.volume * 100), 'aria-label': `${def.name}の音量` },
      on: { input: (e) => changeVolume(id, Number((e.target as HTMLInputElement).value)) },
    }) as HTMLInputElement;
    volumeInputs.set(id, volume);

    const card = h('div', { class: 'sound' + (layer.on ? ' is-on' : ''), attrs: { 'data-id': id } }, [
      toggle,
      volume,
    ]);
    cards.set(id, card);
    return card;
  }

  const soundGrid = h('div', { class: 'sound-grid' });

  function renderSounds(): void {
    cards.clear();
    volumeInputs.clear();
    soundGrid.replaceChildren(...SOUNDS.map((s) => buildCard(s.id)));
  }

  function buildControls(): HTMLElement {
    masterInput.value = String(Math.round(state.mix.master * 100));
    masterInput.addEventListener('input', () => changeMaster(Number(masterInput.value)));

    const scenes = h(
      'div',
      { class: 'scenes', attrs: { role: 'group', 'aria-label': 'シーン' } },
      SCENES.map((scene) =>
        h('button', {
          class: 'chip',
          text: scene.name,
          attrs: { type: 'button' },
          on: { click: () => applyMixAll(scene.mix) },
        }),
      ),
    );

    const randomBtn = h('button', {
      class: 'ghost',
      attrs: { type: 'button' },
      html: `${icon('shuffle')}<span>ランダム</span>`,
      on: {
        click: () => applyMixAll(SCENES[Math.floor(Math.random() * SCENES.length)]!.mix),
      },
    });
    const silenceBtn = h('button', {
      class: 'ghost',
      attrs: { type: 'button' },
      html: `${icon('power')}<span>すべて止める</span>`,
      on: { click: () => applyMixAll(silenceAll(state.mix)) },
    });

    const sleepSelect = h('select', { class: 'field', attrs: { 'aria-label': 'スリープタイマー' } }) as HTMLSelectElement;
    for (const min of SLEEP_OPTIONS) {
      sleepSelect.append(h('option', { text: min === 0 ? 'オフ' : `${min}分`, attrs: { value: min } }));
    }
    sleepSelect.addEventListener('change', () => {
      ensureStarted();
      const minutes = Number(sleepSelect.value);
      if (minutes > 0) {
        mixer.startSleep(minutes, 8, () => {
          sleepSelect.value = '0';
          sleepStatus.textContent = '停止しました';
          renderSounds();
        });
        sleepStatus.textContent = `約${minutes}分後に停止`;
      } else {
        mixer.cancelSleep();
        sleepStatus.textContent = '';
      }
    });

    const shareBtn = h('button', {
      class: 'ghost',
      attrs: { type: 'button' },
      html: `${icon('link')}<span>リンクをコピー</span>`,
      on: { click: copyLink },
    });

    return h('section', { class: 'controls panel' }, [
      h('div', { class: 'control-row' }, [
        labeled('マスター音量', masterInput),
        silenceBtn,
      ]),
      h('div', { class: 'control-block' }, [h('h2', { text: 'シーン' }), h('div', { class: 'scene-row' }, [scenes, randomBtn])]),
      h('div', { class: 'control-row wrap' }, [
        labeled('スリープ', sleepSelect),
        sleepStatus,
        h('div', { class: 'share' }, [shareBtn, shareStatus]),
      ]),
    ]);
  }

  async function copyLink(): Promise<void> {
    const url = `${location.origin}${location.pathname}#m=${encodeMix(state.mix)}`;
    try {
      await navigator.clipboard.writeText(url);
      shareStatus.textContent = 'コピーしました';
    } catch {
      shareStatus.textContent = url;
    }
    window.setTimeout(() => {
      shareStatus.textContent = '';
    }, 2600);
  }

  function labeled(label: string, control: Node): HTMLDivElement {
    return h('div', { class: 'labeled' }, [h('span', { class: 'labeled-text', text: label }), control]);
  }

  // ---- 組み立て ----

  const header = h('header', { class: 'site-header' }, [
    h('div', { class: 'brand' }, [
      h('span', { class: 'brand-mark', html: brandMark() }),
      h('div', {}, [
        h('span', { class: 'brand-name', text: 'amaoto' }),
        h('span', { class: 'brand-tag', text: '作業のための環境音ミキサー' }),
      ]),
    ]),
  ]);

  root.replaceChildren(
    header,
    h('main', { class: 'layout' }, [
      h('section', { class: 'panel panel-sounds' }, [
        h('div', { class: 'panel-head' }, [
          h('h2', { text: '音を重ねる' }),
          h('p', { class: 'hint', text: 'カードで鳴らし、スライダーで音量を決める。複数を重ねて好みの場を作る。' }),
        ]),
        soundGrid,
      ]),
      buildControls(),
    ]),
  );

  renderSounds();

  window.addEventListener('keydown', (event) => {
    const target = event.target as HTMLElement | null;
    const tag = target?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    const index = Number(event.key) - 1;
    if (Number.isInteger(index) && index >= 0 && index < SOUNDS.length) {
      event.preventDefault();
      toggleSound(SOUNDS[index]!.id);
    }
  });

  window.addEventListener('hashchange', () => {
    const shared = decodeMix(location.hash);
    if (shared) applyMixAll(shared);
  });
}

function initialMix(): Mix {
  const fromHash = decodeMix(location.hash);
  if (fromHash) return fromHash;
  const saved = loadString();
  if (saved) {
    const decoded = decodeMix(saved);
    if (decoded) return decoded;
  }
  return defaultMix();
}

function brandMark(): string {
  return (
    `<svg viewBox="0 0 32 32" width="28" height="28" fill="none" aria-hidden="true">` +
    `<path d="M3 16c2.5 0 2.5-5 5-5s2.5 5 5 5 2.5-5 5-5 2.5 5 5 5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />` +
    `<path d="M3 23c2.5 0 2.5-4 5-4s2.5 4 5 4 2.5-4 5-4 2.5 4 5 4" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" opacity="0.5" />` +
    `<path d="M13 4l2 3M19 3l1.5 4M24 6l1 3" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity="0.7" />` +
    `</svg>`
  );
}
