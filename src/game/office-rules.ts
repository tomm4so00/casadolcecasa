// Regole del turno in ufficio, oltre ai compiti da prendere e consegnare: la sete, le stampe
// chieste dai colleghi (in parallelo ai compiti) e la visita del capo. Niente browser qui: le usa
// office.ts e le controllano i test.

/** Da piena a vuota, la goccia della sete si svuota in questi secondi. */
export const THIRST_SECONDS = 28;
/** Sotto questo livello compare l'avviso "bevi". */
export const THIRST_WARN = 0.35;
/** Disidratati: per quanti secondi ci si muove più lenti, e quanto. */
export const SLOW_SECONDS = 4;
export const SLOW_FACTOR = 0.6;
/** Quanto ci mette la stampante a far uscire un foglio. */
export const PRINT_SECONDS = 2.5;

/** Il capo arriva in un turno su cinque: è un evento raro. */
export const BOSS_CHANCE = 0.2;
/** Appena esce dalla sua stanza tutto si ferma per un attimo, così lo si nota. */
export const BOSS_FREEZE = 2.5;
/** Quante cose chiede, una alla volta, e quanto tempo dà per ciascuna. */
export const BOSS_REQUESTS = 3;
export const BOSS_REQUEST_SECONDS = 8;
/** Un foglio va prima stampato: per quello dà qualche secondo in più. */
export const BOSS_PRINT_SECONDS = 11;
/** Velocità del capo che entra ed esce. */
export const BOSS_SPEED = 110;
/** Quanto dura al massimo la visita, dall'uscita dalla sua stanza al ritorno (camminate comprese). */
export const BOSS_VISIT_SECONDS = BOSS_FREEZE + BOSS_REQUESTS * BOSS_PRINT_SECONDS + 6;

/** Cosa chiede il capo: un oggetto che c'è nella stanza o un foglio stampato. */
export type BossRequest = { kind: 'item'; id: string } | { kind: 'print' };

const clamp01 = (k: number) => Math.max(0, Math.min(1, k));

/** Livello della sete dopo `dt` secondi (1 = appena bevuto, 0 = disidratati). */
export function thirstAfter(level: number, dt: number): number {
  return clamp01(level - dt / THIRST_SECONDS);
}

/** Secondi fino alla prossima stampa chiesta da un collega. `r` tra 0 e 1. */
export function printGap(r: number): number {
  return 12 + clamp01(r) * 10;
}

/**
 * Se in questo turno arriva il capo e dopo quanti secondi: nella prima metà del turno, così la sua
 * visita finisce prima della fine. `r1`, `r2` tra 0 e 1; `shift` è la durata del turno.
 */
export function bossPlan(r1: number, r2: number, shift: number): { comes: boolean; at: number } {
  return { comes: r1 < BOSS_CHANCE, at: shift * (0.25 + clamp01(r2) * 0.2) };
}

/**
 * Le richieste del capo, una alla volta: oggetti che sono nella stanza (`items`, senza doppioni) e al
 * massimo un foglio stampato. `rand` dà numeri tra 0 e 1, uno per richiesta.
 */
export function bossRequests(items: readonly string[], rand: () => number): BossRequest[] {
  const left = [...items];
  const out: BossRequest[] = [];
  let printed = false;
  for (let i = 0; i < BOSS_REQUESTS; i++) {
    const r = clamp01(rand());
    if ((!printed && r < 0.3) || !left.length) {
      if (printed) break;
      printed = true;
      out.push({ kind: 'print' });
      continue;
    }
    const k = Math.min(left.length - 1, Math.floor(r * left.length));
    out.push({ kind: 'item', id: left.splice(k, 1)[0] });
  }
  return out;
}

/** Secondi dati per una richiesta: di meno per un oggetto, di più per un foglio da stampare. */
export const bossRequestSeconds = (req: BossRequest): number =>
  req.kind === 'print' ? BOSS_PRINT_SECONDS : BOSS_REQUEST_SECONDS;

/** Bonus per aver accontentato il capo in tutto: vale tre consegne. */
export function bossBonus(perItem: number): number {
  return perItem * 3;
}

/** Multa se anche una sola richiesta del capo è andata a vuoto: vale due consegne. */
export function bossFine(perItem: number): number {
  return perItem * 2;
}
