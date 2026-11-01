// Game loop: chiama tick(delta, time) a ogni frame.
// delta = secondi dall'ultimo frame, time = secondi totali di gioco.
export function startLoop(tick) {
  let last = performance.now();
  let time = 0;

  function frame(now) {
    requestAnimationFrame(frame);
    let delta = (now - last) / 1000;
    last = now;
    // Evita salti enormi (tab in background) o valori non validi
    if (!(delta >= 0) || delta > 0.1) delta = 0.016;
    time += delta;
    tick(delta, time);
  }

  requestAnimationFrame(frame);
}
