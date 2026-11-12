import type { WorkHost } from './work-model.js';
// Turno in ospedale: due pazienti nei letti chiedono ognuno una cura. Le quattro postazioni sono
// fisse: il monitor dei parametri e i farmaci si prendono in mano e si portano al letto (flusso A);
// i carrelli delle medicazioni e della biancheria si spingono fino al letto, si lasciano accanto
// e poi si sceglie cosa fare (flusso B). A metà turno può scattare il codice rosso: si corre al
// letto col defibrillatore. Le regole stanno in hospital-rules.ts.
import type { GameValue } from './context.js';
import { game } from './context.js';
import { sfx } from './audio.js';
import { botLook } from './character.js';
import { openDialog } from './interface.js';
import { dom } from './runtime.js';
import { drawAvatarSleeping } from './render/avatars.js';
import { isoProject, isoScale } from './render/primitives.js';
import { drawDefibrillator, drawHeldDrug, drawPortableMonitor } from './render/workplaces.js';
import {
  ACTIONS,
  type ActionId,
  CODE_RED,
  CURED_SECONDS,
  type Hands,
  STATIONS,
  type StationId,
  canUseStation,
  choicesAtBed,
  codeRedAt,
  codeRedBonus,
  codeRedPenalty,
  droppedForDefib,
  handsAfterCare,
  needFor,
  rightCare,
} from './hospital-rules.js';

type Pt = { x: number; y: number };

const NAMES = ['Rosa', 'Bruno', 'Ada', 'Ettore', 'Nina', 'Aldo', 'Irma', 'Guido', 'Lia', 'Ugo'];

interface Patient {
  bed: GameValue;
  look: GameValue;
  need: ActionId | null;
  /** secondi in cui sorride dopo la cura, prima di chiedere altro */
  cured: number;
  /** quando scatta il suo codice rosso (secondi dall'inizio del turno), o null */
  redAt: number | null;
  /** secondi rimasti per la scarica (> 0 solo durante il codice rosso) */
  red: number;
  /** il lampo della scarica appena data (secondi) */
  shock: number;
}

interface Shift {
  patients: Patient[];
  hands: Hands;
  /** le postazioni (oggetti di scena: monitor e carrelli si spostano) e dove stanno di solito */
  props: Record<StationId, GameValue>;
  home: Record<StationId, Pt>;
  /** il defibrillatore sulla sua colonnina */
  defib: GameValue | null;
  /** secondi passati dall'inizio del turno */
  clock: number;
  /** verso cui si cammina: il carrello spinto sta davanti */
  facing: Pt;
  last: Pt;
  /** un menu di scelta è aperto: il pulsante non fa nulla */
  choosing: boolean;
  /** carrello appena lasciato accanto al letto: diventa solido quando ci si allontana */
  parked: StationId | null;
  cured: number;
  t: number;
}

let hs: Shift | null = null;

export const hospitalOn = (): boolean => !!hs;

/** Distanza tra chi spinge e il centro del carrello. */
const PUSH_GAP = 26;
/** Durata del lampo della scarica. */
const SHOCK_FLASH = 0.7;

let host: WorkHost;

