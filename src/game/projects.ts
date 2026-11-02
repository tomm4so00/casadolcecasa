// Progetti di gruppo del laboratorio ingegneristico: la bacheca, il sito e i versamenti.
import type { GameValue } from './context.js';
import { game } from './context.js';
import { dom } from './runtime.js';
import { toast } from './missions.js';
import { openDialog } from './interface.js';
import { saveGame } from './saves.js';
import { sfx } from './audio.js';
import { creditMoney, spendMoney } from './economy.js';
import { escapeHtmlSafe } from './needs.js';
import { drawRocketProp } from './render/objects.js';
import {
  MIN_DONATION,
  PROJECTS,
  type ProjectState,
  decodeProject,
  donationError,
  projectGoal,
  projectStage,
  toNextStage,
  topDonors,
} from './project-rules.js';

const rocket = PROJECTS.rocket;
const euro = (n: number) => `${n.toLocaleString('it-IT')} €`;
let state: ProjectState = { funded: 0, donors: {} };
let loaded = false;
let fromPc = false;

/** Fase del razzo (0 = niente, 1 = pezzi in costruzione, 2 = completo); la usa il disegno. */
export const rocketStage = (): number => projectStage(rocket, state.funded);
const setState = (s: ProjectState) => {
  state = s;
  game.rocketStage = rocketStage();
};
export const rocketFunded = (): number => state.funded;

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
  });
}

// ---------------------------------------------------------------- bacheca e sito

export function openProjects(pc = false): void {
  fromPc = pc;
  dom('projects-modal').classList.remove('hidden');
  renderProjects();
}

/** Disegna l'anteprima del razzo finito, come un progetto su carta blu. */
function drawPreview(cv: HTMLCanvasElement): void {
  const ctx = cv.getContext('2d');
  if (!ctx) return;
  const g = ctx.createLinearGradient(0, 0, 0, cv.height);
  g.addColorStop(0, '#0b3d91');
  g.addColorStop(1, '#082a66');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, cv.width, cv.height);
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
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = 'bold 12px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('PROGETTO CDC-1', 10, 18);
  ctx.font = '10px sans-serif';
  ctx.fillText('anteprima del razzo finito', 10, 32);
}

export function renderProjects(): void {
  const modal = dom('projects-modal');
  if (!modal || modal.classList.contains('hidden')) return;
  dom('projects-browser-bar').classList.toggle('hidden', !fromPc);
  dom('projects-title').textContent = fromPc
    ? '🛠️ ProgettInsieme — progetti di gruppo'
    : '📌 Bacheca dei progetti';
  const goal = projectGoal(rocket);
  const funded = state.funded;
  const stage = rocketStage();
  const pct = Math.min(100, (funded / goal) * 100);
  const marks = rocket.stages
    .map(
      (s, i) =>
        `<div class="proj-mark ${funded >= s.at ? 'done' : ''}" style="left:${(s.at / goal) * 100}%"><span>${i === 0 ? '🏗️' : '🚀'} ${euro(s.at)}</span></div>`,
    )
    .join('');
  const status =
    stage >= 2
      ? '✅ <b>Razzo completo!</b> Grazie a tutti quelli che hanno contribuito.'
      : `Mancano <b>${euro(toNextStage(rocket, funded))}</b> per: ${rocket.stages[stage].label.toLowerCase()}.`;
  const mine = state.donors[game.session.myPlayerId]?.amount || 0;
  const donors = topDonors(state)
    .map(
      (d, i) =>
        `<li><span>${['🥇', '🥈', '🥉'][i] || '•'} ${escapeHtmlSafe(d.name)}</span><b>${euro(d.amount)}</b></li>`,
    )
    .join('');
  dom('projects-body').innerHTML = `
    <div class="proj-card">
      <canvas id="proj-preview" class="proj-preview" width="200" height="260"></canvas>
      <div class="proj-info">
        <h4>${rocket.name}</h4>
        <p>${rocket.description}</p>
        <div class="proj-total">Raccolti: <b>${euro(funded)}</b> su ${euro(goal)}</div>
        <div class="proj-bar"><div class="proj-fill" style="width:${pct}%"></div>${marks}</div>
        <p class="proj-status">${status}</p>
        ${mine ? `<p class="proj-mine">💙 Tu hai versato ${euro(mine)}</p>` : ''}
        ${stage < 2 ? '<button type="button" class="art-btn proj-donate" style="background:#0984e3">💶 Versa soldi</button>' : ''}
      </div>
    </div>
    <div class="proj-donors">
      <h5>🏆 Chi ha versato di più</h5>
      ${donors ? `<ol>${donors}</ol>` : '<p>Ancora nessun versamento: sii il primo!</p>'}
    </div>`;
  drawPreview(dom('proj-preview'));
  const btn = dom('projects-body').querySelector('.proj-donate') as HTMLButtonElement | null;
  if (btn) btn.onclick = () => void askDonation();
}

async function askDonation(): Promise<void> {
  const left = projectGoal(rocket) - state.funded;
  const res: GameValue = await openDialog({
    title: '💶 Versa per il razzo',
    text: `Quanto vuoi versare? In cassaforte hai ${euro(game.moneyLevel)}.\nMinimo ${euro(Math.min(MIN_DONATION, left))}, mancano ${euro(left)} per completare il razzo.`,
    input: { placeholder: 'Importo in €', numeric: true, maxLength: 6 },
    buttons: [
      { label: 'Annulla', value: null, color: '#57606f' },
      { label: 'Versa', value: 'ok', color: '#0984e3' },
    ],
  });
  if (res.action !== 'ok') return;
  await donate(Number(String(res.value || '').trim()));
}

export async function donate(amount: number): Promise<boolean> {
  const error = donationError(rocket, state.funded, amount, game.moneyLevel);
  if (error) {
    toast('❌ ' + error, 4500);
    return false;
  }
  if (!(await spendMoney(amount))) {
    toast('❌ Versamento non riuscito.', 4000);
    return false;
  }
  const goal = projectGoal(rocket);
  const before = state.funded;
  let committed = false;
  try {
    const res = await game.session.db
      .ref('sims_projects/rocket/funded')
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
      .ref('sims_projects/rocket/donors/' + game.session.myPlayerId)
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
  const reached = rocket.stages.find((s) => before < s.at && after >= s.at);
  toast(
    reached
      ? `🎉 Grazie! ${reached.label}! Vai a vederlo nella zona esterna del laboratorio.`
      : `✅ Hai versato ${euro(amount)} per il razzo. Grazie!`,
    5500,
  );
  return true;
}
