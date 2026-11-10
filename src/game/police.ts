// Commissariato di Polizia: si entra dal menu "Esci dal Condominio". Allo sportello l'agente
// legge il registro dei furti rimasti senza colpevole, all'eliminacode si prende il numero e in
// bacheca ci sono i consigli per difendersi dai ladri.
import { game } from './context.js';
import { dom } from './runtime.js';
import { openDialog } from './interface.js';
import { toast } from './missions.js';
import { sfx } from './audio.js';
import { gossipEntries } from './gossip.js';
import { denounceAll, policeFund, proofLines } from './trash.js';
import {
  peopleAhead,
  servingNumber,
  ticketLabel,
  ticketNumber,
  unsolvedThefts,
} from './police-rules.js';

export const POLICE_ENV = 'commissariato';
const TITLE = 'Commissariato di Polizia 🚓';

/** Dal menu dei posti: si entra dalla porta davanti. */
export function enterPolice(): void {
  game.view.activeEnvironment = POLICE_ENV;
  game.view.currentRoomTitle = TITLE;
  dom('btn-return-home').classList.add('hidden');
  game.playerPos = { x: 0, y: 175 };
}

/** Il testo del pulsante vicino a un oggetto del commissariato (null per l'uscita). */
export function policePrompt(key: string): { text: string } | null {
  if (key === 'policeCounter') return { text: "👮 Parla con l'agente allo sportello" };
  if (key === 'ticketMachine') return { text: '🎫 Prendi il numero' };
  if (key === 'cell') return { text: '🔒 Guarda nella camera di sicurezza' };
  if (key === 'noticeBoard') return { text: '📌 Leggi gli avvisi ai cittadini' };
  if (key === 'policeSafe') return { text: '💰 Guarda la cassa della polizia' };
  return null;
}

export async function policeAct(key: string): Promise<void> {
  if (key === 'policeSafe') lookAtSafe();
  else if (key === 'policeCounter') await talkToOfficer();
  else if (key === 'ticketMachine') takeTicket();
  else if (key === 'cell') toast('🔒 La camera di sicurezza è vuota… per ora. 👀', 3500);
  else if (key === 'noticeBoard') await readNotices();
}

const serverNow = (): number => Date.now() + (game.session?.serverOffset || 0);

// Il biglietto preso: vale finché non viene chiamato (poi se ne prende un altro).
let ticket: number | null = null;

function takeTicket(): void {
  const now = Date.now();
  const serving = servingNumber(now);
  if (ticket === null || peopleAhead(ticket, serving) === 0 || peopleAhead(ticket, serving) > 10)
    ticket = ticketNumber(now, Math.random() * 1000);
  sfx('click');
  const ahead = peopleAhead(ticket, serving);
  toast(
    `🎫 Il tuo numero è ${ticketLabel(ticket)}. Allo sportello chiamano ${ticketLabel(serving)}: ` +
      (ahead === 1 ? 'prima di te c’è una persona.' : `prima di te ci sono ${ahead} persone.`),
    5000,
  );
}

async function talkToOfficer(): Promise<void> {
  const now = serverNow();
  const hour = new Date().getHours();
  const hello = hour >= 5 && hour < 17 ? 'Buongiorno' : 'Buonasera';
  const thefts = unsolvedThefts(gossipEntries(), now);
  const register = thefts.length
    ? '📋 Furti denunciati nel condominio, ancora senza colpevole:\n\n' + thefts.join('\n\n')
    : '📋 Nessun furto denunciato di recente nel condominio. Meglio così!';
  // le prove trovate nei cestini: con queste si può denunciare
  const proofs = proofLines();
  const res = await openDialog({
    title: '👮 Ufficio Denunce',
    text: proofs.length
      ? `L'agente alza gli occhi dal monitor: «${hello}, mi dica.»\n\n` +
        `Le mostri quello che hai trovato nei cestini:\n\n${proofs.join('\n')}\n\n` +
        '«Sono prove valide. Vuole sporgere denuncia? Metà della multa spetta a lei.»'
      : `L'agente alza gli occhi dal monitor: «${hello}, mi dica.»\n\n${register}\n\n` +
        '«Se le hanno svuotato la cassaforte, cambi subito la combinazione e porti i risparmi in ' +
        'banca: lì i ladri non arrivano. E se trova qualcosa di sospetto nel cestino di ' +
        'qualcuno, me lo porti.»',
    buttons: proofs.length
      ? [
          { label: 'Non ora', value: null, color: '#57606f' },
          { label: '👮 Sporgi denuncia', value: 'report', color: '#1f3a68' },
        ]
      : [{ label: 'Grazie, arrivederci', value: null, color: '#1f3a68' }],
  });
  if (res.action === 'report') await denounceAll();
}

function lookAtSafe(): void {
  const fund = policeFund();
  toast(
    `💰 Nella cassa della polizia ci sono ${fund.toLocaleString('it-IT')} Đ di multe. ` +
      'È blindata: nessuno la può scassinare.',
    4500,
  );
}

async function readNotices(): Promise<void> {
  await openDialog({
    title: '📌 Avvisi ai cittadini',
    text: [
      '🔐 Proteggete la cassaforte con una combinazione segreta: chi la indovina può rubarvi i soldi.',
      '🕚 Ogni giorno alle 11:45 Zero, lo scassinatore, annuncia a che ora indebolirà le casseforti. Se vedete qualcuno scassinare la vostra, dategli un pugno: non potrà più aprirla.',
      '🏦 I soldi depositati in banca sono al sicuro dai ladri.',
      '💊 Non accettate pillole misteriose in discoteca.',
      '🚨 Numero unico di emergenza: 112.',
    ].join('\n\n'),
    buttons: [{ label: 'Chiudi', value: null, color: '#57606f' }],
  });
}
