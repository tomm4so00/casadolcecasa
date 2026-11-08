// Scelta del mondo (condominio): entrare in un mondo pubblico con posti liberi, crearne uno nuovo
// o entrare con il codice di un amico. Chi cambia mondo si porta dietro la stanza: cassaforte,
// mobili, quadri; i soldi in tasca e gli oggetti sono nel salvataggio e lo seguono comunque.
// Regole dei codici e dei posti liberi in shared/worlds.ts.
import type { GameValue } from './context.js';
import { game } from './context.js';
import { toast } from './missions.js';
import { moveAuctions } from './auctions.js';
import { START_MONEY, hasRoom, normalizeRooms, saveGame, withTimeout } from './saves.js';
import {
  LEGACY_WORLD,
  WORLD_FULL_TEXT,
  WORLD_CREATE_EVERY_MS,
  WORLD_ROOMS,
  type WorldEntry,
  countFree,
  isWorldCode,
  movedRoom,
  newWorldCode,
  normalizeWorldCode,
  pickPublicWorld,
  worldNodePath,
} from '../../shared/worlds.js';

/** Elenco dei mondi, con i posti liberi: serve solo a trovare posto in fretta. */
const INDEX = 'sims_worlds';

async function readIndex(): Promise<Record<string, WorldEntry>> {
  const snap: GameValue = await withTimeout(game.session.db.ref(INDEX).get(), 6000);
  return (snap?.val() as Record<string, WorldEntry>) || {};
}

/** Posti liberi di un mondo nell'elenco, dopo un ingresso o un'uscita (se fallisce, pazienza). */
export async function publishFreeRooms(code: string, free: number): Promise<void> {
  try {
    await game.session.db
      .ref(`${INDEX}/${code}/free`)
      .set(Math.max(0, Math.min(WORLD_ROOMS, free)));
  } catch (e) {
    console.warn('[mondi] posti liberi non aggiornati', e);
  }
}

/**
 * Un mondo nuovo, vuoto, con un codice che nessuno usa ancora. Insieme si segna l'ora in
 * sims_world_creators: le regole del database lasciano creare un mondo ogni 10 minuti.
 */
async function createWorld(): Promise<string> {
  const db = game.session.db;
  const me = game.session.myPlayerId;
  // ora del server, un po' indietro: il database non accetta orari nel futuro
  const now = Date.now() + (game.session.serverOffset || 0) - 1000;
  let last: unknown = null;
  try {
    last = (await withTimeout(db.ref('sims_world_creators/' + me).get(), 6000))?.val();
  } catch {
    /* si prova lo stesso: al massimo lo rifiutano le regole */
  }
  if (typeof last === 'number' && now - last < WORLD_CREATE_EVERY_MS) {
    const min = Math.ceil((WORLD_CREATE_EVERY_MS - (now - last)) / 60000);
    throw new Error(
      `⏳ Hai creato un condominio da poco: puoi crearne un altro tra ${min} ${min === 1 ? 'minuto' : 'minuti'}.`,
    );
  }
  for (let i = 0; i < 8; i++) {
    const code = newWorldCode(Math.random);
    if (await worldExists(code)) continue;
    try {
      // elenco e ora insieme: se il codice nel frattempo è stato preso, le regole rifiutano tutto
      await withTimeout(
        db.ref('').update({
          [`${INDEX}/${code}`]: { free: WORLD_ROOMS, createdAt: now, by: me },
          ['sims_world_creators/' + me]: now,
        }),
        8000,
      );
      return code;
    } catch (e) {
      console.warn('[mondi] creazione non riuscita', code, e);
    }
  }
  throw new Error('Non è stato possibile creare il condominio, riprova.');
}

/** Il mondo esiste? (il mondo di sempre esiste sempre, anche se non è ancora nell'elenco) */
async function worldExists(code: string): Promise<boolean> {
  if (code === LEGACY_WORLD) return true;
  const snap: GameValue = await withTimeout(game.session.db.ref(`${INDEX}/${code}`).get(), 6000);
  return !!snap?.exists();
}

/**
 * Prende una stanza nel mondo `code`: la propria se c'è già, altrimenti una libera. Chi ha una
 * stanza in un altro mondo la porta con sé e quella di prima torna libera. 'full' se non c'è posto.
 */
