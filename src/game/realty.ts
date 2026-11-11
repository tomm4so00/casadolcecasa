// Bacheca immobiliare del cortile: menu per trasferirsi in una stanza libera.
import type { GameValue } from './context.js';
import { game } from './context.js';
import { openDialog } from './interface.js';
import { toast } from './missions.js';
import { postGossip } from './gossip.js';
import { sfx } from './audio.js';
import { hasRoom, normalizeRooms, saveGame, withTimeout } from './saves.js';
import { hashPin } from './safe-pin.js';
import { settleEconomy } from './economy.js';
import { isFreeRoom, moveRoom, roomLabel } from './realty-rules.js';
import { recordActivity } from './activity.js';
import { worldNode } from './world-db.js';

const label = (idx: number): string => roomLabel(idx, game.ROOMS_PER_APT);

/** Stanze libere, raggruppate per appartamento. */
function freeRoomsByApt(): Map<number, number[]> {
  const out = new Map<number, number[]>();
  (game.roomsState || []).forEach((r: GameValue, i: number) => {
    if (!isFreeRoom(r)) return;
    const apt = game.aptOfRoom(i);
    out.set(apt, [...(out.get(apt) || []), i]);
  });
  return out;
}

/** Apre la bacheca: appartamento → stanza → conferma. */
export async function openRealtyBoard(): Promise<void> {
  if (!hasRoom()) {
    toast('🏘️ Non hai ancora una stanza: quando se ne libera una ti viene assegnata.', 4000);
    return;
  }
  for (;;) {
    const byApt = freeRoomsByApt();
    if (!byApt.size) {
      await openDialog({
        title: '🏘️ Bacheca immobiliare',
        text: `Abiti in: ${label(game.myAssignedRoomIdx ?? 0)}.\n\Al momento non ci sono stanze libere: riprova più tardi.`,
        buttons: [{ label: 'Chiudi', value: null, color: '#57606f' }],
      });
      return;
    }
    const apts = [...byApt.keys()].sort((a, b) => a - b);
    const pickApt = await openDialog({
      title: '🏘️ Bacheca immobiliare',
      text:
        `Abiti in: ${label(game.myAssignedRoomIdx ?? 0)}.\n\n` +
        'Cambia stanza: scegli l’appartamento in cui trasferirti. ' +
        'Porti con te tutto: soldi in cassaforte, vestiti, mobili, quadri, animali e combinazione.',
      buttons: [
        ...apts.map((a) => {
          const n = byApt.get(a)!.length;
          return {
            label: `🏢 Appart. ${a + 1}
${n} ${n === 1 ? 'libera' : 'libere'}`,
            value: String(a),
          };
        }),
        { label: 'Chiudi', value: null, color: '#57606f' },
      ],
    });
    if (pickApt.action === null) return;
    const apt = Number(pickApt.action);
    const pickRoom = await openDialog({
      title: `🏢 Appartamento ${apt + 1}`,
      text: 'Stanze libere (il numero è quello sulla porta nel salone):',
      buttons: [
        ...(byApt.get(apt) || []).map((i) => ({
          label: `🚪 Stanza ${i + 1}`,
          value: String(i),
        })),
        { label: '⬅️ Indietro', value: 'back', color: '#57606f' },
      ],
    });
    if (pickRoom.action === null) return;
    if (pickRoom.action === 'back') continue;
    const target = Number(pickRoom.action);
    const ok = await openDialog({
      title: '🏘️ Cambia stanza',
      text: `Ti trasferisci da ${label(game.myAssignedRoomIdx ?? 0)} a ${label(target)}.\n\nLa stanza di adesso torna libera per un altro giocatore.`,
      buttons: [
        { label: '⬅️ Indietro', value: 'back', color: '#57606f' },
        { label: '📦 Trasferisciti', value: 'ok', color: '#2ed573' },
      ],
    });
    if (ok.action === 'back') continue;
    if (ok.action !== 'ok') return;
    await moveMyRoom(target);
    return;
  }
}

/** Trasferisce la propria stanza in `target` con una transazione (nessuno può prenderla insieme). */
async function moveMyRoom(target: number): Promise<void> {
  const from: number = game.myAssignedRoomIdx ?? -1;
  // prima si chiudono gli acquisti e i movimenti di soldi ancora in corso sulla stanza vecchia
  await settleEconomy();
  let moved: GameValue = null;
  try {
    const ref = game.session.db.ref(worldNode('rooms_state'));
    await withTimeout(ref.get(), 5000);
    const result: GameValue = await withTimeout(
      ref.transaction((cur: GameValue) => {
        moved = moveRoom(normalizeRooms(cur), game.session.myPlayerId, target, hashPin, Date.now());
        return moved || undefined; // undefined = annulla
      }),
      8000,
    );
    if (!result?.committed) moved = null;
    else game.roomsState = normalizeRooms(result.snapshot.val());
  } catch (e: GameValue) {
    console.warn('Cambio stanza fallito', e);
    moved = null;
  }
  if (!moved) {
    sfx('error');
    toast(
      '🏘️ Non è stato possibile trasferirsi: forse qualcuno ha appena preso quella stanza.',
      4500,
    );
    return;
  }
  game.myAssignedRoomIdx = target;
  if (game.currentRoomIdx === from) game.currentRoomIdx = target;
  game.safePinCode = game.roomsState[target]?.pin || '';
  game.lastLayoutKey = ''; // la disposizione dei mobili si ripubblica sulla stanza nuova
  saveGame(false);
  sfx('success');
  recordActivity('house');
  toast(`📦 Trasloco fatto! Ora abiti in: ${label(target)} 🏠`, 5000);
  postGossip(
    `${game.player.myData.nick} ha traslocato: ora abita nell'Appartamento ${game.aptOfRoom(target) + 1} 📦`,
  );
}
