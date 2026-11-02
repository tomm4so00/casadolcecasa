import type { GameValue } from './context.js';
import { game } from './context.js';
import { dom, browser } from './runtime.js';
export function sfx(type?: GameValue): GameValue {
  if (!game.soundOn) return;
  try {
    game.audioCtx = game.audioCtx || new (browser.AudioContext || browser.webkitAudioContext)();
    if (game.audioCtx.state === 'suspended') game.audioCtx.resume();
    const t0: GameValue = game.audioCtx.currentTime;
    const tone: GameValue = (
      freq?: GameValue,
      start?: GameValue,
      dur?: GameValue,
      wave: GameValue = 'sine',
      vol: GameValue = 0.12,
    ): GameValue => {
      const o: GameValue = game.audioCtx.createOscillator(),
        g: GameValue = game.audioCtx.createGain();
      o.type = wave;
      o.frequency.setValueAtTime(freq, t0 + start);
      g.gain.setValueAtTime(vol, t0 + start);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + start + dur);
      o.connect(g);
      g.connect(game.audioCtx.destination);
      o.start(t0 + start);
      o.stop(t0 + start + dur + 0.02);
    };
    const noise: GameValue = (
      start?: GameValue,
      dur?: GameValue,
      vol?: GameValue,
      freq?: GameValue,
    ): GameValue => {
      const n: GameValue = Math.floor(game.audioCtx.sampleRate * dur),
        buf: GameValue = game.audioCtx.createBuffer(1, n, game.audioCtx.sampleRate),
        d: GameValue = buf.getChannelData(0);
      for (let i: GameValue = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      const src: GameValue = game.audioCtx.createBufferSource();
      src.buffer = buf;
      const f: GameValue = game.audioCtx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = freq;
      const g: GameValue = game.audioCtx.createGain();
      g.gain.setValueAtTime(0.001, t0 + start);
      g.gain.linearRampToValueAtTime(vol, t0 + start + 0.25);
      g.gain.setValueAtTime(vol, t0 + start + dur - 0.5);
      g.gain.linearRampToValueAtTime(0.001, t0 + start + dur);
      src.connect(f);
      f.connect(g);
      g.connect(game.audioCtx.destination);
      src.start(t0 + start);
    };
    const sounds: GameValue = {
      shower: (): GameValue => noise(0, 3.6, 0.06, 3200),
      sleep: (): GameValue =>
        [523, 440, 349].forEach(
          (fr?: GameValue, i?: GameValue): GameValue => tone(fr, i * 0.22, 0.4, 'sine', 0.06),
        ),
      wake: (): GameValue =>
        [349, 440, 523].forEach(
          (fr?: GameValue, i?: GameValue): GameValue => tone(fr, i * 0.12, 0.25, 'triangle', 0.06),
        ),
      coin: (): GameValue => {
        tone(988, 0, 0.08, 'square', 0.05);
        tone(1319, 0.08, 0.25, 'square', 0.05);
      },
      success: (): GameValue => {
        tone(523, 0, 0.12);
        tone(659, 0.1, 0.12);
        tone(784, 0.2, 0.25);
      },
      error: (): GameValue => {
        tone(220, 0, 0.15, 'sawtooth', 0.06);
        tone(160, 0.15, 0.2, 'sawtooth', 0.06);
      },
      door: (): GameValue => {
        tone(140, 0, 0.12, 'triangle', 0.18);
        tone(90, 0.08, 0.18, 'triangle', 0.18);
      },
      click: (): GameValue => tone(660, 0, 0.06, 'triangle', 0.05),
      mission: (): GameValue =>
        [523, 659, 784, 1047].forEach(
          (f?: GameValue, i?: GameValue): GameValue => tone(f, i * 0.09, 0.22, 'triangle', 0.1),
        ),
      wardrobe: (): GameValue => {
        tone(180, 0, 0.18, 'triangle', 0.12);
        tone(240, 0.12, 0.22, 'triangle', 0.1);
        tone(320, 0.3, 0.12, 'sine', 0.06);
      },
    };
    (sounds[type] || sounds.click)();
  } catch (e: GameValue) {}
}

