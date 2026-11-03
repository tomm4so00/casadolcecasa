// Progetti di gruppo del laboratorio ingegneristico: la bacheca, il sito e i versamenti.
// Primo progetto: il razzo. Dopo il primo lancio si sblocca il secondo: la base spaziale lunare.
import type { GameValue } from './context.js';
import { game } from './context.js';
import { dom, lifetime } from './runtime.js';
import { sendNotify } from './needs.js';
import { toast } from './missions.js';
import { openDialog } from './interface.js';
import { saveGame } from './saves.js';
import { sfx } from './audio.js';
import { creditMoney, spendMoney } from './economy.js';
import { escapeHtmlSafe } from './needs.js';
import { drawRocketProp } from './render/objects.js';
import { renderMoonbaseView } from './render/moonbase.js';
import {
  MIN_DONATION,
  PROJECTS,
  PROJECT_IDS,
  type ProjectId,
  projectUnlocked,
  type ProjectState,
  decodeProject,
  donationError,
  projectGoal,
  projectStage,
  toNextStage,
  topDonors,
  countdownText,
  launchPhase,
  LAUNCH_DELAY_MS,
} from './project-rules.js';

const rocket = PROJECTS.rocket;
const moonbase = PROJECTS.moonbase;
const euro = (n: number) => `${n.toLocaleString('it-IT')} €`;
let state: ProjectState = { funded: 0, donors: {} };
let baseState: ProjectState = { funded: 0, donors: {} };
const stateOf = (id: ProjectId): ProjectState => (id === 'rocket' ? state : baseState);
let loaded = false;
let baseLoaded = false;
let fromPc = false;

/** Fase del razzo (0 = niente, 1 = pezzi in costruzione, 2 = completo); la usa il disegno. */
export const rocketStage = (): number => projectStage(rocket, state.funded);
const setState = (s: ProjectState) => {
  state = s;
  game.rocketStage = rocketStage();
  game.rocketLaunchAt = s.launchAt || 0;
  game.rocketTripAt = s.tripAt || 0;
  game.moonTripAt = s.moonTripAt || 0;
  game.rocketDonors = Object.fromEntries(Object.entries(s.donors).map(([id, d]) => [id, d.amount]));
};
const serverNow = (): number => Date.now() + (game.session.serverOffset || 0);
/** Fase del lancio adesso (uguale per tutti). */
export const rocketLaunch = () => launchPhase(rocketStage(), state.launchAt, serverNow());
export const rocketFunded = (): number => state.funded;

/** Stato della base lunare: la fase si vede sulla luna e nello schermo del laboratorio. */
function setBaseState(s: ProjectState): void {
  baseState = s;
  game.moonBaseStage = projectStage(moonbase, s.funded);
  game.moonBaseFunded = s.funded;
  // lo schermo con la diretta compare nel laboratorio quando il progetto è avviato
  if (game.moonBaseStage >= 1)
    game.engineeringFurniture.moonScreen = {
      x: 125,
      y: -40,
      w: 100,
      h: 10,
      z: 118,
      name: 'Diretta dalla base lunare 📺',
      moveable: false,
    };
  else delete game.engineeringFurniture.moonScreen;
  // base completa: davanti al portellone del primo modulo si può entrare
  if (game.moonBaseStage >= 3)
    game.moonFurniture.baseDoor = {
      x: 162,
      y: -20,
      w: 18,
      h: 10,
      z: 20,
      name: 'Base lunare CDC 🌙',
      moveable: false,
    };
  else delete game.moonFurniture.baseDoor;
}

export function startProjects(): void {
  game.session.db.ref('sims_projects/rocket').on('value', (snap?: GameValue): void => {
    const before = rocketStage();
    setState(decodeProject(snap?.val()));
    // avvisa tutti quando il razzo avanza (non al primo caricamento)
    if (loaded && rocketStage() > before)
      toast(
        rocketStage() >= 2
          ? '🚀 Il razzo è completo! Vai a vederlo nella zona esterna del laboratorio ingegneristico.'
          : '🏗️ Iniziati i lavori del razzo! Si vedono i primi pezzi nella zona esterna del laboratorio.',
        7000,
      );
    loaded = true;
    renderProjects();
    updateLaunchBanner();
  });
  game.session.db.ref('sims_projects/moonbase').on('value', (snap?: GameValue): void => {
    const before = projectStage(moonbase, baseState.funded);
    setBaseState(decodeProject(snap?.val()));
    const now = projectStage(moonbase, baseState.funded);
    if (baseLoaded && now > before) {
      const msg =
        now >= 3
          ? '🌙 La base spaziale lunare è completa! Guardala in diretta nel laboratorio o vai sulla luna.'
          : now === 2
            ? '🌙 La base lunare è a metà: aggiunti il secondo modulo e l’antenna!'
            : '🌙 Avviata la base spaziale lunare! Sulla luna compaiono i primi moduli.';
      toast(msg, 7000);
      sendNotify('Casa dolce casa', msg, 'sims-moonbase');
    }
    baseLoaded = true;
    renderProjects();
  });
  lifetime.setInterval(updateLaunchBanner, 1000);
}