export function startHospital(controller: WorkHost): void {
  host = controller;
  const props = (game.ENV_PROPS[game.view.activeEnvironment] || []) as GameValue[];
  const beds = props
    .filter((p) => p.kind === 'hospitalBed')
    .sort((a, b) => (a.bed ?? 0) - (b.bed ?? 0));
  const byStation = {} as Record<StationId, GameValue>;
  const home = {} as Record<StationId, Pt>;
  let defib: GameValue | null = null;
  for (const p of props) {
    if (p.station === 'defib') defib = p;
    else if (p.station) {
      byStation[p.station as StationId] = p;
      home[p.station as StationId] = { x: p.x, y: p.y };
    }
  }
  const first = Math.floor(Math.random() * NAMES.length);
  // il codice rosso si decide all'inizio, per ogni paziente da solo
  const patients: Patient[] = beds.map((bed, i) => ({
    bed,
    look: botLook('Paziente ' + NAMES[(first + i * 3) % NAMES.length]),
    need: null,
    cured: 0,
    redAt: codeRedAt(Math.random(), Math.random()),
    red: 0,
    shock: 0,
  }));
  for (const p of patients)
    p.need = needFor(
      Math.random(),
      patients.map((o) => o.need),
    );
  hs = {
    patients,
    hands: { kind: 'empty' },
    props: byStation,
    home,
    defib,
    clock: 0,
    facing: { x: 0, y: -1 },
    last: { x: game.playerPos.x, y: game.playerPos.y },
    choosing: false,
    parked: null,
    cured: 0,
    t: 0,
  };
  game.MG.carry = null;
  game.MG.el?.classList.add('mg-wide');
  // nel riepilogo di fine turno la penalità non è una multa del capo
  if (game.activeShift) game.activeShift.fineLabel = 'di penalità per i codici rossi';
  rebuildMap();
  host.hud();
}

/** Fine turno: monitor, carrelli e defibrillatore tornano al loro posto per il turno dopo. */
export function stopHospital(): void {
  game.MG.el?.classList.remove('mg-wide', 'mg-code-red');
  if (!hs) return;
  for (const st of Object.keys(hs.props) as StationId[]) {
    const p = hs.props[st];
    p.x = hs.home[st].x;
    p.y = hs.home[st].y;
    p.solid = undefined;
    p.empty = false;
  }
  if (hs.defib) hs.defib.empty = false;
  hs = null;
}

const patientName = (i: number): string => `Paziente ${i + 1}`;
const inCodeRed = (p: Patient): boolean => p.red > 0;

/** Gli oggetti vicino a cui compare il pulsante: postazioni, letti e il carrello che si spinge. */
function rebuildMap(): void {
  const s = hs;
  if (!s) return;
  const map: GameValue = {};
  for (const st of Object.keys(s.props) as StationId[]) {
    const p = s.props[st];
    const pushing = s.hands.kind === 'cart' && s.hands.station === st;
    map['hs_' + st] = {
      hosp: pushing ? 'release' : 'station',
      station: st,
      x: p.x,
      y: p.y,
      w: p.w,
      h: p.h,
      name: '',
      // il carrello spinto è sempre vicino: vince il letto, se ce n'è uno a portata
      reach: pushing ? -30 : st === 'farmaci' ? 18 : 8,
    };
  }
  if (s.defib)
    map.hs_defib = {
      hosp: 'defib',
      x: s.defib.x,
      y: s.defib.y,
      w: s.defib.w,
      h: s.defib.h,
      name: '',
      reach: 10,
    };
  s.patients.forEach((pt, i) => {
    const b = pt.bed;
    map['hb_' + i] = {
      hosp: 'bed',
      idx: i,
      x: b.x,
      y: b.y,
      w: b.w,
      h: b.h,
      name: '',
      reach: 34,
    };
  });
  game.MG.map = map;
}

/** Il menu di scelta aperto si chiude: è scattato un codice rosso. */
function closeChoice(): void {
  if (!hs?.choosing || !game.dialogResolve) return;
  dom('dialog-modal').classList.add('hidden');
  const resolve = game.dialogResolve;
  game.dialogResolve = null;
  resolve({ action: null, value: '' });
}

/**
 * A ogni fotogramma: codici rossi che scattano e scadono, pazienti che tornano a chiedere,
 * carrello che segue chi lo spinge.
 */