async function moveIntoWorld(code: string, carryFrom: string | null): Promise<'ok' | 'full'> {
  if (carryFrom && carryFrom !== code && hasRoom())
    await (await import('./inventory-market.js')).settleInventoryTrades();
  const db = game.session.db;
  const me = game.session.myPlayerId;
  const nick = game.player.myData.nick;
  let carried: GameValue = null;
  if (carryFrom && carryFrom !== code && hasRoom()) {
    const snap: GameValue = await withTimeout(
      db.ref(`${worldNodePath(carryFrom, 'rooms_state')}/${game.myAssignedRoomIdx}`).get(),
      6000,
    );
    const room = snap?.val();
    if (room && room.ownerId === me) carried = room;
  }
  let idx = -1,
    free = 0;
  const res = await withTimeout(
    db.ref(worldNodePath(code, 'rooms_state')).transaction((cur: GameValue) => {
      const rooms: GameValue[] = normalizeRooms(cur);
      let i = rooms.findIndex((r) => r.ownerId === me);
      if (i === -1) i = rooms.findIndex((r) => !r.owner && !r.ownerId);
      idx = i;
      if (i === -1) return undefined; // pieno: non si scrive niente
      if (rooms[i].ownerId !== me)
        rooms[i] = carried
          ? movedRoom(carried, i, nick, me, Date.now())
          : // come in claimRoom: chi arriva trova qualche soldo per cominciare
            { id: i + 1, vaultMoney: START_MONEY, owner: nick, ownerId: me, lastSeen: Date.now() };
      free = countFree(rooms);
      return rooms;
    }),
    10000,
  );
  if (!res?.committed) {
    if (idx === -1) {
      void publishFreeRooms(code, 0);
      return 'full';
    }
    throw new Error('Il condominio non risponde, riprova tra poco.');
  }
  void publishFreeRooms(code, free);
  // la stanza nel mondo di prima torna libera
  if (carried && carryFrom) {
    let oldFree = 0;
    await withTimeout(
      db.ref(worldNodePath(carryFrom, 'rooms_state')).transaction((cur: GameValue) => {
        const rooms: GameValue[] = normalizeRooms(cur);
        const i = rooms.findIndex((r) => r.ownerId === me);
        if (i >= 0) rooms[i] = game.blankRoom(i);
        oldFree = countFree(rooms);
        return rooms;
      }),
      10000,
    );
    void publishFreeRooms(carryFrom, oldFree);
    // anche i quadri all'asta vengono con te (prima di cambiare mondo: vedi moveAuctions)
    await moveAuctions(carryFrom, code);
  }
  game.session.worldId = code;
  game.myAssignedRoomIdx = idx;
  return 'ok';
}

/** Un mondo pubblico con posti liberi; se non ce n'è nessuno se ne crea uno nuovo. */
async function joinPublic(exclude: string[]): Promise<string> {
  const index = await readIndex();
  // il mondo di sempre c'è anche se nessuno l'ha ancora messo nell'elenco
  if (!index[LEGACY_WORLD]) index[LEGACY_WORLD] = { free: 1, createdAt: 0 };
  const tried = [...exclude];
  for (let n = 0; n < 6; n++) {
    const code = pickPublicWorld(index, tried);
    if (!code) break;
    if ((await moveIntoWorld(code, carryWorld())) === 'ok') return code;
    tried.push(code);
  }
  const code = await createWorld();
  await moveIntoWorld(code, carryWorld());
  return code;
}

/** Il mondo da cui portarsi dietro la stanza: quello di adesso, se ci si abita già. */
const carryWorld = (): string | null => (game.session.hadSave ? game.session.worldId : null);

// ---------------------------------------------------------------- la finestra

type Mode = 'first' | 'switch';

function modal(): HTMLElement {
  let el = document.getElementById('world-modal');
  if (!el) {
    el = document.createElement('div');
    el.id = 'world-modal';
    el.className = 'fullscreen-modal';
    document.body.appendChild(el);
  }
  return el;
}

/**
 * Le tre strade: mondo pubblico, mondo nuovo, codice di un amico. Si risolve con il codice del
 * mondo in cui si è entrati, o null se si chiude senza cambiare (solo per chi cambia mondo).
 */