// ---------------------------------------------------------------- conto alla rovescia

let lastPhase = '';

/** Striscia in alto con il conto alla rovescia, visibile ovunque ci si trovi nel gioco. */
function updateLaunchBanner(): void {
  const banner = dom('launch-banner');
  if (!banner) return;
  const { phase, left } = rocketLaunch();
  // avvisi quando cambia la fase (non al primo caricamento)
  if (lastPhase && phase !== lastPhase) {
    if (phase === 'countdown') {
      sfx('mission');
      const who = state.launchBy || 'Qualcuno';
      toast(`🔴 ${who} ha premuto il pulsante rosso! Decollo tra 10 secondi!`, 6000);
      sendNotify(
        '🚀 Il razzo sta per partire!',
        `${who} ha premuto il pulsante rosso.`,
        'sims-rocket',
      );
    } else if (phase === 'launching') {
      toast('🚀 Decollo! Il razzo CDC-1 sta partendo!', 6000);
    } else if (
      phase === 'launched' &&
      lastPhase === 'launching' &&
      state.donors[game.session.myPlayerId]
    )
      toast(
        '🏅 Missione compiuta! In camera trovi una targhetta per ricordare il tuo contributo.',
        7000,
      );
  }
  lastPhase = phase;
  const show = phase === 'waiting' || phase === 'countdown' || phase === 'launching';
  banner.classList.toggle('hidden', !show || game.player.isDead);
  if (!show) return;
  const atSite = game.view.activeEnvironment === 'ingegneria_esterno';
  const text =
    phase === 'waiting'
      ? atSite
        ? '🔴 Razzo pronto! Premi il pulsante rosso accanto alla rampa per lanciarlo.'
        : '🚀 Razzo completo! Premi il pulsante rosso nella zona esterna del laboratorio per lanciarlo.'
      : phase === 'countdown'
        ? `🔴 ${escapeHtmlSafe(state.launchBy || 'Qualcuno')} ha premuto il pulsante! Decollo tra <b>${countdownText(left)}</b>`
        : '🚀 Il razzo sta partendo!';
  const html =
    `<span>${text}</span>` +
    (!atSite ? '<button type="button" data-action="goToLaunchSite">Vai a vedere</button>' : '');
  if (banner.innerHTML !== html) banner.innerHTML = html;
}

// ---------------------------------------------------------------- bacheca e sito

export function openProjects(pc = false): void {
  fromPc = pc;
  dom('projects-modal').classList.remove('hidden');
  renderProjects();
}

/** Anteprima del progetto finito, come un disegno tecnico su carta blu. */
function drawPreview(cv: HTMLCanvasElement, id: ProjectId): void {
  const ctx = cv.getContext('2d');
  if (!ctx) return;
  if (id === 'moonbase') {
    renderMoonbaseView(cv, 3, 0, true);
  } else {
    const g = ctx.createLinearGradient(0, 0, 0, cv.height);
    g.addColorStop(0, '#0b3d91');
    g.addColorStop(1, '#082a66');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, cv.width, cv.height);
  }
  // quadrettatura da disegno tecnico
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 1;
  for (let x = 0; x < cv.width; x += 16) {
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, cv.height);
    ctx.stroke();
  }
  for (let y = 0; y < cv.height; y += 16) {
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(cv.width, y + 0.5);
    ctx.stroke();
  }
  if (id === 'rocket') {
    const savedCtx: GameValue = game.view.ctx;
    const scale = cv.height / 380;
    game.view.ctx = ctx;
    game.viewOverride = { cx: cv.width / 2 + 10 * scale, cy: cv.height * 0.86, scale };
    try {
      drawRocketProp({ x: 0, y: 0, w: 80, h: 80, stage: 2 }, 0);
    } finally {
      game.view.ctx = savedCtx;
      game.viewOverride = null;
    }
  }
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = 'bold 12px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(id === 'rocket' ? 'PROGETTO CDC-1' : 'BASE LUNARE CDC', 10, 18);
  ctx.font = '10px sans-serif';
  ctx.fillText(
    id === 'rocket' ? 'anteprima del razzo finito' : 'anteprima della base finita',
    10,
    32,
  );
}