export function tickHospital(delta: number): void {
  const s = hs;
  if (!s) return;
  s.clock += delta;
  let hud = false;
  const shift = game.activeShift;
  const perItem: number = shift?.perItem ?? 0;
  s.patients.forEach((p, i) => {
    if (p.shock > 0) p.shock -= delta;
    // scatta il codice rosso
    if (p.redAt !== null && s.clock >= p.redAt) {
      p.redAt = null;
      p.red = CODE_RED.seconds;
      closeChoice();
      sfx('alarm');
      host.pop(`🚨 Codice rosso: ${patientName(i)}!`, false);
      hud = true;
      return;
    }
    if (inCodeRed(p)) {
      p.red -= delta;
      if (p.red <= 0) {
        // tempo scaduto: interviene la rianimazione, ma la cura è persa
        p.red = 0;
        const fine = codeRedPenalty(perItem);
        if (shift) shift.fine = (shift.fine || 0) + fine;
        host.score(-1);
        sfx('error');
        host.pop(`🚑 Tempo scaduto per ${patientName(i)} · −${fine} Đ`, false);
        hud = true;
      }
      return;
    }
    if (p.need || p.cured <= 0) return;
    p.cured -= delta;
    if (p.cured <= 0) {
      p.need = needFor(
        Math.random(),
        s.patients.map((o) => o.need),
      );
      hud = true;
    }
  });
  // verso di marcia: da come si è spostato il giocatore
  const dx = game.playerPos.x - s.last.x,
    dy = game.playerPos.y - s.last.y;
  const d = Math.hypot(dx, dy);
  if (d > 0.4) s.facing = { x: dx / d, y: dy / d };
  s.last = { x: game.playerPos.x, y: game.playerPos.y };
  if (s.hands.kind === 'cart') {
    const p = s.props[s.hands.station];
    const tx = game.playerPos.x + s.facing.x * PUSH_GAP,
      ty = game.playerPos.y + s.facing.y * PUSH_GAP;
    const k = Math.min(1, delta * 12);
    p.x = clamp(p.x + (tx - p.x) * k, game.X0 + p.w / 2 + 4, game.X1 - p.w / 2 - 4);
    p.y = clamp(p.y + (ty - p.y) * k, game.Y0 + p.h / 2 + 4, game.Y1 - p.h / 2 - 4);
  }
  // il carrello lasciato accanto al letto torna un ostacolo appena ci si allontana
  if (s.parked) {
    const p = s.props[s.parked];
    if (Math.hypot(game.playerPos.x - p.x, game.playerPos.y - p.y) > 34) {
      p.solid = undefined;
      s.parked = null;
    }
  }
  rebuildMap();
  if (hud) host.hud();
  updateRedHud(s);
}