export function chordNotes(name?: GameValue): GameValue {
  const m: GameValue = /^([A-G])([b#]?)(m|o)?$/.exec(name);
  let r: GameValue = game.NOTE_IX[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  if (r > 4) r -= 12;
  r += 48;
  return [r, m[3] ? r + 3 : r + 4, m[3] === 'o' ? r + 6 : r + 7];
}

export function musicParse(tr?: GameValue): GameValue {
  if (tr.L) return tr;
  tr.L = tr.melody.join(' ').split(' ');
  tr.C = tr.chords.split(' ').map(chordNotes);
  tr.B = tr.bass.split(' ');
  tr.D = tr.drums.split(' ');
  tr.arpPat = tr.arp || [0, 1, 2, 1, 0, 1, 2, 1];
  return tr;
}

export function musicFor(env?: GameValue): GameValue {
  if (env === 'bar') return 'bar';
  if (env === 'discoteca') return 'disco';
  if (env === 'CIMITERO') return 'grave';
  if (env === 'passeggiata' || env === 'viaggio') return 'outdoor';
  if (typeof env === 'string' && env.indexOf('lavoro_') === 0) return 'work';
  return 'home';
}

export function musicWave(kind?: GameValue): GameValue {
  if (game.MUSIC.waves[kind] && game.MUSIC.ctxRef === game.audioCtx) return game.MUSIC.waves[kind];
  if (game.MUSIC.ctxRef !== game.audioCtx) {
    game.MUSIC.waves = {};
    game.MUSIC.ctxRef = game.audioCtx;
    game.MUSIC.gain = null;
    game.MUSIC.noise = null;
    game.MUSIC.vol = -1;
  }
  const duty: GameValue = kind === 'p125' ? 0.125 : 0.25,
    N: GameValue = 32,
    re: GameValue = new Float32Array(N + 1),
    im: GameValue = new Float32Array(N + 1);
  for (let n: GameValue = 1; n <= N; n++)
    re[n] = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * duty);
  return (game.MUSIC.waves[kind] = game.audioCtx.createPeriodicWave(re, im));
}

export function musicBus(..._args: GameValue[]): GameValue {
  musicWave('p25'); // controlla che il contesto audio sia lo stesso
  if (!game.MUSIC.gain) {
    game.MUSIC.gain = game.audioCtx.createGain();
    game.MUSIC.gain.gain.value = 0;
    game.MUSIC.gain.connect(game.audioCtx.destination);
    game.MUSIC.vol = 0;
  }
  return game.MUSIC.gain;
}

export function mNote(
  freq?: GameValue,
  t?: GameValue,
  dur?: GameValue,
  vol?: GameValue,
  wave?: GameValue,
): GameValue {
  const o: GameValue = game.audioCtx.createOscillator(),
    g: GameValue = game.audioCtx.createGain();
  if (wave === 'triangle' || wave === 'square') o.type = wave;
  else o.setPeriodicWave(musicWave(wave));
  o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.01);
  g.gain.setValueAtTime(vol * 0.75, t + Math.max(0.02, dur * 0.6));
  g.gain.linearRampToValueAtTime(0.0001, t + dur);
  o.connect(g);
  g.connect(musicBus());
  o.start(t);
  o.stop(t + dur + 0.02);
}

export function mDrum(kind?: GameValue, t?: GameValue): GameValue {
  const bus: GameValue = musicBus();
  if (kind === 'k') {
    const o: GameValue = game.audioCtx.createOscillator(),
      g: GameValue = game.audioCtx.createGain();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    g.gain.setValueAtTime(0.32, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    o.connect(g);
    g.connect(bus);
    o.start(t);
    o.stop(t + 0.17);
    return;
  }
  if (!game.MUSIC.noise) {
    const n: GameValue = game.audioCtx.sampleRate | 0,
      b: GameValue = game.audioCtx.createBuffer(1, n, game.audioCtx.sampleRate),
      d: GameValue = b.getChannelData(0);
    for (let i: GameValue = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    game.MUSIC.noise = b;
  }
  const src: GameValue = game.audioCtx.createBufferSource();
  src.buffer = game.MUSIC.noise;
  const f: GameValue = game.audioCtx.createBiquadFilter();
  f.type = 'highpass';
  f.frequency.value = kind === 's' ? 1400 : 7000;
  const g: GameValue = game.audioCtx.createGain(),
    dur: GameValue = kind === 's' ? 0.13 : 0.04,
    vol: GameValue = kind === 's' ? 0.16 : 0.06;
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f);
  f.connect(g);
  g.connect(bus);
  src.start(t);
  src.stop(t + dur + 0.02);
}

export function musicStep(tr?: GameValue, s?: GameValue, t?: GameValue, d?: GameValue): GameValue {
  const bar: GameValue = Math.floor(s / 8) % tr.C.length,
    pos: GameValue = s % 8,
    ch: GameValue = tr.C[bar],
    N: GameValue = tr.L.length;
  const tok: GameValue = tr.L[s];
  if (tok && tok !== '.') {
    let n: GameValue = 1;
    while (tr.L[(s + n) % N] === '.' && n < 16) n++;
    mNote(game.midiHz(game.midiOf(tok)), t, d * n * 0.92, 0.075, tr.lead);
  }
  const ai: GameValue = tr.arpPat[pos];
  if (ai !== null && ai !== undefined) mNote(game.midiHz(ch[ai] + 12), t, d * 0.8, 0.03, 'p125');
  const bt: GameValue = tr.B[pos];
  if (bt && bt !== '.') {
    let n: GameValue = 1;
    while (pos + n < 8 && tr.B[pos + n] === '.') n++;
    const m: GameValue = bt === 'F' ? ch[2] - 12 : bt === 'r' ? ch[0] : ch[0] - 12;
    mNote(game.midiHz(m), t, d * n * 0.9, 0.11, 'triangle');
  }
  const dr: GameValue = tr.D[pos] || '.';
  if (dr.indexOf('k') >= 0) mDrum('k', t);
  if (dr.indexOf('s') >= 0) mDrum('s', t);
  if (dr.indexOf('h') >= 0) mDrum('h', t);
}

export function musicWant(..._args: GameValue[]): GameValue {
  if (!game.musicOn || game.isDead) return null;
  return musicFor(game.activeEnvironment);
}

export function musicTick(..._args: GameValue[]): GameValue {
  try {
    if (!game.audioCtx || game.audioCtx.state !== 'running') return;
    const want: GameValue = musicWant(),
      bus: GameValue = musicBus(),
      now: GameValue = game.audioCtx.currentTime;
    const target: GameValue = want ? (game.isSleeping ? 0.18 : 0.55) : 0;
    if (game.MUSIC.vol !== target) {
      bus.gain.cancelScheduledValues(now);
      bus.gain.setTargetAtTime(target, now, 0.15);
      game.MUSIC.vol = target;
    }
    if (want !== game.MUSIC.cur) {
      game.MUSIC.cur = want;
      game.MUSIC.step = 0;
      game.MUSIC.next = now + 0.08;
    }
    if (!want) return;
    const tr: GameValue = musicParse(game.MUSIC_TRACKS[want]),
      d: GameValue = 60 / tr.bpm / 2;
    if (game.MUSIC.next < now - 0.2) game.MUSIC.next = now + 0.05; // dopo una pausa non recuperare le note perse
    while (game.MUSIC.next < now + 0.3) {
      musicStep(tr, game.MUSIC.step, game.MUSIC.next, d);
      game.MUSIC.next += d;
      game.MUSIC.step = (game.MUSIC.step + 1) % (tr.C.length * 8);
    }
  } catch (e: GameValue) {}
}

export function musicUnlock(..._args: GameValue[]): GameValue {
  if (!game.musicOn) return;
  try {
    game.audioCtx = game.audioCtx || new (browser.AudioContext || browser.webkitAudioContext)();
    if (game.audioCtx.state === 'suspended') game.audioCtx.resume();
  } catch (e: GameValue) {}
}

export function updateMusicButton(..._args: GameValue[]): GameValue {
  const b: GameValue = dom('btn-music');
  if (!b) return;
  b.style.opacity = game.musicOn ? '1' : '0.4';
  b.title = game.musicOn
    ? 'Musica: accesa (tocca per spegnerla)'
    : 'Musica: spenta (tocca per accenderla)';
}

export function toggleMusic(..._args: GameValue[]): GameValue {
  game.musicOn = !game.musicOn;
  try {
    localStorage.setItem(game.LS_PREFIX + 'sims_music', game.musicOn ? 'on' : 'off');
  } catch (e: GameValue) {}
  updateMusicButton();
  if (game.musicOn) musicUnlock();
}

export function updateSoundButton(..._args: GameValue[]): GameValue {
  dom('btn-sound').textContent = game.soundOn ? '🔊' : '🔇';
  updateMusicButton();
}

export function toggleSound(..._args: GameValue[]): GameValue {
  game.soundOn = !game.soundOn;
  try {
    localStorage.setItem(game.LS_PREFIX + 'sims_sound', game.soundOn ? 'on' : 'off');
  } catch (e: GameValue) {}
  updateSoundButton();
  if (game.soundOn) sfx('click');
}