/** Testo dello stato di un progetto (quanto manca, o se è finito). */
function statusText(id: ProjectId): string {
  const p = PROJECTS[id];
  const funded = stateOf(id).funded;
  const stage = projectStage(p, funded);
  if (id === 'rocket' && stage >= 2)
    return state.launchAt
      ? '🚀 <b>Razzo lanciato!</b> Grazie a tutti quelli che hanno contribuito.'
      : '✅ <b>Razzo completo!</b> Vai nella zona esterna del laboratorio e premi il pulsante rosso per lanciarlo.';
  if (id === 'moonbase' && stage >= 3)
    return '🌙 <b>Base lunare completa!</b> Guardala dallo schermo del laboratorio o vai a visitarla sulla luna.';
  return `Mancano <b>${euro(toNextStage(p, funded))}</b> per: ${p.stages[stage].label.toLowerCase()}.`;
}

/** Scheda di un progetto sulla bacheca. */
function projectCard(id: ProjectId): string {
  const p = PROJECTS[id];
  const st = stateOf(id);
  const goal = projectGoal(p);
  const funded = st.funded;
  const stage = projectStage(p, funded);
  const pct = Math.min(100, (funded / goal) * 100);
  const icons = id === 'rocket' ? ['🏗️', '🚀'] : ['🏗️', '🛰️', '🌙'];
  const marks = p.stages
    .map(
      (s, i) =>
        `<div class="proj-mark ${funded >= s.at ? 'done' : ''}" style="left:${(s.at / goal) * 100}%"><span>${icons[i]} ${euro(s.at)}</span></div>`,
    )
    .join('');
  const mine = st.donors[game.session.myPlayerId]?.amount || 0;
  const donors = topDonors(st)
    .map(
      (d, i) =>
        `<li><span>${['🥇', '🥈', '🥉'][i] || '•'} ${escapeHtmlSafe(d.name)}</span><b>${euro(d.amount)}</b></li>`,
    )
    .join('');
  return `
    <div class="proj-card">
      <canvas id="proj-preview-${id}" class="proj-preview" width="200" height="260"></canvas>
      <div class="proj-info">
        <h4>${p.name}</h4>
        <p>${p.description}</p>
        <div class="proj-total">Raccolti: <b>${euro(funded)}</b> su ${euro(goal)}</div>
        <div class="proj-bar"><div class="proj-fill" style="width:${pct}%"></div>${marks}</div>
        <p class="proj-status">${statusText(id)}</p>
        ${mine ? `<p class="proj-mine">💙 Tu hai versato ${euro(mine)}</p>` : ''}
        ${stage < p.stages.length ? `<button type="button" class="art-btn proj-donate" data-project="${id}" style="background:#0984e3">💶 Versa soldi</button>` : ''}
      </div>
    </div>
    <div class="proj-donors">
      <h5>🏆 Chi ha versato di più</h5>
      ${donors ? `<ol>${donors}</ol>` : '<p>Ancora nessun versamento: sii il primo!</p>'}
    </div>`;
}

export function renderProjects(): void {
  const modal = dom('projects-modal');
  if (!modal || modal.classList.contains('hidden')) return;
  dom('projects-browser-bar').classList.toggle('hidden', !fromPc);
  dom('projects-title').textContent = fromPc
    ? '🛠️ ProgettInsieme — progetti di gruppo'
    : '📌 Bacheca dei progetti';
  // il progetto più nuovo in cima, il razzo sotto
  const ids = PROJECT_IDS.filter((id) => projectUnlocked(id, state.launchAt)).reverse();
  dom('projects-body').innerHTML = ids.map(projectCard).join('<hr class="proj-sep">');
  for (const id of ids) drawPreview(dom('proj-preview-' + id), id);
  (dom('projects-body') as HTMLElement)
    .querySelectorAll<HTMLButtonElement>('.proj-donate')
    .forEach((btn) => (btn.onclick = () => void askDonation(btn.dataset.project as ProjectId)));
}

