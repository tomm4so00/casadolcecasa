// Centro di criogenesi: si entra dal menu "Esci dal Condominio" (world.ts). All'accettazione la
// tecnica spiega la criogenesi e la attiva (la finestra di sempre, cryo.ts), alla console si
// guardano i parametri delle capsule, il totem spiega come funziona e in fondo c'è la tua
// capsula: con la criogenesi attiva dentro ci sei tu, se no è libera. Si aggancia al gioco con
// cryo-hooks.ts (main.ts), così menu e interazioni non lo importano.
import { openDialog } from './interface.js';
import { toast } from './missions.js';
import { sfx } from './audio.js';
import { myCryo, openCryo } from './cryo.js';
import { ABANDON_DAYS } from './autoplay-rules.js';
import { cryoActive, cryoForever } from '../../shared/cryo-rules.js';
import { cryoCenterHooks } from './cryo-hooks.js';
import { cryoSleepers } from './autoplay.js';
import { CRYO_PODS } from './data/catalogues.js';

/** Il testo del pulsante vicino a un oggetto del centro (null per l'uscita). */
function cryoCenterPrompt(key: string): { text: string } | null {
  if (key === 'cryoDesk') return { text: '🧊 Parla con la tecnica della criogenesi' };
  if (key === 'cryoConsole') return { text: '📊 Guarda i parametri delle capsule' };
  if (key === 'cryoInfo') return { text: 'ℹ️ Come funziona la criogenesi' };
  if (key === 'myPod')
    return {
      text: cryoActive(myCryo(), Date.now())
        ? '🧊 Guarda la tua capsula'
        : '🧊 Guarda la capsula libera',
    };
  return null;
}

async function cryoCenterAct(key: string): Promise<void> {
  if (key === 'cryoDesk') await openCryo();
  else if (key === 'cryoConsole') lookAtConsole();
  else if (key === 'cryoInfo') await howItWorks();
  else if (key === 'myPod') lookAtMyPod();
}

/** "fino al 9 dicembre" o "per sempre". */
function untilText(): string {
  const pass = myCryo();
  if (!pass) return '';
  if (cryoForever(pass)) return 'per sempre';
  return (
    'fino al ' + new Date(pass.until).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })
  );
}

function lookAtMyPod(): void {
  sfx('click');
  if (cryoActive(myCryo(), Date.now()))
    toast(
      `🧊 La tua capsula è pronta, ${untilText()}: se mentre sei via stai per morire, ci entri e per te il tempo si ferma.`,
      6000,
    );
  else
    toast(
      '🧊 Questa capsula è libera e porta il tuo nome. Per prenotarla parla con la tecnica all’accettazione.',
      6000,
    );
}

function lookAtConsole(): void {
  sfx('click');
  const mine = cryoActive(myCryo(), Date.now());
  toast(
    `📊 Temperatura −196 °C · Azoto liquido all’85% · ${cryoSleepers().length} capsule su ${CRYO_PODS.length} occupate dai vicini. ` +
      (mine ? 'La tua capsula: pronta ✅' : 'La tua capsula: libera'),
    6000,
  );
}

async function howItWorks(): Promise<void> {
  await openDialog({
    title: 'ℹ️ Come funziona la criogenesi',
    text:
      `Se non entri nel gioco per ${ABANDON_DAYS} giorni di fila, il tuo personaggio muore e la sua ` +
      'stanza va a qualcun altro.\n\n' +
      '🧊 Con la criogenesi, mentre sei via il tuo personaggio vive da solo come sempre. Quando sta ' +
      `per morire (salute al 10%, o il giorno prima dei ${ABANDON_DAYS} giorni) entra nella sua ` +
      'capsula: da lì i parametri non calano più, i tuoi animali non hanno fame e il conto alla ' +
      'rovescia si ferma. Gli altri ti vedono qui, addormentato in una capsula.\n\n' +
      '▶️ Quando torni, ti risvegli nella capsula e giochi come sempre.\n\n' +
      'Per attivarla parla con la tecnica all’accettazione.',
    buttons: [{ label: 'Ho capito', value: null, color: '#2b6f9e' }],
  });
}

cryoCenterHooks.prompt = cryoCenterPrompt;
cryoCenterHooks.act = cryoCenterAct;
