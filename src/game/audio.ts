import type { GameValue } from './context.js';
import { game } from './context.js';
import { dom, browser } from './runtime.js';
import { musicFor } from './music-rules.js';
export { musicFor };
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
    // una nota per nome (es. 'C5', 'F#4'), più comoda delle frequenze per le melodie
    const note = (
      name: string,
      start: number,
      dur: number,
      wave: GameValue = 'triangle',
      vol = 0.08,
    ): void => tone(game.midiHz(game.midiOf(name)), start, dur, wave, vol);
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
      // il cane abbaia due volte: un colpo secco che scende, con un po' di fruscio
      bark: (): void => {
        for (const at of [0, 0.32]) {
          tone(520, at, 0.09, 'square', 0.05);
          tone(330, at + 0.04, 0.12, 'sawtooth', 0.05);
          noise(at, 0.1, 0.03, 900);
        }
      },
      // fischio al cane: due note che salgono, la seconda più lunga
      whistle: (): void => {
        for (const [start, from, to, dur] of [
          [0, 1500, 2300, 0.22],
          [0.3, 1600, 2700, 0.4],
        ]) {
          const o = game.audioCtx.createOscillator(),
            g = game.audioCtx.createGain();
          o.type = 'sine';
          o.frequency.setValueAtTime(from, t0 + start);
          o.frequency.linearRampToValueAtTime(to, t0 + start + dur);
          g.gain.setValueAtTime(0.001, t0 + start);
          g.gain.linearRampToValueAtTime(0.09, t0 + start + 0.04);
          g.gain.exponentialRampToValueAtTime(0.001, t0 + start + dur);
          o.connect(g);
          g.connect(game.audioCtx.destination);
          o.start(t0 + start);
          o.stop(t0 + start + dur + 0.02);
        }
      },
      mission: (): GameValue =>
        [523, 659, 784, 1047].forEach(
          (f?: GameValue, i?: GameValue): GameValue => tone(f, i * 0.09, 0.22, 'triangle', 0.1),
        ),
      // guarnizione che si stacca, poi il ronzio del motore
      fridgeOpen: (): GameValue => {
        tone(320, 0, 0.05, 'triangle', 0.08);
        tone(130, 0.03, 0.12, 'triangle', 0.1);
        tone(58, 0.1, 0.7, 'sine', 0.05);
      },
      // tonfo morbido della porta che si chiude
      fridgeClose: (): GameValue => {
        tone(110, 0, 0.12, 'triangle', 0.2);
        tone(70, 0.04, 0.22, 'sine', 0.16);
      },
      // schiocco del bacio, poi un carillon romantico che sale e un accordo morbido
      kiss: (): GameValue => {
        duckMusic(2.4);
        tone(1400, 0, 0.04, 'sine', 0.08);
        tone(900, 0.03, 0.06, 'triangle', 0.06);
        note('G5', 0.15, 0.3, 'sine', 0.06);
        note('B5', 0.3, 0.3, 'sine', 0.06);
        note('D6', 0.45, 0.3, 'sine', 0.06);
        note('G6', 0.6, 0.5, 'sine', 0.05);
        ['G4', 'B4', 'D5', 'F#5'].forEach((n) => note(n, 0.6, 1.4, 'triangle', 0.035));
        note('B6', 1.0, 0.6, 'sine', 0.03);
      },
      // furto riuscito: passi in punta di piedi, poi il "cha-ching" del registratore di cassa
      theft: (): GameValue => {
        duckMusic(2.2);
        ['E3', 'G3', 'B3', 'D#4'].forEach((n, i) => note(n, i * 0.16, 0.08, 'square', 0.05));
        noise(0.62, 0.75, 0.03, 2600);
        note('C7', 0.7, 0.12, 'square', 0.04);
        note('E7', 0.78, 0.45, 'sine', 0.07);
        note('G6', 0.78, 0.45, 'sine', 0.05);
        ['C5', 'E5', 'G5'].forEach((n) => note(n, 1.05, 0.6, 'triangle', 0.05));
      },
      // la propria cassaforte svuotata: sirena d'allarme
      robbed: (): GameValue => {
        duckMusic(2.4);
        for (let i = 0; i < 4; i++) {
          tone(880, i * 0.42, 0.2, 'sawtooth', 0.04);
          tone(660, i * 0.42 + 0.21, 0.2, 'sawtooth', 0.04);
        }
      },
      // si sale di livello: arpeggio che sale e scintille
      levelUp: (): GameValue => {
        duckMusic(2.4);
        ['C5', 'E5', 'G5', 'C6'].forEach((n, i) => note(n, i * 0.08, 0.2, 'triangle', 0.09));
        ['C5', 'E5', 'G5'].forEach((n) => note(n, 0.34, 0.9, 'square', 0.03));
        note('C6', 0.34, 0.9, 'triangle', 0.07);
        note('E6', 0.55, 0.25, 'sine', 0.05);
        note('G6', 0.68, 0.25, 'sine', 0.05);
        note('C7', 0.82, 0.5, 'sine', 0.04);
      },
      // si diventa una personalità: fanfara
      personality: (): GameValue => {
        duckMusic(3);
        note('G4', 0, 0.12, 'square', 0.06);
        note('G4', 0.14, 0.08, 'square', 0.06);
        note('G4', 0.24, 0.08, 'square', 0.06);
        note('C5', 0.34, 0.6, 'square', 0.06);
        ['C4', 'E4', 'G4'].forEach((n) => note(n, 0.34, 0.6, 'triangle', 0.06));
        note('E5', 0.95, 0.15, 'triangle', 0.08);
        note('G5', 1.1, 0.15, 'triangle', 0.08);
        note('C6', 1.25, 0.9, 'triangle', 0.09);
        ['C5', 'E5', 'G5'].forEach((n) => note(n, 1.25, 1.1, 'sine', 0.04));
      },
      // proposta di cambiare personalità: accordi misteriosi
      switchOffer: (): GameValue => {
        duckMusic(2);
        ['C5', 'F#5', 'A5'].forEach((n, i) => note(n, i * 0.18, 0.5, 'triangle', 0.06));
        ['D5', 'G#5', 'B5'].forEach((n, i) => note(n, 0.7 + i * 0.12, 0.7, 'sine', 0.05));
      },
      // qualcuno diventa tuo amico: due note calde
      friend: (): GameValue => {
        duckMusic(1.4);
        note('C5', 0, 0.35, 'triangle', 0.08);
        note('A5', 0.18, 0.6, 'triangle', 0.08);
        note('E5', 0.18, 0.6, 'sine', 0.04);
      },
      // qualcuno diventa tuo nemico: accordo stonato e cupo
      enemy: (): GameValue => {
        duckMusic(1.4);
        tone(110, 0, 0.7, 'sawtooth', 0.05);
        tone(116.5, 0, 0.7, 'sawtooth', 0.05);
        tone(55, 0, 0.5, 'triangle', 0.12);
        note('D#4', 0.3, 0.5, 'square', 0.03);
      },
      // "si parla di te": un "uh-oh" pettegolo
      gossip: (): GameValue => {
        note('G5', 0, 0.16, 'sine', 0.08);
        note('E5', 0.18, 0.3, 'sine', 0.08);
        note('D#5', 0.36, 0.2, 'triangle', 0.04);
      },
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

