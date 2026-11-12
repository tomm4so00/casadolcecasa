import type { JobKey } from '../../shared/job-pay-rules.js';

/** Dati del turno: separati dalla scena e dal risultato della richiesta di pagamento. */
export interface WorkShift {
  jobKey: JobKey;
  title: string;
  pay: number;
  perItem: number;
  delivered: number;
  remaining: number;
  serverShift?: string;
  tips?: number;
  fine?: number;
  fineLabel?: string;
  rating?: number;
  mult?: number;
}

export interface CarriedWorkItem {
  id: string;
  e: string;
  label: string;
  office?: boolean;
}

export interface WorkStep {
  item: string;
  target: string;
  text: string;
}

export interface WorkTask {
  title: string;
  steps: WorkStep[];
}

export interface WorkTarget {
  id: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  z?: number;
  draw?: 'beam' | 'panel';
}

export interface WorkConfig {
  title: string;
  mode?: 'service' | 'hospital';
  targets: WorkTarget[];
  pool: Record<string, [emoji: string, label: string]>;
  tasks: WorkTask[];
}

/** Le proprietà comuni delle postazioni; i campi propri di un lavoro restano espliciti. */
export interface WorkInteraction {
  x: number;
  y: number;
  w: number;
  h: number;
  name: string;
  kind?: string;
  id?: string;
  label?: string;
  item?: CarriedWorkItem;
  office?: boolean;
  hosp?: string;
  station?: string;
  idx?: number;
  reach?: number;
  [extra: string]: unknown;
}

export interface WorkState {
  active: boolean;
  job: JobKey | '';
  score: number;
  target: number;
  cfg: WorkConfig | null;
  task: WorkTask | null;
  stepIdx: number;
  map: Record<string, WorkInteraction>;
  carry: CarriedWorkItem | null;
  lastTask: number;
  el: HTMLElement | null;
}

/** Il lavoro comunica col controller attraverso questo contratto, senza importarlo. */
export interface WorkHost {
  hud(): void;
  pop(text: string, ok?: boolean): void;
  score(delta: number): void;
  spawnTask(): void;
  starting(): boolean;
}