function showWorldChoice(mode: Mode): Promise<string | null> {
  const el = modal();
  const here = game.session.worldId;
  el.innerHTML =
    `<div class="card world-card">` +
    `<h3>🌍 ${mode === 'first' ? 'Scegli il tuo condominio' : 'Cambia condominio'}</h3>` +
    `<p class="world-sub">${
      mode === 'first'
        ? `Ogni condominio ha ${WORLD_ROOMS} stanze. Entra dove c'è posto, creane uno tuo o raggiungi un amico con il suo codice.`
        : `Sei nel condominio <b>${here}</b>. Cambiando, la tua stanza viene con te: cassaforte, mobili, quadri e i tuoi quadri all'asta (le offerte dei vicini di adesso si annullano). Soldi e oggetti restano tuoi.`
    }</p>` +
    `<button type="button" class="btn-primary world-btn" data-w="public">🎲 Unisciti a un mondo pubblico</button>` +
    `<button type="button" class="btn-primary world-btn world-create" data-w="create">🏗️ Crea un nuovo mondo</button>` +
    `<div class="world-code-label">🔑 Hai il codice di un amico?</div>` +
    `<div class="world-code"><input id="world-code-input" type="text" maxlength="12" autocomplete="off" autocapitalize="characters" placeholder="CASA-X92L">` +
    `<button type="button" class="btn-primary world-btn world-go" data-w="code">Entra</button></div>` +
    `<div class="world-status" role="status"></div>` +
    (mode === 'switch'
      ? `<button type="button" class="btn-primary world-btn world-cancel" data-w="cancel">Annulla</button>`
      : '') +
    `</div>`;
  el.classList.remove('hidden');
  const status = el.querySelector<HTMLElement>('.world-status')!;
  const input = el.querySelector<HTMLInputElement>('#world-code-input')!;
  const buttons = [...el.querySelectorAll<HTMLButtonElement>('.world-btn')];
  const busy = (on: boolean) => buttons.forEach((b) => (b.disabled = on));
  const say = (text: string, bad = false) => {
    status.textContent = text;
    status.classList.toggle('bad', bad);
  };
  const exclude = mode === 'switch' ? [here] : [];
  return new Promise((resolve) => {
    const done = (code: string | null) => {
      el.classList.add('hidden');
      resolve(code);
    };
    const run = async (what: string) => {
      if (what === 'cancel') return done(null);
      busy(true);
      try {
        if (what === 'public') {
          say('🔎 Cerco un condominio con posti liberi…');
          return done(await joinPublic(exclude));
        }
        if (what === 'create') {
          say('🏗️ Costruisco il tuo condominio…');
          const code = await createWorld();
          await moveIntoWorld(code, carryWorld());
          return done(code);
        }
        const code = normalizeWorldCode(input.value);
        if (!code) return say('❌ Codice non valido: è fatto così, CASA-X92L.', true);
        if (mode === 'switch' && code === here)
          return say('🏠 Sei già in questo condominio.', true);
        say('🔎 Cerco il condominio…');
        if (!(await worldExists(code)))
          return say(`❌ Nessun condominio con il codice ${code}.`, true);
        if ((await moveIntoWorld(code, carryWorld())) === 'full')
          return say(
            `🚫 ${code} è al completo (${WORLD_ROOMS}/${WORLD_ROOMS}). ${WORLD_FULL_TEXT}`,
            true,
          );
        return done(code);
      } catch (e) {
        say(e instanceof Error ? e.message : String(e), true);
      } finally {
        busy(false);
      }
    };
    buttons.forEach((b) => b.addEventListener('click', () => void run(b.dataset.w || '')));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') void run('code');
    });
  });
}

/** Primo ingresso di un giocatore nuovo: si sceglie il condominio prima di tutto il resto. */
export async function chooseFirstWorld(): Promise<void> {
  const code = await showWorldChoice('first');
  if (code && code !== LEGACY_WORLD) toast(`🌍 Benvenuto nel condominio ${code}!`, 4000);
}

/** Dal profilo: cambiare condominio portandosi dietro la stanza. Poi si ricarica il gioco. */
export async function openWorldSwitch(): Promise<void> {
  if (game.activeShift || game.MG.active) {
    toast('💼 Finisci prima il turno di lavoro!');
    return;
  }
  const code = await showWorldChoice('switch');
  if (!code) return;
  toast(`🌍 Trasloco nel condominio ${code}…`, 4000);
  try {
    await saveGame(true);
  } catch {
    /* il salvataggio riparte dopo il riavvio */
  }
  // si riparte da capo nel mondo nuovo: stanze, chat, giocatori online sono i suoi
  location.reload();
}

/** Il codice del mondo, per il profilo e gli inviti. */
export const currentWorldCode = (): string =>
  isWorldCode(game.session.worldId) ? game.session.worldId : LEGACY_WORLD;