/** Abbassa la musica per qualche secondo, così si sente bene un effetto importante. */
function duckMusic(seconds: number): void {
  if (!game.audioCtx) return;
  game.MUSIC.duckUntil = game.audioCtx.currentTime + seconds;
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
  if (!game.musicOn || game.player.isDead) return null;
  return musicFor(game.view.activeEnvironment);
}

export function musicTick(..._args: GameValue[]): GameValue {
  try {
    if (!game.audioCtx || game.audioCtx.state !== 'running') return;
    const want: GameValue = musicWant(),
      bus: GameValue = musicBus(),
      now: GameValue = game.audioCtx.currentTime;
    let target: GameValue = want ? (game.player.isSleeping ? 0.18 : 0.55) : 0;
    // durante un effetto importante (bacio, furto, livello…) la musica si abbassa
    if (target && (game.MUSIC.duckUntil || 0) > now) target = Math.round(target * 25) / 100;
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
    localStorage.setItem(game.session.LS_PREFIX + 'sims_music', game.musicOn ? 'on' : 'off');
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
    localStorage.setItem(game.session.LS_PREFIX + 'sims_sound', game.soundOn ? 'on' : 'off');
  } catch (e: GameValue) {}
  updateSoundButton();
  if (game.soundOn) sfx('click');
}