async function askDonation(id: ProjectId): Promise<void> {
  const p = PROJECTS[id];
  const left = projectGoal(p) - stateOf(id).funded;
  const what = id === 'rocket' ? 'il razzo' : 'la base lunare';
  const res: GameValue = await openDialog({
    title: `💶 Versa per ${what}`,
    text: `Quanto vuoi versare? In cassaforte hai ${euro(game.moneyLevel)}.\nMinimo ${euro(Math.min(MIN_DONATION, left))}, mancano ${euro(left)} per completare ${what}.`,
    input: { placeholder: 'Importo in €', numeric: true, maxLength: 6 },
    buttons: [
      { label: 'Annulla', value: null, color: '#57606f' },
      { label: 'Versa', value: 'ok', color: '#0984e3' },
    ],
  });
  if (res.action !== 'ok') return;
  await donate(Number(String(res.value || '').trim()), id);
}

export async function donate(amount: number, id: ProjectId = 'rocket'): Promise<boolean> {
  const p = PROJECTS[id];
  if (!projectUnlocked(id, state.launchAt)) {
    toast('🔒 Questo progetto si sblocca dopo il primo lancio del razzo.', 4500);
    return false;
  }
  const error = donationError(p, stateOf(id).funded, amount, game.moneyLevel);
  if (error) {
    toast('❌ ' + error, 4500);
    return false;
  }
  if (!(await spendMoney(amount))) {
    toast('❌ Versamento non riuscito.', 4000);
    return false;
  }
  const goal = projectGoal(p);
  const before = stateOf(id).funded;
  let committed = false;
  try {
    const res = await game.session.db
      .ref(`sims_projects/${id}/funded`)
      .transaction((cur: GameValue) => {
        const now = Number(cur) || 0;
        return now + amount > goal ? undefined : now + amount;
      });
    committed = res.committed;
  } catch (e) {
    console.warn('[progetti]', e);
  }
  if (!committed) {
    // qualcun altro ha versato nel frattempo: i soldi tornano in cassaforte
    await creditMoney(amount);
    toast('❌ Il progetto è cambiato nel frattempo: riprova con un importo più piccolo.', 5000);
    return false;
  }
  try {
    await game.session.db
      .ref(`sims_projects/${id}/donors/` + game.session.myPlayerId)
      .transaction((cur: GameValue) => ({
        name: String(game.player.myData.nick || 'Giocatore').slice(0, 20),
        amount: (Number(cur?.amount) || 0) + amount,
      }));
  } catch (e) {
    console.warn('[progetti] donatori', e);
  }
  sfx('coin');
  saveGame(true);
  const after = before + amount;
  const reached = p.stages.find((s) => before < s.at && after >= s.at);
  const where =
    id === 'rocket'
      ? 'Vai a vederlo nella zona esterna del laboratorio.'
      : 'Guardala in diretta dallo schermo del laboratorio!';
  toast(
    reached
      ? `🎉 Grazie! ${reached.label}! ${where}`
      : `✅ Hai versato ${euro(amount)} per ${id === 'rocket' ? 'il razzo' : 'la base lunare'}. Grazie!`,
    5500,
  );
  return true;
}

// ---------------------------------------------------------------- pulsante rosso

/** Chi preme il pulsante rosso fa partire il conto alla rovescia di 10 secondi per tutti. */
export async function pressLaunchButton(): Promise<void> {
  const { phase } = rocketLaunch();
  if (phase === 'building') {
    toast(
      `🔒 Il razzo non è ancora completo: mancano ${euro(projectGoal(rocket) - state.funded)}.`,
      4500,
    );
    return;
  }
  if (phase !== 'waiting') return;
  game.launchPressedAt = game.animClock;
  sfx('click');
  let committed = false;
  try {
    const result = await game.session.db
      .ref('sims_projects/rocket/launchAt')
      .transaction((cur: GameValue) => (cur ? undefined : serverNow() + LAUNCH_DELAY_MS));
    committed = result.committed;
  } catch (e) {
    console.warn('[razzo]', e);
  }
  if (!committed) {
    if (!state.launchAt) toast('📡 Il pulsante non ha risposto: riprova tra poco.', 4000);
    return;
  }
  try {
    await game.session.db
      .ref('sims_projects/rocket/launchBy')
      .set(String(game.player.myData.nick || 'Giocatore').slice(0, 20));
  } catch (e) {
    console.warn('[razzo] nome', e);
  }
}
