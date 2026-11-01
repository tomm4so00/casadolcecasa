// Canvas e contesto 2D condivisi da tutto il codice di disegno.
export let canvas = null;
export let ctx = null;

export function initCanvas(id) {
  canvas = document.getElementById(id);
  ctx = canvas.getContext('2d');
  resize();
  window.addEventListener('resize', resize);
}

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
