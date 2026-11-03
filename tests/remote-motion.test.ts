import { describe, expect, it } from 'vitest';
import { RENDER_DELAY, addSample, newMotion, positionAt } from '../src/game/remote-motion';

/** Un giocatore che cammina verso destra a 130 unità al secondo e manda la posizione ogni 100 ms. */
function walker(arrivals: number[]) {
  const m = newMotion();
  arrivals.forEach((late, i) => addSample(m, 1000 + i * 100, i * 13, 0, 5000 + i * 100 + late));
  return m;
}

describe('movimento degli altri giocatori', () => {
  it('senza posizioni non sa dove mostrarlo', () => {
    expect(positionAt(newMotion(), 0)).toBeNull();
  });

  it('cammina a velocità costante anche se i messaggi arrivano in ritardo irregolare', () => {
    const m = walker([0, 40, 5, 70, 0, 30, 60, 0, 20, 0]);
    // tra un fotogramma e l'altro (16 ms) si sposta sempre più o meno dello stesso tratto
    const steps: number[] = [];
    let prev = positionAt(m, 5000 + RENDER_DELAY + 100)!.x;
    for (let t = 5000 + RENDER_DELAY + 116; t < 5000 + RENDER_DELAY + 800; t += 16) {
      const x = positionAt(m, t)!.x;
      steps.push(x - prev);
      prev = x;
    }
    for (const s of steps) expect(s).toBeCloseTo(13 * 0.16, 5);
  });

  it("finite le posizioni si ferma sull'ultima", () => {
    const m = walker([0, 0, 0]);
    expect(positionAt(m, 99999)).toEqual({ x: 26, y: 0 });
  });

  it('un salto lontano (porta, cambio stanza) non diventa una lunga scivolata', () => {
    const m = newMotion();
    addSample(m, 1000, 0, 0, 5000);
    addSample(m, 1100, 400, 0, 5100);
    expect(positionAt(m, 5100)).toEqual({ x: 400, y: 0 });
  });

  it('ignora i messaggi doppi o arrivati fuori ordine', () => {
    const m = newMotion();
    addSample(m, 1000, 0, 0, 5000);
    addSample(m, 1200, 26, 0, 5200);
    addSample(m, 1100, 999, 0, 5210);
    addSample(m, 1200, 999, 0, 5220);
    expect(m.buf.map((b) => b.x)).toEqual([0, 26]);
  });
});