/** Durante il codice rosso il riquadro lampeggia e i secondi scendono (senza riscriverlo tutto). */
function updateRedHud(s: Shift): void {
  const red = s.patients.some(inCodeRed);
  game.MG.el?.classList.toggle('mg-code-red', red);
  s.patients.forEach((p, i) => {
    const el = dom('hs-red-' + i);
    if (el) el.textContent = secs(p.red);
  });
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

const actionText = (a: ActionId): string => `${ACTIONS[a].e} ${ACTIONS[a].label}`;

/** Cosa si ha in mano, per i pulsanti e il riquadro. */
function handsText(h: Hands): string {
  if (h.kind === 'monitor') return '🖥️ Monitor';
  if (h.kind === 'defib') return '⚡ Defibrillatore';
  if (h.kind === 'drug') return actionText(h.drug);
  if (h.kind === 'cart') return `🛒 ${STATIONS[h.station].label}`;
  return '';
}

/** Testo del pulsante vicino a una postazione, a un letto o al carrello che si spinge. */
export function hospitalPrompt(item: GameValue): { text: string; locked?: boolean } {
  const s = hs;
  if (!s) return { text: '', locked: true };
  const h = s.hands;
  if (item.hosp === 'release') return { text: 'Lascia' };
  if (item.hosp === 'defib') return { text: h.kind === 'defib' ? 'Riponi' : 'Prendi' };
  if (item.hosp === 'station') {
    const st: StationId = item.station;
    if (!canUseStation(h, st))
      return { text: h.kind === 'cart' ? 'Prima lascia' : 'Mani occupate', locked: true };
    if (h.kind === 'monitor' || h.kind === 'drug') return { text: 'Riponi' };
    if (st === 'monitor') return { text: 'Prendi' };
    if (st === 'farmaci') return { text: 'Apri' };
    return { text: 'Spingi' };
  }
  const p = s.patients[item.idx];
  if (!p) return { text: '', locked: true };
  if (inCodeRed(p))
    return h.kind === 'defib'
      ? { text: 'Scarica' }
      : { text: 'Serve defibrillatore', locked: true };
  if (h.kind === 'defib') return { text: 'Non serve', locked: true };
  if (!p.need) return { text: 'Sta bene', locked: true };
  if (h.kind === 'monitor') return { text: 'Misura' };
  if (h.kind === 'drug') return { text: 'Somministra' };
  if (h.kind === 'cart') return { text: 'Assisti' };
  return { text: 'Prima prendi', locked: true };
}

/** Menu di scelta (le voci del monitor, dell'armadio o del carrello). */
async function choose(title: string, text: string, actions: ActionId[]): Promise<ActionId | null> {
  if (!hs) return null;
  hs.choosing = true;
  try {
    const res = await openDialog({
      title,
      text,
      buttons: [
        ...actions.map((a) => ({ label: actionText(a), value: a as string, wide: true })),
        { label: 'Annulla', value: null, color: '#57606f' },
      ],
    });
    return (res.action as ActionId | null) || null;
  } finally {
    if (hs) hs.choosing = false;
  }
}

/** Pulsante premuto vicino a una postazione, a un letto o al carrello che si spinge. */
export async function hospitalInteract(item: GameValue): Promise<void> {
  const s = hs;
  if (!s || s.choosing) return;
  if (item.hosp === 'release') {
    // il carrello resta dov'è
    if (s.hands.kind === 'cart') {
      s.parked = s.hands.station;
      s.hands = { kind: 'empty' };
    }
    sfx('door');
    host.hud();
    return;
  }
  if (item.hosp === 'defib') return useDefib(s);
  if (item.hosp === 'station') return useStation(s, item.station);
  return careAtBed(s, item.idx);
}

/**
 * Prende il defibrillatore (posando subito quello che si ha in mano: è un'emergenza) o lo
 * rimette sulla colonnina.
 */
function useDefib(s: Shift): void {
  const d = s.defib;
  if (!d) return;
  const h = s.hands;
  if (h.kind === 'defib') {
    s.hands = { kind: 'empty' };
    d.empty = false;
    sfx('door');
    host.hud();
    return;
  }
  const dropped = droppedForDefib(h);
  if (dropped === 'monitor') s.props.monitor.empty = false;
  else if (dropped === 'cart' && h.kind === 'cart') s.parked = h.station;
  if (dropped) host.pop(`🤲 Hai posato ${handsText(h)}`);
  s.hands = { kind: 'defib' };
  d.empty = true;
  sfx('door');
  host.hud();
}

async function useStation(s: Shift, st: StationId): Promise<void> {
  const h = s.hands;
  if (!canUseStation(h, st)) {
    sfx('error');
    host.pop(
      h.kind === 'cart' ? '🛒 Prima lascia il carrello' : `🤲 Hai già in mano ${handsText(h)}`,
      false,
    );
    return;
  }
  const p = s.props[st];
  if (h.kind === 'monitor' || h.kind === 'drug') {
    // si rimette a posto
    s.hands = { kind: 'empty' };
    if (h.kind === 'monitor') p.empty = false;
    sfx('door');
    host.hud();
    return;
  }
  if (st === 'monitor') {
    s.hands = { kind: 'monitor' };
    p.empty = true;
  } else if (st === 'farmaci') {
    const drug = await choose(
      '💊 Armadio dei farmaci',
      'Quale farmaco prendi?',
      STATIONS.farmaci.actions,
    );
    if (!drug || hs !== s || s.hands.kind !== 'empty') return;
    s.hands = { kind: 'drug', drug };
  } else {
    // si comincia a spingere il carrello: finché lo si spinge non è un ostacolo
    s.hands = { kind: 'cart', station: st };
    p.solid = false;
    if (s.parked === st) s.parked = null;
  }
  sfx('door');
  host.hud();
}

/** Accanto al letto, dal lato del paravento (destra): dove si lascia il carrello. */
function bedSide(bed: GameValue, cart: GameValue): Pt {
  return { x: bed.x + bed.w / 2 + cart.w / 2 + 6, y: bed.y + bed.h * 0.2 };
}

/** La scarica col defibrillatore: il paziente si salva e la paga ha il doppio di una cura. */
function shockPatient(p: Patient, idx: number): void {
  const shift = game.activeShift;
  const bonus = codeRedBonus(shift?.perItem ?? 0);
  if (shift) shift.tips = (shift.tips || 0) + bonus;
  p.red = 0;
  p.shock = SHOCK_FLASH;
  host.score(2);
  sfx('shock');
  host.pop(`⚡ ${patientName(idx)} salvato! +${bonus} Đ`);
  host.hud();
}

async function careAtBed(s: Shift, idx: number): Promise<void> {
  const p = s.patients[idx];
  if (!p) return;
  const who = patientName(idx);
  const h = s.hands;
  if (inCodeRed(p)) {
    if (h.kind === 'defib') shockPatient(p, idx);
    else {
      sfx('error');
      host.pop(`🚨 Prendi il defibrillatore!`, false);
    }
    return;
  }
  if (h.kind === 'defib') {
    host.pop(`💚 ${who} non è in codice rosso`, false);
    return;
  }
  if (!p.need) return;
  let done: ActionId | null = null;
  if (h.kind === 'empty') {
    host.pop(`${who}: ${actionText(p.need)}`, false);
    return;
  }
  if (h.kind === 'drug') done = h.drug;
  else if (h.kind === 'monitor')
    done = await choose(`🖥️ ${who}`, 'Quale parametro misuri?', choicesAtBed(h));
  else {
    // flusso B: il carrello si lascia accanto al letto, poi si sceglie cosa fare
    const cart = s.props[h.station];
    const at = bedSide(p.bed, cart);
    cart.x = at.x;
    cart.y = at.y;
    s.hands = { kind: 'empty' };
    s.parked = h.station;
    sfx('door');
    host.hud();
    done = await choose(`${STATIONS[h.station].e} ${who}`, 'Cosa fai?', choicesAtBed(h));
  }
  // nel frattempo il turno può essere finito, il paziente già curato o in codice rosso
  if (!done || hs !== s || !p.need || inCodeRed(p)) return;
  if (!rightCare(p.need, done)) {
    host.score(-0.5);
    sfx('error');
    host.pop(`❌ ${who} aveva bisogno di: ${actionText(p.need)}`, false);
    host.hud();
    return;
  }
  const shift = game.activeShift;
  const perItem: number = shift?.perItem ?? 0;
  if (shift) shift.delivered = (shift.delivered || 0) + 1;
  s.hands = handsAfterCare(s.hands);
  p.need = null;
  p.cured = CURED_SECONDS;
  s.cured++;
  host.score(1);
  sfx('coin');
  host.pop(`✅ ${reading(done)} · +${perItem} Đ`);
  host.hud();
}

/** Quello che si legge sul monitor (o si è fatto): per la scritta che sale dal riquadro. */
function reading(a: ActionId): string {
  const r = Math.random();
  if (a === 'temperatura') return `🌡️ ${(36.4 + r * 2.6).toFixed(1).replace('.', ',')} °C`;
  if (a === 'pressione') return `🩺 ${Math.round(110 + r * 35)}/${Math.round(70 + r * 20)}`;
  if (a === 'saturazione') return `💨 ${Math.round(92 + r * 7)}%`;
  return actionText(a);
}

/** Riquadro in basso: cosa chiede ogni paziente e cosa si ha in mano. */
export function hospitalHud(): string {
  const s = hs;
  if (!s) return '';
  // ogni paziente resta su una riga sua: il testo non va a capo a metà
  const line = s.patients
    .map((p, i) => {
      const what = inCodeRed(p)
        ? `<span class="mg-red">🚨 CODICE ROSSO <b id="hs-red-${i}">${secs(p.red)}</b> s</span>`
        : p.need
          ? actionText(p.need)
          : '<span class="held">😊 curato</span>';
      return `<span class="mg-pt">${patientName(i)}: ${what}</span>`;
    })
    .join('<span class="mg-sep">|</span>');
  const h = handsText(s.hands);
  const red = s.patients.some(inCodeRed);
  // ai primi turni si dice anche dove si trova quello che serve
  const hint = red
    ? s.hands.kind === 'defib'
      ? '⚡ Corri al letto e avvia la scarica!'
      : '⚡ Prendi il defibrillatore e corri al letto!'
    : (game.player.stats.shifts || 0) < 3 && s.hands.kind === 'empty'
      ? s.patients
          .filter((p) => p.need)
          .map((p) => `${ACTIONS[p.need!].e} → ${STATIONS[ACTIONS[p.need!].station].label}`)
          .join(' · ')
      : '';
  const sub = red ? hint : h ? `<span class="held">🤲 ${h}</span>` : hint;
  return (
    `<div class="mg-step mg-patients">${line}</div>` +
    (sub ? `<div class="mg-sub">${sub}</div>` : '')
  );
}

/** Secondi rimasti, con un decimale e la virgola. */
const secs = (n: number): string => Math.max(0, n).toFixed(1).replace('.', ',');

// ---------------------------------------------------------------- disegno

/** Pazienti nei letti con il fumetto della richiesta, e quello che si ha in mano. */
export function hospitalDrawables(drawables: GameValue[], t: number): void {
  const s = hs;
  if (!s) return;
  s.t = t;
  s.patients.forEach((p, i) => {
    const b = p.bed;
    // il pavimento intorno al letto lampeggia di rosso durante il codice rosso
    if (inCodeRed(p)) drawables.push({ depth: -1e5 + 3, draw: () => drawRedZone(b, t) });
    drawables.push({
      depth: b.x + b.y + 1,
      draw: () => {
        drawAvatarSleeping(
          b.x,
          b.y,
          '',
          t,
          p.look,
          '',
          1,
          { x: b.x, y: b.y, w: b.w, h: b.h, color: '#2ecc71', topColor: '#7bed9f' },
          null,
          { lift: 35, blanketZ: 33, awake: true },
        );
        if (p.shock > 0) drawShockFlash(b, p.shock / SHOCK_FLASH);
      },
    });
    drawables.push({ depth: 1e9 - 1, draw: () => drawPatientBubble(p, i, t) });
  });
  const h = s.hands;
  if (h.kind === 'monitor' || h.kind === 'drug' || h.kind === 'defib') {
    const px = game.playerPos.x,
      py = game.playerPos.y;
    drawables.push({
      depth: px + py + 0.3,
      draw: () => {
        // tenuto davanti, all'altezza delle mani
        if (h.kind === 'monitor') drawPortableMonitor(px + 7, py + 7, 24, t, 0.75);
        else if (h.kind === 'defib') drawDefibrillator(px + 7, py + 7, 24, t, 0.75);
        else drawHeldDrug(px + 8, py + 8, 27, h.drug);
      },
    });
  }
}

/** Codice rosso: un'area rossa che pulsa sul pavimento intorno al letto. */
function drawRedZone(b: GameValue, t: number): void {
  const ctx = game.view.ctx;
  const s = isoScale();
  const c = isoProject(b.x, b.y, 0);
  const k = 0.5 + 0.5 * Math.sin(t * 10);
  const rx = (b.w / 2 + b.h / 2 + 22) * 0.87 * s;
  ctx.save();
  ctx.fillStyle = `rgba(231,76,60,${0.12 + 0.18 * k})`;
  ctx.strokeStyle = `rgba(231,76,60,${0.6 + 0.4 * k})`;
  ctx.lineWidth = 3 * s;
  ctx.beginPath();
  ctx.ellipse(c.x, c.y, rx, rx * 0.5, 0, 0, 6.3);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/** La scarica: un lampo bianco-giallo sul petto e due saette che si allargano. */
function drawShockFlash(b: GameValue, k: number): void {
  const ctx = game.view.ctx;
  const s = isoScale();
  const c = isoProject(b.x, b.y - b.h * 0.1, 40);
  ctx.save();
  ctx.globalAlpha = Math.max(0, k);
  const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, 40 * s);
  g.addColorStop(0, 'rgba(255,255,255,0.95)');
  g.addColorStop(0.4, 'rgba(255,234,167,0.7)');
  g.addColorStop(1, 'rgba(255,234,167,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(c.x, c.y, 40 * s, 0, 6.3);
  ctx.fill();
  ctx.strokeStyle = '#fdcb6e';
  ctx.lineWidth = 2 * s;
  for (const dir of [-1, 1]) {
    const r = (1 - k) * 18 * s + 10 * s;
    ctx.beginPath();
    ctx.moveTo(c.x + dir * r, c.y - 12 * s);
    ctx.lineTo(c.x + dir * (r + 6 * s), c.y - 3 * s);
    ctx.lineTo(c.x + dir * (r + 2 * s), c.y - 2 * s);
    ctx.lineTo(c.x + dir * (r + 8 * s), c.y + 8 * s);
    ctx.stroke();
  }
  ctx.restore();
}

/** Ai piedi del letto: il nome e la richiesta (o il sorriso appena curato, o il codice rosso). */
function drawPatientBubble(p: Patient, i: number, t: number): void {
  const ctx = game.view.ctx;
  const s: number = isoScale();
  const b = p.bed;
  const red = inCodeRed(p);
  const bob = red ? 0 : Math.sin(t * 3 + i) * 1.5;
  // ai piedi del letto: sopra la testa finirebbe sotto i pulsanti in cima allo schermo
  const at = isoProject(b.x - b.w * 0.2, b.y + b.h * 0.4, 58 + bob);
  const text = red ? `🚨 ${secs(p.red)} s` : p.need ? ACTIONS[p.need].e : '😊';
  const name = red ? 'CODICE ROSSO' : patientName(i);
  const blink = red && Math.sin(t * 10) > 0;
  ctx.save();
  ctx.font = `bold ${Math.round(10 * s)}px sans-serif`;
  const nw = ctx.measureText(name).width;
  ctx.font = red ? `bold ${Math.round(13 * s)}px sans-serif` : `${Math.round(16 * s)}px serif`;
  const ew = ctx.measureText(text).width;
  const w = Math.max(nw, ew) + 14 * s,
    hgt = 36 * s,
    x = at.x - w / 2,
    y = at.y - hgt;
  ctx.fillStyle = red
    ? blink
      ? 'rgba(231,76,60,0.97)'
      : 'rgba(192,57,43,0.97)'
    : p.need
      ? 'rgba(255,255,255,0.95)'
      : 'rgba(210,255,225,0.95)';
  ctx.strokeStyle = red ? '#ffffff' : p.need ? 'rgba(22,160,133,0.9)' : 'rgba(46,213,115,0.9)';
  ctx.lineWidth = 1.5 * s;
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(x, y, w, hgt, 8 * s) : ctx.rect(x, y, w, hgt);
  ctx.moveTo(at.x - 4 * s, y + hgt);
  ctx.lineTo(at.x, y + hgt + 6 * s);
  ctx.lineTo(at.x + 4 * s, y + hgt);
  ctx.fill();
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = red ? '#ffffff' : '#16a085';
  ctx.font = `bold ${Math.round(10 * s)}px sans-serif`;
  ctx.fillText(name, at.x, y + 9 * s);
  ctx.fillStyle = red ? '#ffffff' : '#000';
  ctx.font = red ? `bold ${Math.round(13 * s)}px sans-serif` : `${Math.round(16 * s)}px serif`;
  ctx.fillText(text, at.x, y + 24 * s);
  ctx.restore();
}
