import './style.css';
import { Mixer } from './lib/engine';
import {
  activeCount,
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
import {
  loadPresets,
  persistPresets,
  type Preset,
  removePreset,
  upsertPreset,
} from './lib/presets';
import {
  applyTheme,
  loadTheme,
  nextTheme,
  resolveTheme,
  saveTheme,
  type Theme,
  THEME_LABEL,
} from './lib/theme';
import { createWaveform } from './lib/visualizer';
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

// 一覧での英字の添え名。明朝の和名に小さく添えて階層を作る。
const ROMAJI: Readonly<Record<string, string>> = {
  rain: 'Rain',
  waves: 'Waves',
  wind: 'Wind',
  fire: 'Fire',
  stream: 'Stream',
  white: 'White noise',
  pink: 'Pink noise',
  brown: 'Brown noise',
};

function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function mountApp(root: HTMLElement): void {
  const mixer = new Mixer();
  const state = { mix: initialMix() };
  let started = false;
  let theme: Theme = loadTheme();
  let presets: Preset[] = loadPresets();
  // スペースで止めた直前の音。もう一度押すと戻す。
  let lastAudible: Mix | null = null;

  const cards = new Map<string, HTMLElement>();
  const volumeInputs = new Map<string, HTMLInputElement>();
  const masterInput = h('input', {
    class: 'master-range',
    attrs: { type: 'range', min: 0, max: 100, step: 1, 'aria-label': 'マスター音量' },
  }) as HTMLInputElement;
  const masterValue = h('output', { class: 'master-value', attrs: { 'aria-hidden': 'true' } });
  const activeLabel = h('span', { class: 'mixer-count', attrs: { role: 'status', 'aria-live': 'polite' } });
  const sleepStatus = h('span', { class: 'sleep-status', attrs: { role: 'status', 'aria-live': 'polite' } });
  const shareStatus = h('span', { class: 'share-status', attrs: { role: 'status', 'aria-live': 'polite' } });
  let silenceBtn: HTMLButtonElement | null = null;

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
    refreshWave();
  }

  function setMix(next: Mix): void {
    state.mix = next;
    persist();
    syncMeta();
  }

  function toggleSound(id: string): void {
    ensureStarted();
    const next = toggleLayer(state.mix, id);
    setMix(next);
    const layer = next.layers[id]!;
    mixer.setLayer(id, layer.on, layer.volume);
    syncCard(id);
    refreshWave();
  }

  function changeVolume(id: string, value: number): void {
    ensureStarted();
    const next = setLayerVolume(state.mix, id, value / 100);
    setMix(next);
    mixer.setLayer(id, true, value / 100);
    syncCard(id);
    refreshWave();
  }

  function changeMaster(value: number): void {
    ensureStarted();
    setMix(setMaster(state.mix, value / 100));
    mixer.setMaster(value / 100);
    masterValue.textContent = String(Math.round(value));
    paintRange(masterInput);
  }

  // マスター値の表示。シーン適用などのまとまった変化では数字をなめらかに送る。
  // ドラッグ中(changeMaster)は即時、reduced-motion・rAF不在では即時にする。
  let countRaf = 0;
  function setMasterReadout(to: number, animate: boolean): void {
    if (countRaf) {
      cancelAnimationFrame(countRaf);
      countRaf = 0;
    }
    const from = Number(masterValue.textContent) || 0;
    if (
      !animate ||
      from === to ||
      prefersReducedMotion() ||
      typeof requestAnimationFrame !== 'function'
    ) {
      masterValue.textContent = String(to);
      return;
    }
    const start = performance.now();
    const dur = 420;
    const tick = (now: number): void => {
      const k = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - k, 3);
      masterValue.textContent = String(Math.round(from + (to - from) * eased));
      countRaf = k < 1 ? requestAnimationFrame(tick) : 0;
    };
    countRaf = requestAnimationFrame(tick);
  }

  function applyMixAll(next: Mix): void {
    ensureStarted();
    setMix(next);
    mixer.applyMix(next);
    renderSounds();
    masterInput.value = String(Math.round(next.master * 100));
    setMasterReadout(Math.round(next.master * 100), true);
    paintRange(masterInput);
    refreshWave();
  }

  // ---- 波形の可視化 ----

  const waveLine = svgPath('wave-line');
  const waveEcho = svgPath('wave-echo');
  const waveform = createWaveform({
    paths: [waveLine, waveEcho],
    read: () => mixer.readWaveform(),
    active: () => started && !prefersReducedMotion() && activeCount(state.mix) > 0,
  });

  function refreshWave(): void {
    if (started && !prefersReducedMotion() && activeCount(state.mix) > 0) waveform.start();
    else waveform.stop();
  }

  // スペースキー用。鳴っていれば直前として覚えて止め、止まっていれば直前を戻す。
  function toggleAll(): void {
    ensureStarted();
    if (activeCount(state.mix) > 0) {
      lastAudible = state.mix;
      applyMixAll(silenceAll(state.mix));
    } else if (lastAudible) {
      applyMixAll(lastAudible);
    }
  }

  // ---- 描画 ----

  function syncMeta(): void {
    const n = activeCount(state.mix);
    activeLabel.textContent = n === 0 ? '音は止まっています' : `${n} 種類が重なっています`;
    if (silenceBtn) silenceBtn.disabled = n === 0;
  }

  function syncCard(id: string): void {
    const card = cards.get(id);
    const layer = state.mix.layers[id];
    if (!card || !layer) return;
    card.classList.toggle('is-on', layer.on);
    const toggle = card.querySelector<HTMLButtonElement>('.sound-toggle');
    if (toggle) {
      const def = getSound(id);
      toggle.setAttribute('aria-pressed', String(layer.on));
      toggle.setAttribute('aria-label', `${def?.name ?? ''}を${layer.on ? '止める' : '鳴らす'}`);
    }
    const input = volumeInputs.get(id);
    if (input) {
      input.value = String(Math.round(layer.volume * 100));
      paintRange(input);
    }
  }

  function buildCard(id: string): HTMLElement {
    const def = getSound(id)!;
    const layer = state.mix.layers[id]!;

    const viz = h(
      'span',
      { class: 'viz', attrs: { 'aria-hidden': 'true' } },
      Array.from({ length: 4 }, (_, i) => h('span', { class: `bar bar-${i}` })),
    );
    const toggle = h(
      'button',
      {
        class: 'sound-toggle',
        attrs: {
          type: 'button',
          'aria-pressed': layer.on,
          'aria-label': `${def.name}を${layer.on ? '止める' : '鳴らす'}`,
        },
        on: { click: () => toggleSound(id) },
      },
      [
        h('span', { class: 'sound-icon', html: icon(def.icon as IconName, 22) }),
        h('span', { class: 'sound-label' }, [
          h('span', { class: 'sound-name', text: def.name }),
          h('span', { class: 'sound-en', text: ROMAJI[id] ?? '' }),
        ]),
        viz,
      ],
    );

    const volume = h('input', {
      class: 'sound-range',
      attrs: {
        type: 'range',
        min: 0,
        max: 100,
        step: 1,
        value: Math.round(layer.volume * 100),
        'aria-label': `${def.name}の音量`,
      },
      on: { input: (e) => changeVolume(id, Number((e.target as HTMLInputElement).value)) },
    }) as HTMLInputElement;
    volumeInputs.set(id, volume);
    paintRange(volume);

    const card = h('li', { class: 'sound' + (layer.on ? ' is-on' : ''), attrs: { 'data-id': id } }, [
      toggle,
      h('span', { class: 'sound-control' }, [volume]),
    ]);
    cards.set(id, card);
    return card;
  }

  const soundList = h('ul', { class: 'sound-list', attrs: { 'aria-label': '環境音' } });

  function renderSounds(): void {
    cards.clear();
    volumeInputs.clear();
    soundList.replaceChildren(...SOUNDS.map((s) => buildCard(s.id)));
    syncMeta();
  }

  // ---- ヘッダ・テーマ ----

  const themeBtn = h('button', {
    class: 'theme-toggle',
    attrs: { type: 'button' },
    on: { click: cycleTheme },
  });

  function syncTheme(): void {
    applyTheme(theme);
    const resolved = resolveTheme(theme);
    const ic: IconName = theme === 'auto' ? 'auto' : theme === 'light' ? 'sun' : 'moon';
    themeBtn.innerHTML = `${icon(ic, 18)}<span class="theme-name">${THEME_LABEL[theme]}</span>`;
    themeBtn.setAttribute(
      'aria-label',
      `テーマ: ${THEME_LABEL[theme]}(現在は${resolved === 'dark' ? '夜' : '昼'})。押すと切り替え`,
    );
    refreshWave();
  }

  function cycleTheme(): void {
    theme = nextTheme(theme);
    saveTheme(theme);
    syncTheme();
  }

  const header = h('header', { class: 'topbar' }, [
    h('a', { class: 'brand', attrs: { href: '#top', 'aria-label': 'amaoto トップ' } }, [
      h('span', { class: 'brand-mark', html: brandMark() }),
      h('span', { class: 'brand-name', text: 'amaoto' }),
    ]),
    themeBtn,
  ]);

  // ---- 構成 ----

  const waveSvg = (): SVGSVGElement => {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('class', 'wave');
    svg.setAttribute('viewBox', '0 0 1200 200');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('aria-hidden', 'true');
    svg.append(waveEcho, waveLine);
    return svg;
  };

  const heroBanner = (): HTMLElement => {
    const fig = h('figure', { class: 'hero-banner', attrs: { 'aria-hidden': 'true' } });
    const img = h('img', {
      class: 'hero-img',
      attrs: {
        src: 'https://picsum.photos/seed/amaoto-ame/1600/900?grayscale',
        width: 1600,
        height: 900,
        loading: 'lazy',
        decoding: 'async',
        alt: '',
      },
    });
    fig.append(img, h('span', { class: 'hero-tint' }), waveSvg());
    return fig;
  };

  const hero = h('section', { class: 'hero reveal', attrs: { id: 'top' } }, [
    h('div', { class: 'hero-head' }, [
      h('span', { class: 'kicker', text: '環境音ミキサー' }),
      h('h1', { class: 'hero-title', html: '雨音<em>amaoto</em>' }),
      h('p', {
        class: 'lead',
        text: '雨、波、風、焚き火。鳴らしたい音を選んで重ね、いまの作業や休息にちょうどいい場をつくる。音声ファイルは持たず、すべてその場で合成するので、待ち時間も通信もない。',
      }),
      h('p', { class: 'lead-sub', text: '音を足し、スライダーで濃さを決める。リンクにすれば同じ音をそのまま渡せる。' }),
      h('dl', { class: 'hero-meta' }, [
        h('div', {}, [h('dt', { text: '音源' }), h('dd', { text: `${SOUNDS.length}種` })]),
        h('div', {}, [h('dt', { text: '音声ファイル' }), h('dd', { text: '0' })]),
        h('div', {}, [h('dt', { text: '通信' }), h('dd', { text: '不要' })]),
      ]),
    ]),
    heroBanner(),
  ]);

  const mixerSection = h('section', { class: 'mixer reveal' }, [
    h('div', { class: 'section-head' }, [
      h('div', {}, [
        h('span', { class: 'kicker', html: '<span class="kicker-no">01</span>Layers' }),
        h('h2', { class: 'section-title', text: '音を重ねる' }),
      ]),
      activeLabel,
    ]),
    soundList,
    h('p', { class: 'mixer-hint', text: '数字キー(1〜8)で音を、スペースで一時停止と再開ができる。' }),
  ]);

  const sceneRow = (): HTMLElement => {
    const scenes = h(
      'div',
      { class: 'chips', attrs: { role: 'group', 'aria-label': 'シーン' } },
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
      on: { click: () => applyMixAll(SCENES[Math.floor(Math.random() * SCENES.length)]!.mix) },
    });
    return h('div', { class: 'scene-row' }, [scenes, randomBtn]);
  };

  const scenesSection = h('section', { class: 'scenes reveal' }, [
    h('div', { class: 'section-head' }, [
      h('div', {}, [
        h('span', { class: 'kicker', html: '<span class="kicker-no">02</span>Scenes' }),
        h('h2', { class: 'section-title', text: 'シーン' }),
      ]),
    ]),
    h('p', { class: 'section-note', text: '名前を選ぶと、その場にふさわしい配合をひとそろい呼び出す。' }),
    sceneRow(),
  ]);

  const buildConsole = (): HTMLElement => {
    masterInput.value = String(Math.round(state.mix.master * 100));
    masterValue.textContent = String(Math.round(state.mix.master * 100));
    paintRange(masterInput);
    masterInput.addEventListener('input', () => changeMaster(Number(masterInput.value)));

    const master = h('div', { class: 'master' }, [
      h('div', { class: 'master-top' }, [
        h('span', { class: 'field-label', text: 'マスター音量' }),
        masterValue,
      ]),
      masterInput,
    ]);

    silenceBtn = h('button', {
      class: 'ghost',
      attrs: { type: 'button' },
      html: `${icon('power')}<span>すべて止める</span>`,
      on: { click: () => applyMixAll(silenceAll(state.mix)) },
    });
    silenceBtn.disabled = activeCount(state.mix) === 0;

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
          refreshWave();
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

    return h('div', { class: 'console-grid' }, [
      master,
      h('div', { class: 'console-utils' }, [
        util('スリープ', sleepSelect, sleepStatus),
        util('共有', h('div', { class: 'util-row' }, [shareBtn, shareStatus])),
        util('リセット', silenceBtn),
      ]),
    ]);
  };

  function util(label: string, control: Node, status?: Node): HTMLDivElement {
    const children: (Node | string)[] = [h('span', { class: 'field-label', text: label }), control];
    if (status) children.push(status);
    return h('div', { class: 'util' }, children);
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

  // ---- 保存した音(プリセット) ----

  const presetName = h('input', {
    class: 'field saved-input',
    attrs: { type: 'text', maxlength: 40, placeholder: '例: 夜更けの雨', 'aria-label': '保存する音の名前' },
  }) as HTMLInputElement;
  const savedList = h('div', { class: 'chips saved-list', attrs: { role: 'group', 'aria-label': '保存した音' } });
  const savedEmpty = h('p', {
    class: 'section-note saved-empty',
    text: 'いまの重なりに名前を付けて保存すると、シーンのように呼び戻せる。保存先はこの端末のブラウザ。',
  });

  function savePreset(): void {
    const name = presetName.value.trim();
    if (!name) {
      presetName.focus();
      return;
    }
    presets = upsertPreset(presets, name, encodeMix(state.mix));
    persistPresets(presets);
    presetName.value = '';
    renderPresets();
  }

  function recallPreset(preset: Preset): void {
    const mix = decodeMix(preset.mix);
    if (mix) applyMixAll(mix);
  }

  function deletePreset(name: string): void {
    presets = removePreset(presets, name);
    persistPresets(presets);
    renderPresets();
  }

  function renderPresets(): void {
    savedEmpty.hidden = presets.length > 0;
    savedList.hidden = presets.length === 0;
    savedList.replaceChildren(
      ...presets.map((preset) =>
        h('span', { class: 'preset' }, [
          h('button', {
            class: 'chip preset-recall',
            text: preset.name,
            attrs: { type: 'button', 'aria-label': `「${preset.name}」を呼び出す` },
            on: { click: () => recallPreset(preset) },
          }),
          h('button', {
            class: 'preset-del',
            attrs: { type: 'button', 'aria-label': `「${preset.name}」を削除` },
            html: icon('close', 14),
            on: { click: () => deletePreset(preset.name) },
          }),
        ]),
      ),
    );
  }

  const saveBtn = h('button', {
    class: 'ghost',
    attrs: { type: 'button' },
    html: `${icon('save')}<span>保存</span>`,
    on: { click: savePreset },
  });
  presetName.addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Enter') savePreset();
  });

  const savedSection = h('section', { class: 'saved reveal' }, [
    h('div', { class: 'section-head' }, [
      h('div', {}, [
        h('span', { class: 'kicker', html: '<span class="kicker-no">03</span>Saved' }),
        h('h2', { class: 'section-title', text: '保存した音' }),
      ]),
    ]),
    h('div', { class: 'saved-form' }, [presetName, saveBtn]),
    savedEmpty,
    savedList,
  ]);

  const consoleSection = h('section', { class: 'console reveal' }, [
    h('div', { class: 'section-head' }, [
      h('div', {}, [
        h('span', { class: 'kicker', html: '<span class="kicker-no">04</span>Console' }),
        h('h2', { class: 'section-title', text: '全体の調整' }),
      ]),
    ]),
    buildConsole(),
  ]);

  const footer = h('footer', { class: 'site-footer' }, [
    h('p', {
      class: 'footer-note',
      text: '音はブラウザ内で合成され、外部に送信されない。ミックスはこの端末に保存され、リンクにも畳み込まれる。',
    }),
  ]);

  root.replaceChildren(
    header,
    h('main', { class: 'layout' }, [hero, mixerSection, scenesSection, savedSection, consoleSection, footer]),
  );

  renderSounds();
  renderPresets();
  syncTheme();
  refreshWave();
  observeReveals(root);

  const reducedMQ = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  reducedMQ?.addEventListener?.('change', refreshWave);
  const colorMQ = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;
  colorMQ?.addEventListener?.('change', () => {
    if (theme === 'auto') syncTheme();
  });

  window.addEventListener('keydown', (event) => {
    const target = event.target as HTMLElement | null;
    const tag = target?.tagName;
    const typing = tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA';
    // スペースは全体の一時停止/再開。ボタンやリンクに乗っているときは既定動作に譲る。
    if (event.key === ' ' || event.code === 'Space') {
      if (typing || tag === 'BUTTON' || tag === 'A') return;
      event.preventDefault();
      toggleAll();
      return;
    }
    if (typing) return;
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

// スライダーの「ここまで」を見せるため、値に応じた割合を --fill に書き込む。
// トラックはこの変数で塗り分ける(下位ブラウザでも素のトラックに退化するだけ)。
function paintRange(input: HTMLInputElement): void {
  const max = Number(input.max) || 100;
  const pct = max > 0 ? (Number(input.value) / max) * 100 : 0;
  input.style.setProperty('--fill', `${pct}%`);
}

function svgPath(cls: string): SVGPathElement {
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('class', cls);
  path.setAttribute('fill', 'none');
  return path;
}

// セクションを少し下からそっと立ち上げる。IntersectionObserverが無い環境や
// reduced-motion では即座に表示して、出現演出だけを省く。
function observeReveals(root: HTMLElement): void {
  const reveals = [...root.querySelectorAll<HTMLElement>('.reveal')];
  // 演出する場合だけ「最初は隠す」状態をCSSへ許可する。JSやIntersectionObserverが
  // 無い・reduced-motion のときは何も隠さず、全要素を素のまま見せる。
  if (typeof IntersectionObserver !== 'function' || prefersReducedMotion()) {
    reveals.forEach((el) => el.classList.add('is-in'));
    return;
  }
  document.documentElement.classList.add('anim-ready');
  const io = new IntersectionObserver(
    (entries, obs) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.add('is-in');
          obs.unobserve(e.target);
        }
      }
    },
    { threshold: 0.12, rootMargin: '0px 0px -8% 0px' },
  );
  reveals.forEach((el) => io.observe(el));
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
    `<svg viewBox="0 0 32 32" width="26" height="26" fill="none" aria-hidden="true">` +
    `<path d="M3 16c2.5 0 2.5-5 5-5s2.5 5 5 5 2.5-5 5-5 2.5 5 5 5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />` +
    `<path d="M3 23c2.5 0 2.5-4 5-4s2.5 4 5 4 2.5-4 5-4 2.5 4 5 4" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" opacity="0.5" />` +
    `<path d="M13 4l2 3M19 3l1.5 4M24 6l1 3" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity="0.7" />` +
    `</svg>`
  );
}
