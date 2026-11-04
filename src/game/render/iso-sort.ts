// Ordine di disegno delle parti di un mobile ruotato (senza dipendenze dal browser, così è testabile).
// Ogni parte è un parallelepipedo allineato agli assi; chi osserva guarda da +x, +y e dall'alto.

export interface IsoPart {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
  draw: () => void;
}

const EPS = 0.01;

/** true se `a` sta tutta dietro o sotto `b`, quindi va disegnata prima. */
export function drawsBefore(a: IsoPart, b: IsoPart): boolean | null {
  if (a.maxX <= b.minX + EPS) return true;
  if (b.maxX <= a.minX + EPS) return false;
  if (a.maxY <= b.minY + EPS) return true;
  if (b.maxY <= a.minY + EPS) return false;
  if (a.maxZ <= b.minZ + EPS) return true;
  if (b.maxZ <= a.minZ + EPS) return false;
  // Si compenetrano (es. coperta appoggiata dentro il materasso): sopra va chi arriva più in alto.
  if (a.maxZ < b.maxZ - EPS) return true;
  if (b.maxZ < a.maxZ - EPS) return false;
  return null; // altrimenti decide la profondità
}

/**
 * Le due parti si sovrappongono sullo schermo? Solo allora conta chi sta davanti:
 * confrontare parti lontane crea vincoli inutili e a volte contraddittori.
 * Proiezione: orizzontale ∝ x − y, verticale ∝ (x + y) / 2 − z.
 */
function overlapOnScreen(a: IsoPart, b: IsoPart): boolean {
  const ax0 = a.minX - a.maxY,
    ax1 = a.maxX - a.minY,
    bx0 = b.minX - b.maxY,
    bx1 = b.maxX - b.minY;
  const ay0 = (a.minX + a.minY) / 2 - a.maxZ,
    ay1 = (a.maxX + a.maxY) / 2 - a.minZ,
    by0 = (b.minX + b.minY) / 2 - b.maxZ,
    by1 = (b.maxX + b.maxY) / 2 - b.minZ;
  return ax0 < bx1 - EPS && bx0 < ax1 - EPS && ay0 < by1 - EPS && by0 < ay1 - EPS;
}

const depthOf = (p: IsoPart) => p.minX + p.maxX + p.minY + p.maxY + (p.minZ + p.maxZ) * 0.01;

/** Ordina le parti dal fondo verso chi osserva (ordinamento topologico, con la profondità come riserva). */
export function sortIsoParts(parts: IsoPart[]): IsoPart[] {
  const n = parts.length;
  const after: number[][] = parts.map(() => []);
  const pending = new Array(n).fill(0);
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      if (!overlapOnScreen(parts[i], parts[j])) continue;
      const order = drawsBefore(parts[i], parts[j]);
      if (order === true) {
        after[i].push(j);
        pending[j]++;
      } else if (order === false) {
        after[j].push(i);
        pending[i]++;
      }
    }
  const done = new Array(n).fill(false);
  const out: IsoPart[] = [];
  while (out.length < n) {
    // fra le parti pronte prende quella più lontana; se c'è un ciclo, quella più lontana in assoluto
    let pick = -1;
    for (let i = 0; i < n; i++)
      if (!done[i] && pending[i] === 0 && (pick < 0 || depthOf(parts[i]) < depthOf(parts[pick])))
        pick = i;
    if (pick < 0)
      for (let i = 0; i < n; i++)
        if (!done[i] && (pick < 0 || depthOf(parts[i]) < depthOf(parts[pick]))) pick = i;
    done[pick] = true;
    out.push(parts[pick]);
    for (const j of after[pick]) pending[j]--;
  }
  return out;
}
