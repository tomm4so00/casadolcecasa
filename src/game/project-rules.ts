// Progetti di gruppo del laboratorio ingegneristico (senza dipendenze dal browser, così è testabile).

export type ProjectId = 'rocket';

export interface ProjectDef {
  id: ProjectId;
  name: string;
  description: string;
  /** Soglie (somme versate in totale) a cui il progetto avanza di una fase. */
  stages: { at: number; label: string }[];
}

export const PROJECTS: Record<ProjectId, ProjectDef> = {
  rocket: {
    id: 'rocket',
    name: 'Razzo spaziale 🚀',
    description:
      'Costruiamo insieme un razzo nella zona esterna del laboratorio. Con 5.000 € iniziano i lavori e si vedono i primi pezzi; con altri 10.000 € il razzo è completo.',
    stages: [
      { at: 5000, label: 'Lavori iniziati: primi pezzi del razzo' },
      { at: 15000, label: 'Razzo completo' },
    ],
  },
};

/** Versamento minimo, così la bacheca non si riempie di monetine. */
export const MIN_DONATION = 10;

export interface ProjectState {
  /** Totale versato da tutti i giocatori. */
  funded: number;
  /** Quanto ha versato ogni giocatore. */
  donors: Record<string, { name: string; amount: number }>;
}

/** Obiettivo finale (l'ultima soglia). */
export const projectGoal = (p: ProjectDef): number => p.stages[p.stages.length - 1].at;

/** Fase raggiunta: 0 = nessun lavoro, 1 = primi pezzi, 2 = completo. */
export function projectStage(p: ProjectDef, funded: number): number {
  return p.stages.filter((s) => funded >= s.at).length;
}

/** Quanto manca alla prossima fase (0 se il progetto è completo). */
export function toNextStage(p: ProjectDef, funded: number): number {
  const next = p.stages.find((s) => funded < s.at);
  return next ? next.at - funded : 0;
}

/** Spiega perché un versamento non va bene, oppure null se va bene. */
export function donationError(
  p: ProjectDef,
  funded: number,
  amount: number,
  money: number,
): string | null {
  const left = projectGoal(p) - funded;
  if (left <= 0) return 'Il progetto è già completo!';
  if (!Number.isSafeInteger(amount) || amount <= 0) return 'Scrivi un numero intero di euro.';
  if (amount < MIN_DONATION && amount < left) return `Il versamento minimo è di ${MIN_DONATION} €.`;
  if (amount > left) return `Per completare il progetto mancano solo ${left} €.`;
  if (amount > money) return 'Non hai abbastanza soldi in cassaforte.';
  return null;
}

/** Legge lo stato dal database scartando i valori non validi. */
export function decodeProject(value: unknown): ProjectState {
  const out: ProjectState = { funded: 0, donors: {} };
  if (!value || typeof value !== 'object') return out;
  const v = value as Record<string, unknown>;
  if (typeof v.funded === 'number' && Number.isFinite(v.funded) && v.funded > 0)
    out.funded = Math.floor(v.funded);
  const donors = (v.donors || {}) as Record<string, unknown>;
  for (const [pid, d] of Object.entries(donors)) {
    if (!d || typeof d !== 'object') continue;
    const { name, amount } = d as Record<string, unknown>;
    if (typeof amount === 'number' && amount > 0)
      out.donors[pid] = { name: typeof name === 'string' ? name.slice(0, 20) : '?', amount };
  }
  return out;
}

/** Chi ha versato di più, in ordine. */
export function topDonors(
  state: ProjectState,
  n = 5,
): { id: string; name: string; amount: number }[] {
  return Object.entries(state.donors)
    .map(([id, d]) => ({ id, ...d }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, n);
}
