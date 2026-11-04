// Disegni dei 20 pezzi da collezione. Ogni disegno è alto circa 20 unità: si disegna con l'origine
// sul piano d'appoggio (al centro) e la y negativa verso l'alto; chi chiama scala e trasla.
type Ctx = CanvasRenderingContext2D;
type Stops = [number, string][];

const EDGE = 'rgba(40,24,12,0.55)';

function lin(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, stops: Stops) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}
function rad(
  ctx: Ctx,
  x: number,
  y: number,
  r0: number,
  x1: number,
  y1: number,
  r1: number,
  stops: Stops,
) {
  const g = ctx.createRadialGradient(x, y, r0, x1, y1, r1);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}
function fillStroke(
  ctx: Ctx,
  fill: string | CanvasGradient,
  stroke: string | null = EDGE,
  lw = 0.35,
) {
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lw;
    ctx.stroke();
  }
}
function ell(ctx: Ctx, x: number, y: number, rx: number, ry: number, rot = 0) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
}
function rr(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}
function poly(ctx: Ctx, pts: number[][]) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
}
function seg(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, color: string, lw: number) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}
/** Riflesso di luce: una striscia chiara e sottile. */
function shine(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, alpha = 0.6, lw = 0.6) {
  ctx.lineCap = 'round';
  seg(ctx, x0, y0, x1, y1, `rgba(255,255,255,${alpha})`, lw);
  ctx.lineCap = 'butt';
}
function sparkle(ctx: Ctx, x: number, y: number, r: number, alpha: number) {
  ctx.fillStyle = `rgba(255,255,255,${alpha})`;
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.lineTo(x + r * 0.25, y - r * 0.25);
  ctx.lineTo(x + r, y);
  ctx.lineTo(x + r * 0.25, y + r * 0.25);
  ctx.lineTo(x, y + r);
  ctx.lineTo(x - r * 0.25, y + r * 0.25);
  ctx.lineTo(x - r, y);
  ctx.lineTo(x - r * 0.25, y - r * 0.25);
  ctx.closePath();
  ctx.fill();
}
const BRASS: Stops = [
  [0, '#7a5a1c'],
  [0.35, '#f3d27a'],
  [0.6, '#c9a227'],
  [1, '#6e4f14'],
];
const CHROME: Stops = [
  [0, '#6c7a89'],
  [0.4, '#f5f7fa'],
  [0.7, '#aab4be'],
  [1, '#56616d'],
];
const DARK_WOOD: Stops = [
  [0, '#3b1f0e'],
  [0.45, '#7a4421'],
  [1, '#2e170a'],
];

/** Lancette di un quadrante all'ora vera. */
function clockHands(ctx: Ctx, cx: number, cy: number, r: number, seconds: boolean) {
  const now = new Date();
  const m = now.getMinutes() + now.getSeconds() / 60;
  const h = (now.getHours() % 12) + m / 60;
  const hand = (a: number, len: number, lw: number, color: string) => {
    ctx.lineCap = 'round';
    seg(ctx, cx, cy, cx + Math.sin(a) * len, cy - Math.cos(a) * len, color, lw);
    ctx.lineCap = 'butt';
  };
  hand((h / 12) * Math.PI * 2, r * 0.5, r * 0.16, '#1e1e1e');
  hand((m / 60) * Math.PI * 2, r * 0.78, r * 0.11, '#1e1e1e');
  if (seconds) hand((now.getSeconds() / 60) * Math.PI * 2, r * 0.85, r * 0.05, '#c0392b');
  ell(ctx, cx, cy, r * 0.1, r * 0.1);
  ctx.fillStyle = '#1e1e1e';
  ctx.fill();
}
function clockTicks(ctx: Ctx, cx: number, cy: number, r: number, color: string) {
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const r0 = i % 3 ? r * 0.82 : r * 0.7;
    seg(
      ctx,
      cx + Math.sin(a) * r0,
      cy - Math.cos(a) * r0,
      cx + Math.sin(a) * r * 0.92,
      cy - Math.cos(a) * r * 0.92,
      color,
      i % 3 ? r * 0.05 : r * 0.1,
    );
  }
}

// ---------------------------------------------------------------- i pezzi

/** Tomo antico rilegato in pelle verde, con borchie d'ottone e un emblema alchemico dorato. */
function tomo(ctx: Ctx) {
  // pagine (si vedono a destra e sotto)
  rr(ctx, -5.6, -17.4, 13.2, 16.9, 0.6);
  fillStroke(
    ctx,
    lin(ctx, 0, -17, 0, 0, [
      [0, '#f4e6c4'],
      [1, '#d8c193'],
    ]),
  );
  for (let y = -16; y < -1; y += 1.1) seg(ctx, 6.3, y, 7.4, y + 0.1, 'rgba(120,90,50,0.35)', 0.2);
  // copertina
  rr(ctx, -7, -18.5, 13.2, 17.6, 0.8);
  fillStroke(
    ctx,
    lin(ctx, -7, 0, 6.5, 0, [
      [0, '#123220'],
      [0.25, '#2f6b3c'],
      [0.7, '#24573a'],
      [1, '#143523'],
    ]),
  );
  // dorso con le nervature
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(-7, -18.5, 2.3, 17.6);
  for (const y of [-15.5, -10, -4.5]) seg(ctx, -7, y, -4.7, y, '#d4af37', 0.55);
  // cornice dorata impressa
  ctx.strokeStyle = '#d4af37';
  ctx.lineWidth = 0.35;
  ctx.strokeRect(-3.6, -16.6, 8.2, 13.8);
  // emblema: cerchio, triangolo e una foglia
  ell(ctx, 0.5, -10, 2.8, 2.8);
  ctx.strokeStyle = '#e6c25a';
  ctx.lineWidth = 0.45;
  ctx.stroke();
  poly(ctx, [
    [0.5, -12.5],
    [2.65, -8.7],
    [-1.65, -8.7],
  ]);
  ctx.stroke();
  ell(ctx, 0.5, -10, 1, 1.9, 0.5);
  ctx.fillStyle = '#e6c25a';
  ctx.fill();
  seg(ctx, -0.2, -8.6, 1.2, -11.4, '#24573a', 0.2);
  // angoli d'ottone
  for (const [x, y, dx, dy] of [
    [6.2, -18.5, -2.4, 2.4],
    [6.2, -0.9, -2.4, -2.4],
  ]) {
    poly(ctx, [
      [x, y],
      [x + dx, y],
      [x, y + dy],
    ]);
    fillStroke(ctx, lin(ctx, x + dx, y, x, y + dy, BRASS), null);
  }
  // segnalibro di seta
  poly(ctx, [
    [1.6, -1],
    [2.6, -1],
    [2.6, 1.1],
    [2.1, 0.6],
    [1.6, 1.1],
  ]);
  fillStroke(ctx, '#a93226', null);
  shine(ctx, -4, -17.5, -4, -2.5, 0.18, 0.8);
}

/** Contorni dei continenti, molto semplificati: [longitudine, latitudine]. */
const CONTINENTS: number[][][] = [
  // Africa
  [
    [-17, 15],
    [-10, 30],
    [10, 35],
    [32, 31],
    [43, 12],
    [51, 11],
    [40, -5],
    [35, -25],
    [20, -35],
    [12, -15],
    [8, 4],
    [-8, 5],
  ],
  // Europa
  [
    [-10, 37],
    [-9, 44],
    [0, 50],
    [8, 55],
    [20, 60],
    [30, 70],
    [40, 65],
    [40, 45],
    [28, 40],
    [15, 38],
    [5, 43],
  ],
  // Asia
  [
    [40, 45],
    [40, 65],
    [70, 72],
    [110, 75],
    [140, 70],
    [160, 60],
    [135, 40],
    [120, 25],
    [105, 10],
    [95, 20],
    [80, 8],
    [70, 22],
    [55, 25],
    [45, 40],
  ],
  // America del Nord
  [
    [-165, 65],
    [-140, 70],
    [-95, 75],
    [-60, 60],
    [-75, 45],
    [-80, 30],
    [-97, 18],
    [-90, 15],
    [-105, 22],
    [-118, 33],
    [-125, 48],
    [-150, 58],
  ],
  // America del Sud
  [
    [-80, 10],
    [-60, 8],
    [-35, -7],
    [-40, -22],
    [-55, -35],
    [-68, -55],
    [-72, -40],
    [-80, -5],
  ],
  // Australia
  [
    [114, -22],
    [130, -12],
    [143, -12],
    [153, -28],
    [145, -38],
    [115, -34],
  ],
  // Groenlandia
  [
    [-50, 60],
    [-20, 70],
    [-30, 82],
    [-55, 80],
  ],
];

/** Globo d'epoca: mappa color seppia che gira piano, meridiano e piede d'ottone. */
function globo(ctx: Ctx, t: number) {
  const cy = -12.6,
    r = 6.2;
  // piede
  ell(ctx, 0, -0.9, 5.6, 1.5);
  fillStroke(ctx, lin(ctx, -5.6, 0, 5.6, 0, BRASS));
  rr(ctx, -0.8, -5.6, 1.6, 4.8, 0.4);
  fillStroke(ctx, lin(ctx, -0.8, 0, 0.8, 0, BRASS));
  // supporto a forcella fino al meridiano
  seg(ctx, 0, -5.4, 0, cy + r + 1.1, '#8a6a22', 0.9);
  // il globo
  ctx.save();
  ctx.translate(0, cy);
  ctx.rotate(0.4);
  ell(ctx, 0, 0, r, r);
  fillStroke(
    ctx,
    rad(ctx, -2, -2.4, 0.5, 0, 0, r, [
      [0, '#f1e3bd'],
      [0.6, '#b9c7ae'],
      [1, '#6f7a5c'],
    ]),
  );
  ctx.save();
  ell(ctx, 0, 0, r, r);
  ctx.clip();
  // paralleli
  for (const y of [-3.6, 0, 3.6]) {
    ell(ctx, 0, y, Math.sqrt(r * r - y * y), 0.6);
    ctx.strokeStyle = 'rgba(110,80,40,0.16)';
    ctx.lineWidth = 0.15;
    ctx.stroke();
  }
  // continenti: contorni (longitudine, latitudine) proiettati sulla sfera che gira
  const turn = t * 0.25;
  ctx.fillStyle = '#c69c5a';
  ctx.strokeStyle = 'rgba(90,60,25,0.6)';
  ctx.lineWidth = 0.16;
  ctx.lineJoin = 'round';
  for (const shape of CONTINENTS) {
    const pts = shape.map(([lon, lat]) => {
      const l = (lon * Math.PI) / 180 + turn,
        p = (lat * Math.PI) / 180;
      // dietro la sfera: si schiaccia sul bordo
      const sx = Math.cos(l) < 0 ? Math.sign(Math.sin(l)) : Math.sin(l);
      return [r * sx * Math.cos(p), -r * Math.sin(p), Math.cos(l)];
    });
    if (pts.every((q) => q[2] < 0)) continue;
    poly(
      ctx,
      pts.map((q) => [q[0], q[1]]),
    );
    ctx.fill();
    ctx.stroke();
  }
  // ombra laterale
  ell(ctx, 0, 0, r, r);
  ctx.fillStyle = rad(ctx, -2.5, -2.5, 1, 0, 0, r, [
    [0.6, 'rgba(0,0,0,0)'],
    [1, 'rgba(60,35,10,0.45)'],
  ]);
  ctx.fill();
  ctx.restore();
  // perni dell'asse
  for (const y of [-r - 0.9, r + 0.9]) {
    ell(ctx, 0, y, 0.6, 0.6);
    fillStroke(ctx, '#e3c565', null);
  }
  ctx.restore();
  // meridiano d'ottone
  ell(ctx, 0, cy, r + 1.1, r + 1.1);
  ctx.strokeStyle = lin(ctx, -r, 0, r, 0, BRASS);
  ctx.lineWidth = 0.9;
  ctx.stroke();
  ell(ctx, -2.2, cy - 2.6, 1.6, 1, -0.6);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fill();
}

/** Clessidra di cristallo con sabbia nera che scende (un giro al minuto). */
function clessidra(ctx: Ctx) {
  const phase = (Date.now() / 60000) % 1;
  const wood = lin(ctx, -6, 0, 6, 0, DARK_WOOD);
  // colonnine tornite
  for (const x of [-4.9, 4.9]) {
    rr(ctx, x - 0.55, -18.4, 1.1, 16.8, 0.5);
    fillStroke(ctx, lin(ctx, x - 0.6, 0, x + 0.6, 0, DARK_WOOD), null);
    for (const y of [-14, -10, -6]) {
      ell(ctx, x, y, 0.85, 0.45);
      fillStroke(ctx, '#6b3a1a', null);
    }
  }
  // vetro
  const glass = new Path2D();
  glass.moveTo(-3.9, -18);
  glass.bezierCurveTo(-4.4, -13.5, -0.6, -11.6, -0.45, -10);
  glass.bezierCurveTo(-0.6, -8.4, -4.4, -6.5, -3.9, -2);
  glass.lineTo(3.9, -2);
  glass.bezierCurveTo(4.4, -6.5, 0.6, -8.4, 0.45, -10);
  glass.bezierCurveTo(0.6, -11.6, 4.4, -13.5, 3.9, -18);
  glass.closePath();
  ctx.fillStyle = 'rgba(210,235,255,0.28)';
  ctx.fill(glass);
  ctx.save();
  ctx.clip(glass);
  // sabbia: sopra cala, sotto cresce
  const top = 7 * (1 - phase);
  ctx.fillStyle = '#17161c';
  ctx.beginPath();
  ctx.moveTo(-4.5, -10.6 - top);
  ctx.quadraticCurveTo(0, -10.6 - top + 1.2, 4.5, -10.6 - top);
  ctx.lineTo(4.5, -10);
  ctx.lineTo(-4.5, -10);
  ctx.fill();
  const pile = 0.6 + 6 * phase;
  ctx.beginPath();
  ctx.moveTo(-4.5, -2);
  ctx.quadraticCurveTo(-2, -2 - pile * 0.5, 0, -2 - pile);
  ctx.quadraticCurveTo(2, -2 - pile * 0.5, 4.5, -2);
  ctx.fill();
  if (phase < 0.98) seg(ctx, 0, -10.2, 0, -2 - pile, '#17161c', 0.28);
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth = 0.3;
  ctx.stroke(glass);
  shine(ctx, -2.8, -16.6, -2.2, -13.6, 0.75, 0.5);
  shine(ctx, -2.8, -3.4, -2.3, -6, 0.6, 0.45);
  // piani di legno
  for (const y of [-19.6, -2]) {
    rr(ctx, -6.2, y, 12.4, 1.7, 0.5);
    fillStroke(ctx, wood);
  }
  for (const x of [-5, 5]) {
    rr(ctx, x - 0.9, -0.3, 1.8, 0.6, 0.2);
    fillStroke(ctx, '#2e170a', null);
  }
}

/** Sfera di cristallo con la nebbia che gira, su una base di legno con rune che brillano. */
function sfera(ctx: Ctx, t: number) {
  const cy = -10.8,
    r = 6.4;
  // alone
  ell(ctx, 0, cy, r + 2.5, r + 2.5);
  ctx.fillStyle = rad(ctx, 0, cy, r, 0, cy, r + 2.5, [
    [0, 'rgba(190,120,255,0.35)'],
    [1, 'rgba(190,120,255,0)'],
  ]);
  ctx.fill();
  // base intagliata
  poly(ctx, [
    [-5.4, 0],
    [5.4, 0],
    [4, -3.2],
    [3.2, -4.6],
    [-3.2, -4.6],
    [-4, -3.2],
  ]);
  fillStroke(ctx, lin(ctx, -5, 0, 5, 0, DARK_WOOD));
  const glow = 0.55 + 0.45 * Math.sin(t * 2);
  ctx.strokeStyle = `rgba(214,162,255,${glow})`;
  ctx.lineWidth = 0.3;
  for (const [x, s] of [
    [-2.6, 1],
    [0, -1],
    [2.6, 1],
  ]) {
    ctx.beginPath();
    ctx.moveTo(x - 0.6, -1);
    ctx.lineTo(x, -3 + s * 0.4);
    ctx.lineTo(x + 0.6, -1);
    ctx.moveTo(x - 0.5, -2);
    ctx.lineTo(x + 0.5, -2);
    ctx.stroke();
  }
  // sfera
  ell(ctx, 0, cy, r, r);
  fillStroke(
    ctx,
    rad(ctx, -2, cy - 2.4, 0.4, 0, cy, r, [
      [0, '#f6ecff'],
      [0.35, '#b07ce0'],
      [0.8, '#4b1d7a'],
      [1, '#240b3d'],
    ]),
    'rgba(255,255,255,0.4)',
  );
  ctx.save();
  ell(ctx, 0, cy, r, r);
  ctx.clip();
  for (let i = 0; i < 3; i++) {
    const a = t * (0.6 + i * 0.25) + i * 2;
    ell(ctx, Math.cos(a) * 1.6, cy + Math.sin(a * 1.3) * 1.4, 3.6 - i * 0.7, 1.4, a);
    ctx.fillStyle = `rgba(235,200,255,${0.22 + i * 0.06})`;
    ctx.fill();
  }
  ctx.restore();
  for (const [x, y, p] of [
    [2.4, -14, 0],
    [-1.6, -8.4, 2],
    [1.2, -7.6, 4],
  ])
    sparkle(ctx, x, y, 0.9, 0.4 + 0.5 * Math.max(0, Math.sin(t * 2.4 + p)));
  ell(ctx, -2.2, cy - 2.6, 1.8, 1.1, -0.6);
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fill();
}

/** Orologio da tavolo in legno col pendolo che oscilla e le lancette all'ora vera. */
function pendolo(ctx: Ctx, t: number) {
  // cassa ad arco
  ctx.beginPath();
  ctx.moveTo(-6, -1.2);
  ctx.lineTo(-6, -13.5);
  ctx.arc(0, -13.5, 6, Math.PI, 0);
  ctx.lineTo(6, -1.2);
  ctx.closePath();
  fillStroke(
    ctx,
    lin(ctx, -6, 0, 6, 0, [
      [0, '#4a2510'],
      [0.4, '#9c5a2c'],
      [0.75, '#7a4019'],
      [1, '#3e1e0b'],
    ]),
  );
  // modanature dorate
  ctx.beginPath();
  ctx.arc(0, -13.5, 6.4, Math.PI, 0);
  ctx.strokeStyle = '#c9a227';
  ctx.lineWidth = 0.45;
  ctx.stroke();
  rr(ctx, -7, -1.6, 14, 1.6, 0.4);
  fillStroke(ctx, lin(ctx, -7, 0, 7, 0, DARK_WOOD));
  ell(ctx, 0, -20.2, 0.9, 0.9);
  fillStroke(ctx, lin(ctx, -1, 0, 1, 0, BRASS), null);
  // quadrante
  ell(ctx, 0, -13.3, 4.4, 4.4);
  fillStroke(ctx, lin(ctx, -4, 0, 4, 0, BRASS), null);
  ell(ctx, 0, -13.3, 3.8, 3.8);
  fillStroke(
    ctx,
    rad(ctx, -1, -14.5, 0.5, 0, -13.3, 3.8, [
      [0, '#fffaf0'],
      [1, '#e8dcc0'],
    ]),
    null,
  );
  clockTicks(ctx, 0, -13.3, 3.8, '#2b2b2b');
  clockHands(ctx, 0, -13.3, 3.8, false);
  // finestrella del pendolo
  rr(ctx, -3, -8.2, 6, 6.2, 0.6);
  fillStroke(ctx, '#1d140d', '#c9a227', 0.35);
  const a = Math.sin(t * 3.2) * 0.32;
  ctx.save();
  ctx.translate(0, -8);
  ctx.rotate(a);
  seg(ctx, 0, 0, 0, 4.4, '#c9a227', 0.3);
  ell(ctx, 0, 4.6, 1.15, 1.15);
  fillStroke(
    ctx,
    rad(ctx, -0.3, 4.3, 0.1, 0, 4.6, 1.2, [
      [0, '#fff3c4'],
      [1, '#b8860b'],
    ]),
    null,
  );
  ctx.restore();
  shine(ctx, -2.2, -7.4, -1.2, -3, 0.25, 0.6);
}

/** Modello anatomico: mezzo busto con la pelle e mezzo aperto sugli organi. */
function torso(ctx: Ctx) {
  ell(ctx, 0, -0.8, 4.8, 1.2);
  fillStroke(
    ctx,
    lin(ctx, -5, 0, 5, 0, [
      [0, '#1b1b1b'],
      [0.5, '#4a4a4a'],
      [1, '#141414'],
    ]),
  );
  rr(ctx, -0.55, -4.6, 1.1, 4, 0.3);
  fillStroke(ctx, lin(ctx, -0.6, 0, 0.6, 0, CHROME), null);
  const body = new Path2D();
  body.moveTo(-1.7, -20.6);
  body.lineTo(1.7, -20.6);
  body.quadraticCurveTo(2, -18.6, 5, -18.2);
  body.quadraticCurveTo(7.3, -17.6, 7, -14.6);
  body.lineTo(6.2, -13.4);
  body.quadraticCurveTo(4.6, -10.6, 4.6, -8.2);
  body.quadraticCurveTo(5.6, -6, 5.2, -4.2);
  body.lineTo(-5.2, -4.2);
  body.quadraticCurveTo(-5.6, -6, -4.6, -8.2);
  body.quadraticCurveTo(-4.6, -10.6, -6.2, -13.4);
  body.lineTo(-7, -14.6);
  body.quadraticCurveTo(-7.3, -17.6, -5, -18.2);
  body.quadraticCurveTo(-2, -18.6, -1.7, -20.6);
  body.closePath();
  ctx.fillStyle = lin(ctx, -7, 0, 7, 0, [
    [0, '#c98b63'],
    [0.4, '#f2c9a6'],
    [1, '#d79c76'],
  ]);
  ctx.fill(body);
  // metà destra aperta
  ctx.save();
  ctx.clip(body);
  ctx.fillStyle = '#6e1b1b';
  ctx.fillRect(0.2, -21, 8, 17);
  const organ = (
    x: number,
    y: number,
    rx: number,
    ry: number,
    a: number,
    c0: string,
    c1: string,
  ) => {
    ell(ctx, x, y, rx, ry, a);
    fillStroke(
      ctx,
      rad(ctx, x - rx * 0.3, y - ry * 0.3, 0.1, x, y, Math.max(rx, ry), [
        [0, c0],
        [1, c1],
      ]),
      'rgba(60,10,10,0.5)',
      0.2,
    );
  };
  organ(3.6, -14.6, 2.4, 3.3, 0.1, '#f7b5c0', '#d36d80'); // polmone
  organ(1.3, -13.4, 1.5, 1.9, -0.5, '#ff6b5b', '#9e1b14'); // cuore
  organ(2.9, -10.2, 2.9, 1.3, -0.15, '#b5543f', '#6e2416'); // fegato
  for (const [x, y] of [
    [1.3, -7.6],
    [3, -7.8],
    [2.1, -6.2],
    [3.9, -6.4],
    [1.2, -5.2],
    [3, -5],
  ])
    organ(x, y, 0.95, 0.75, 0, '#f6c3a0', '#c97f58'); // intestino
  ctx.restore();
  // costole accennate sulla metà con la pelle
  ctx.strokeStyle = 'rgba(150,90,60,0.35)';
  ctx.lineWidth = 0.25;
  for (const y of [-15, -13.4, -11.8]) {
    ctx.beginPath();
    ctx.moveTo(-0.4, y);
    ctx.quadraticCurveTo(-3, y - 0.6, -4.6, y + 1.2);
    ctx.stroke();
  }
  ctx.strokeStyle = EDGE;
  ctx.lineWidth = 0.35;
  ctx.stroke(body);
  seg(ctx, 0.2, -20.4, 0.2, -4.3, 'rgba(255,230,210,0.8)', 0.3);
  shine(ctx, -4.6, -16.8, -3.6, -9.5, 0.3, 0.7);
}

/** Busto classico di marmo con capelli ricci, panneggio e venature. */
function busto(ctx: Ctx) {
  const marble = lin(ctx, -7, -20, 7, 0, [
    [0, '#ffffff'],
    [0.55, '#e9e6e1'],
    [1, '#a9a6a2'],
  ]);
  // piedistallo
  rr(ctx, -4.8, -2.4, 9.6, 2.4, 0.3);
  fillStroke(
    ctx,
    lin(ctx, -5, 0, 5, 0, [
      [0, '#6b6e72'],
      [0.5, '#b5b9be'],
      [1, '#55585c'],
    ]),
  );
  rr(ctx, -3.4, -3.8, 6.8, 1.6, 0.4);
  fillStroke(ctx, '#9aa0a6');
  // spalle e petto col panneggio
  ctx.beginPath();
  ctx.moveTo(-7.4, -3.6);
  ctx.quadraticCurveTo(-7.8, -8.8, -3.4, -9.6);
  ctx.lineTo(3.4, -9.6);
  ctx.quadraticCurveTo(7.8, -8.8, 7.4, -3.6);
  ctx.closePath();
  fillStroke(ctx, marble);
  ctx.strokeStyle = 'rgba(120,115,110,0.45)';
  ctx.lineWidth = 0.3;
  for (const [x0, x1] of [
    [-5.5, -1],
    [-4.2, 1.4],
    [-2.6, 3.6],
  ]) {
    ctx.beginPath();
    ctx.moveTo(x0, -8.6);
    ctx.quadraticCurveTo((x0 + x1) / 2 + 1, -6, x1 + 2.6, -3.8);
    ctx.stroke();
  }
  // collo
  rr(ctx, -1.7, -12.2, 3.4, 3.2, 0.8);
  fillStroke(ctx, marble, null);
  // testa
  ell(ctx, 0, -15.2, 3.7, 4.4);
  fillStroke(ctx, marble);
  // capelli: piccoli riccioli fitti che coprono la testa, come nelle statue greche
  const curls: number[][] = [];
  for (const [rk, n, a0, a1] of [
    [0.98, 9, 196, 344],
    [0.72, 6, 215, 325],
  ])
    for (let i = 0; i < n; i++) {
      const ang = ((a0 + ((a1 - a0) * i) / (n - 1)) * Math.PI) / 180;
      curls.push([
        Math.cos(ang) * 3.7 * rk,
        -15.6 + Math.sin(ang) * 4.4 * rk,
        rk > 0.9 ? 0.78 : 0.72,
      ]);
    }
  for (const [x, y, r] of curls) {
    ell(ctx, x, y, r, r);
    fillStroke(
      ctx,
      rad(ctx, x - 0.3, y - 0.3, 0.05, x, y, r, [
        [0, '#ffffff'],
        [1, '#cdc8c1'],
      ]),
      'rgba(120,115,110,0.45)',
      0.15,
    );
  }
  // viso: sopracciglia, naso, bocca, orecchio
  ctx.strokeStyle = 'rgba(110,105,100,0.6)';
  ctx.lineWidth = 0.28;
  ctx.beginPath();
  ctx.moveTo(-2, -15.6);
  ctx.quadraticCurveTo(-1, -16.2, -0.2, -15.7);
  ctx.moveTo(0.5, -15.7);
  ctx.quadraticCurveTo(1.3, -16.2, 2.3, -15.6);
  ctx.moveTo(0.2, -15.4);
  ctx.lineTo(0.7, -13.4);
  ctx.lineTo(0, -13.2);
  ctx.moveTo(-0.9, -12.3);
  ctx.quadraticCurveTo(0.1, -11.8, 1.1, -12.3);
  ctx.stroke();
  for (const x of [-1.2, 1.4]) {
    ell(ctx, x, -14.9, 0.55, 0.25);
    ctx.fillStyle = 'rgba(110,105,100,0.45)';
    ctx.fill();
  }
  // venature del marmo
  ctx.strokeStyle = 'rgba(140,140,150,0.35)';
  ctx.lineWidth = 0.2;
  ctx.beginPath();
  ctx.moveTo(-6, -5);
  ctx.bezierCurveTo(-3, -6.5, -2, -4.5, 1, -6);
  ctx.moveTo(2.6, -13);
  ctx.bezierCurveTo(3.4, -14.6, 2.4, -16, 3.2, -17);
  ctx.stroke();
}

/** Lampada lava anni '70: bolle che salgono e scendono nel vetro luminoso. */
function lava(ctx: Ctx, t: number) {
  // alone di luce
  ell(ctx, 0, -11.5, 6, 8);
  ctx.fillStyle = rad(ctx, 0, -11.5, 1, 0, -11.5, 8, [
    [0, 'rgba(255,120,80,0.35)'],
    [1, 'rgba(255,120,80,0)'],
  ]);
  ctx.fill();
  // base a cono
  poly(ctx, [
    [-4.6, 0],
    [4.6, 0],
    [2.7, -6.2],
    [-2.7, -6.2],
  ]);
  fillStroke(
    ctx,
    lin(ctx, -4.6, 0, 4.6, 0, [
      [0, '#5b1d1d'],
      [0.4, '#c0392b'],
      [0.65, '#e74c3c'],
      [1, '#4a1414'],
    ]),
  );
  rr(ctx, -2.9, -6.6, 5.8, 0.8, 0.3);
  fillStroke(ctx, lin(ctx, -3, 0, 3, 0, CHROME), null);
  // vetro
  const glass = new Path2D();
  glass.moveTo(-2.6, -6.4);
  glass.bezierCurveTo(-3.6, -10, -3.4, -13, -1.8, -17.2);
  glass.lineTo(1.8, -17.2);
  glass.bezierCurveTo(3.4, -13, 3.6, -10, 2.6, -6.4);
  glass.closePath();
  ctx.fillStyle = lin(ctx, 0, -17, 0, -6, [
    [0, '#ff5fa2'],
    [0.6, '#e8467c'],
    [1, '#c2185b'],
  ]);
  ctx.fill(glass);
  ctx.save();
  ctx.clip(glass);
  for (let i = 0; i < 4; i++) {
    const p = (Math.sin(t * (0.35 + i * 0.07) + i * 1.9) + 1) / 2;
    const y = -7.4 - p * 8.8;
    const x = Math.sin(t * 0.5 + i * 2.3) * 0.9;
    ell(ctx, x, y, 1.2 + (i % 2) * 0.5 + p * 0.3, 1.5 + (1 - p) * 0.7);
    ctx.fillStyle = rad(ctx, x - 0.4, y - 0.4, 0.1, x, y, 2, [
      [0, '#ffe08a'],
      [1, '#ff9a2e'],
    ]);
    ctx.fill();
  }
  // pozza in fondo
  ell(ctx, 0, -6.4, 3, 1.3);
  ctx.fillStyle = '#ff9a2e';
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,255,255,0.45)';
  ctx.lineWidth = 0.3;
  ctx.stroke(glass);
  shine(ctx, -1.6, -15.6, -2.2, -9, 0.55, 0.45);
  // tappo
  poly(ctx, [
    [-1.9, -17.1],
    [1.9, -17.1],
    [1.1, -20.2],
    [-1.1, -20.2],
  ]);
  fillStroke(
    ctx,
    lin(ctx, -2, 0, 2, 0, [
      [0, '#5b1d1d'],
      [0.45, '#e74c3c'],
      [1, '#4a1414'],
    ]),
  );
}

/** Pila di fumetti d'epoca e un albo appoggiato con la copertina a fumetto. */
function fumetti(ctx: Ctx) {
  // albo in piedi, appoggiato dietro la pila
  ctx.save();
  ctx.translate(1.5, -3.6);
  ctx.rotate(0.1);
  rr(ctx, -5, -15.4, 10, 14, 0.3);
  fillStroke(ctx, '#fdf3dc');
  ctx.fillStyle = '#2156c9';
  ctx.fillRect(-4.5, -14.9, 9, 2.6);
  ctx.fillStyle = '#ffe14d';
  ctx.font = 'bold 2.1px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('SUPER', -0.6, -13.5);
  // esplosione col "POW!"
  ctx.fillStyle = '#e74c3c';
  ctx.fillRect(-4.5, -12.3, 9, 10.3);
  const star: number[][] = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const r = i % 2 ? 2.7 : 4.3;
    star.push([Math.cos(a) * r, -7.2 + Math.sin(a) * r * 0.85]);
  }
  poly(ctx, star);
  fillStroke(ctx, '#ffd23f', '#b33939', 0.25);
  ctx.fillStyle = '#c0392b';
  ctx.font = 'bold 1.9px sans-serif';
  ctx.fillText('POW!', 0, -7.1);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 1.1px sans-serif';
  ctx.fillText('10¢', 3.6, -14.2);
  // patina d'epoca
  ctx.fillStyle = 'rgba(160,120,60,0.15)';
  ctx.fillRect(-5, -15.4, 10, 14);
  ctx.restore();
  // pila di albi sdraiati, ognuno di un colore
  const colors = ['#2e86de', '#27ae60', '#f39c12', '#8e44ad'];
  colors.forEach((c, i) => {
    const y = -1.2 - i * 1.15,
      dx = [0, 0.8, -0.6, 0.4][i];
    rr(ctx, -7.5 + dx, y, 15, 1.15, 0.2);
    fillStroke(
      ctx,
      lin(ctx, -7.5, 0, 7.5, 0, [
        [0, c],
        [0.7, c],
        [1, '#fdf3dc'],
      ]),
      'rgba(40,24,12,0.4)',
      0.2,
    );
  });
  shine(ctx, -6.6, -4.2, 5, -4.2, 0.35, 0.25);
}

/** Manuale esoterico aperto su un leggio: Fiore della Vita e un esagramma sulle pagine. */
function manuale(ctx: Ctx) {
  // leggio
  poly(ctx, [
    [-8, 0],
    [8, 0],
    [7, -1.3],
    [-7, -1.3],
  ]);
  fillStroke(ctx, lin(ctx, -8, 0, 8, 0, DARK_WOOD));
  for (const x of [-5, 5]) seg(ctx, x, -1.3, x * 0.8, -6, '#4a2510', 0.8);
  // copertina viola sotto le pagine
  poly(ctx, [
    [-10, -3.6],
    [0, -2.4],
    [10, -3.6],
    [9.2, -18],
    [0, -16.4],
    [-9.2, -18],
  ]);
  fillStroke(
    ctx,
    lin(ctx, -10, 0, 10, 0, [
      [0, '#3c1053'],
      [0.5, '#5b2c6f'],
      [1, '#3c1053'],
    ]),
  );
  // pagine
  const page = (s: number) => {
    poly(ctx, [
      [0, -3.1],
      [s * 9.3, -4.3],
      [s * 8.6, -17.3],
      [0, -15.9],
    ]);
    fillStroke(
      ctx,
      lin(ctx, 0, 0, s * 9, 0, [
        [0, '#cdb88f'],
        [0.15, '#f1e4c6'],
        [1, '#f6ecd6'],
      ]),
      'rgba(90,60,30,0.45)',
      0.2,
    );
  };
  page(-1);
  page(1);
  // pagina di sinistra: Fiore della Vita
  ctx.strokeStyle = '#8a5a14';
  ctx.lineWidth = 0.18;
  const fx = -4.4,
    fy = -10.1,
    r = 1.45;
  ell(ctx, fx, fy, r, r);
  ctx.stroke();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    ell(ctx, fx + Math.cos(a) * r, fy + Math.sin(a) * r, r, r);
    ctx.stroke();
  }
  ell(ctx, fx, fy, r * 2.05, r * 2.05);
  ctx.lineWidth = 0.28;
  ctx.stroke();
  // pagina di destra: esagramma nel cerchio e righe di testo
  const hx = 4.3,
    hy = -12.2,
    hr = 2.4;
  ctx.strokeStyle = '#6c3483';
  ctx.lineWidth = 0.22;
  ell(ctx, hx, hy, hr, hr);
  ctx.stroke();
  for (const s of [1, -1]) {
    poly(ctx, [
      [hx, hy - hr * s],
      [hx + hr * 0.866, hy + hr * 0.5 * s],
      [hx - hr * 0.866, hy + hr * 0.5 * s],
    ]);
    ctx.stroke();
  }
  ell(ctx, hx, hy, 0.4, 0.4);
  ctx.fillStyle = '#c9a227';
  ctx.fill();
  for (let i = 0; i < 4; i++)
    seg(
      ctx,
      1.4,
      -8.6 + i * 1.05,
      7.6 - (i % 2) * 1.2,
      -8.9 + i * 1.05,
      'rgba(70,50,30,0.45)',
      0.22,
    );
  // segnalibro
  poly(ctx, [
    [-0.3, -3.2],
    [0.5, -3.2],
    [0.5, 0.6],
    [0.1, 0.1],
    [-0.3, 0.6],
  ]);
  fillStroke(ctx, '#c9a227', null);
  // ombra della piega
  seg(ctx, 0, -15.9, 0, -3.1, 'rgba(90,60,30,0.5)', 0.4);
}

/** Culla di Newton cromata: le palline alle estremità si passano il colpo. */
function newton(ctx: Ctx, t: number) {
  rr(ctx, -10, -2.2, 20, 2.2, 0.6);
  fillStroke(
    ctx,
    lin(ctx, 0, -2.2, 0, 0, [
      [0, '#4a4a4a'],
      [0.3, '#1b1b1b'],
      [1, '#0b0b0b'],
    ]),
  );
  shine(ctx, -9, -1.8, 9, -1.8, 0.35, 0.3);
  // telaio
  ctx.lineJoin = 'round';
  ctx.strokeStyle = lin(ctx, -9, 0, 9, 0, CHROME);
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(-8.8, -2.2);
  ctx.lineTo(-8.8, -17.6);
  ctx.quadraticCurveTo(-8.8, -18.4, -8, -18.4);
  ctx.lineTo(8, -18.4);
  ctx.quadraticCurveTo(8.8, -18.4, 8.8, -17.6);
  ctx.lineTo(8.8, -2.2);
  ctx.stroke();
  const swing = Math.sin(t * 3.6) * 0.55;
  const top = -18,
    len = 11.2,
    r = 1.65;
  for (let i = 0; i < 5; i++) {
    const x0 = (i - 2) * 3.3;
    const a = i === 0 && swing < 0 ? swing : i === 4 && swing > 0 ? swing : 0;
    const bx = x0 + Math.sin(a) * len,
      by = top + Math.cos(a) * len;
    for (const dx of [-1.2, 1.2])
      seg(ctx, x0 + dx, top, bx, by - r, 'rgba(220,225,230,0.85)', 0.15);
    ell(ctx, bx, by, r, r);
    fillStroke(
      ctx,
      rad(ctx, bx - r * 0.4, by - r * 0.45, 0.1, bx, by, r, [
        [0, '#ffffff'],
        [0.4, '#d5dbe1'],
        [1, '#5d6670'],
      ]),
      'rgba(30,30,30,0.5)',
      0.15,
    );
  }
}

/** Modello anatomico del cranio, color osso, con le suture. */
function cranio(ctx: Ctx) {
  ell(ctx, 0, -0.7, 4.6, 1.1);
  fillStroke(ctx, '#2b2b2b');
  const bone = lin(ctx, -6, -18, 6, -3, [
    [0, '#fbf5e6'],
    [0.6, '#e8dcc0'],
    [1, '#b9a985'],
  ]);
  // mandibola e zigomi
  ctx.beginPath();
  ctx.moveTo(-5.4, -10);
  ctx.quadraticCurveTo(-5.2, -6.4, -3.6, -4.6);
  ctx.quadraticCurveTo(-2.6, -1.6, 0, -1.4);
  ctx.quadraticCurveTo(2.6, -1.6, 3.6, -4.6);
  ctx.quadraticCurveTo(5.2, -6.4, 5.4, -10);
  ctx.closePath();
  fillStroke(ctx, bone);
  // calotta
  ell(ctx, 0, -12.6, 6.6, 6.4);
  fillStroke(ctx, bone);
  // orbite
  for (const s of [-1, 1]) {
    ell(ctx, s * 2.4, -10.2, 1.85, 2, s * 0.15);
    fillStroke(
      ctx,
      rad(ctx, s * 2.4, -10.6, 0.2, s * 2.4, -10.2, 2, [
        [0, '#120c06'],
        [1, '#4a3b26'],
      ]),
      null,
    );
  }
  // naso
  poly(ctx, [
    [0, -8.6],
    [0.9, -6.2],
    [0, -6.6],
    [-0.9, -6.2],
  ]);
  fillStroke(ctx, '#2a1e10', null);
  // denti
  rr(ctx, -2.6, -5.4, 5.2, 1.9, 0.4);
  fillStroke(ctx, '#f7f1e1', 'rgba(90,70,40,0.6)', 0.2);
  for (let x = -1.95; x < 2.6; x += 0.65) seg(ctx, x, -5.4, x, -3.5, 'rgba(90,70,40,0.6)', 0.15);
  seg(ctx, -2.6, -4.45, 2.6, -4.45, 'rgba(90,70,40,0.6)', 0.18);
  // suture del cranio
  ctx.strokeStyle = 'rgba(140,110,70,0.6)';
  ctx.lineWidth = 0.2;
  ctx.beginPath();
  for (let x = -5.2; x <= 5.2; x += 0.6)
    ctx.lineTo(x, -15.4 - Math.cos(x / 3.2) * 1.6 + (Math.round(x / 0.6) % 2) * 0.35);
  ctx.stroke();
  // tempie
  for (const s of [-1, 1]) {
    ell(ctx, s * 5.2, -11.2, 1, 2, 0);
    ctx.fillStyle = 'rgba(120,95,60,0.25)';
    ctx.fill();
  }
  ell(ctx, -2.4, -16, 2.2, 1.2, -0.3);
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.fill();
}

/** Giradischi a valigetta col coperchio aperto e il vinile che gira. */
function giradischi(ctx: Ctx, t: number) {
  // coperchio aperto dietro
  poly(ctx, [
    [-10, -6.2],
    [-9.2, -16],
    [9.2, -16],
    [10, -6.2],
  ]);
  fillStroke(
    ctx,
    lin(ctx, 0, -16, 0, -6, [
      [0, '#1f6f6b'],
      [1, '#2a9d8f'],
    ]),
  );
  poly(ctx, [
    [-8.8, -7],
    [-8.2, -15.1],
    [8.2, -15.1],
    [8.8, -7],
  ]);
  fillStroke(
    ctx,
    lin(ctx, 0, -15, 0, -7, [
      [0, '#f1e3c6'],
      [1, '#d9c39a'],
    ]),
    null,
  );
  // valigetta
  rr(ctx, -10.4, -6.6, 20.8, 6.6, 1);
  fillStroke(
    ctx,
    lin(ctx, 0, -6.6, 0, 0, [
      [0, '#2fb3a3'],
      [1, '#1d7d72'],
    ]),
  );
  ctx.fillStyle = '#f1e3c6';
  ctx.fillRect(-10.4, -3.2, 20.8, 0.5);
  // griglia dell'altoparlante e manopole
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  for (let x = -8.6; x < -4; x += 0.9)
    for (let y = -2.3; y < -0.6; y += 0.8) ctx.fillRect(x, y, 0.45, 0.45);
  for (const x of [5.4, 7.6]) {
    ell(ctx, x, -1.6, 0.75, 0.75);
    fillStroke(ctx, lin(ctx, x - 0.8, 0, x + 0.8, 0, CHROME), null);
  }
  // piatto e vinile
  ell(ctx, -1.6, -7.6, 7.6, 2);
  fillStroke(ctx, lin(ctx, -9, 0, 6, 0, CHROME), null);
  ell(ctx, -1.6, -7.9, 7, 1.75);
  fillStroke(ctx, '#121212', null);
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 0.15;
  for (const k of [0.45, 0.65, 0.85]) {
    ell(ctx, -1.6, -7.9, 7 * k, 1.75 * k);
    ctx.stroke();
  }
  const a = t * 3.3;
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.lineWidth = 0.35;
  ctx.beginPath();
  ctx.ellipse(-1.6, -7.9, 5.2, 1.3, 0, a, a + 0.9);
  ctx.stroke();
  ell(ctx, -1.6, -7.9, 1.9, 0.5);
  fillStroke(ctx, '#e74c3c', null);
  ell(ctx, -1.6, -7.9, 0.25, 0.1);
  fillStroke(ctx, '#ddd', null);
  // braccio
  ell(ctx, 7.6, -8.4, 0.9, 0.5);
  fillStroke(ctx, lin(ctx, 6.7, 0, 8.5, 0, CHROME), null);
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#d0d5da';
  ctx.lineWidth = 0.45;
  ctx.beginPath();
  ctx.moveTo(7.6, -8.6);
  ctx.quadraticCurveTo(6.4, -10, 2.6, -8.6);
  ctx.stroke();
  ctx.lineCap = 'butt';
  rr(ctx, 1.8, -9, 1.3, 0.6, 0.2);
  fillStroke(ctx, '#333', null);
}

/** Cactus con i bracci, le spine e un fiore rosa, in un vasetto di terracotta. */
function cactus(ctx: Ctx) {
  const green = lin(ctx, -2.4, 0, 2.4, 0, [
    [0, '#1e6b2f'],
    [0.45, '#52b55a'],
    [1, '#1a5a28'],
  ]);
  // fusto e bracci
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const arm = (pts: number[][], w: number) => {
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.strokeStyle = '#1a5a28';
    ctx.lineWidth = w + 0.5;
    ctx.stroke();
    ctx.strokeStyle = '#46a64f';
    ctx.lineWidth = w;
    ctx.stroke();
  };
  arm(
    [
      [-1.2, -11],
      [-4.2, -11],
      [-4.2, -14.6],
    ],
    1.9,
  );
  arm(
    [
      [1.2, -9.2],
      [3.9, -9.2],
      [3.9, -12.4],
    ],
    1.7,
  );
  rr(ctx, -2.3, -18.4, 4.6, 12, 2.3);
  fillStroke(ctx, green, '#174d22', 0.3);
  ctx.lineCap = 'butt';
  for (const x of [-1, 0, 1]) seg(ctx, x * 1.1, -17.5, x * 1.1, -7, 'rgba(10,50,20,0.35)', 0.2);
  // spine
  ctx.fillStyle = 'rgba(255,255,240,0.9)';
  for (const [x, y] of [
    [-1.7, -16],
    [1.6, -15],
    [-1.6, -12.4],
    [1.7, -11],
    [-1.5, -8.6],
    [0.2, -14],
    [-4.2, -13.2],
    [3.9, -11],
    [0.1, -9.8],
  ]) {
    ctx.fillRect(x - 0.12, y - 0.12, 0.24, 0.24);
  }
  // fiore
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
    ell(ctx, Math.cos(a) * 0.8, -18.6 + Math.sin(a) * 0.55, 0.75, 0.5, a);
    fillStroke(ctx, '#ff6fae', null);
  }
  ell(ctx, 0, -18.6, 0.4, 0.35);
  fillStroke(ctx, '#ffd23f', null);
  // vaso
  poly(ctx, [
    [-4.4, -6.4],
    [4.4, -6.4],
    [3.4, 0],
    [-3.4, 0],
  ]);
  fillStroke(
    ctx,
    lin(ctx, -4.4, 0, 4.4, 0, [
      [0, '#8e4a26'],
      [0.4, '#d7834f'],
      [1, '#7a3d1d'],
    ]),
  );
  rr(ctx, -5, -7.6, 10, 1.8, 0.4);
  fillStroke(
    ctx,
    lin(ctx, -5, 0, 5, 0, [
      [0, '#9a5129'],
      [0.4, '#e3955f'],
      [1, '#86421f'],
    ]),
  );
  ell(ctx, 0, -7.6, 4.4, 0.6);
  fillStroke(ctx, '#3b2a1e', null);
}

/** Ametista grezza: punte viola sfaccettate che spuntano da una roccia. */
function ametista(ctx: Ctx, t: number) {
  // roccia
  poly(ctx, [
    [-8, 0],
    [8.2, 0],
    [7.4, -2.8],
    [4.6, -4.6],
    [0.4, -5.2],
    [-4.4, -4.6],
    [-7.4, -3],
  ]);
  fillStroke(
    ctx,
    lin(ctx, 0, -5, 0, 0, [
      [0, '#8d8174'],
      [1, '#4f463d'],
    ]),
  );
  // punte: [x alla base, altezza, larghezza, inclinazione]
  const crystals: [number, number, number, number][] = [
    [-4.6, 9, 2.4, -0.35],
    [4.4, 10, 2.6, 0.3],
    [-1.8, 13.5, 3, -0.12],
    [1.9, 15.5, 3.3, 0.1],
    [0, 8, 2.4, 0],
  ];
  for (const [x, h, w, a] of crystals) {
    ctx.save();
    ctx.translate(x, -4.4);
    ctx.rotate(a);
    const half = w / 2,
      tip = -h,
      shoulder = -h + w * 0.9;
    // metà chiara e metà scura: le facce del prisma
    poly(ctx, [
      [-half, 0],
      [0, 0],
      [0, tip],
      [-half, shoulder],
    ]);
    fillStroke(
      ctx,
      lin(ctx, -half, 0, 0, tip, [
        [0, '#7d3c98'],
        [1, '#d7a8f0'],
      ]),
      null,
    );
    poly(ctx, [
      [0, 0],
      [half, 0],
      [half, shoulder],
      [0, tip],
    ]);
    fillStroke(
      ctx,
      lin(ctx, 0, 0, half, tip, [
        [0, '#3f1858'],
        [1, '#8e44ad'],
      ]),
      null,
    );
    poly(ctx, [
      [-half, 0],
      [half, 0],
      [half, shoulder],
      [0, tip],
      [-half, shoulder],
    ]);
    ctx.strokeStyle = 'rgba(40,10,60,0.6)';
    ctx.lineWidth = 0.22;
    ctx.stroke();
    shine(ctx, -half * 0.55, -1.2, -half * 0.55, shoulder + 0.6, 0.45, 0.3);
    ctx.restore();
  }
  sparkle(ctx, 1.4, -17.2, 1.2, 0.3 + 0.6 * Math.max(0, Math.sin(t * 2.2)));
  sparkle(ctx, -3, -11, 0.8, 0.3 + 0.6 * Math.max(0, Math.sin(t * 2.2 + 2)));
}

/** Amuleto egizio: l'Occhio di Horus d'oro su una placca di lapislazzuli, su un piccolo supporto. */
function horus(ctx: Ctx, t: number) {
  // supporto
  rr(ctx, -4, -1.4, 8, 1.4, 0.4);
  fillStroke(ctx, lin(ctx, -4, 0, 4, 0, DARK_WOOD));
  rr(ctx, -0.45, -6, 0.9, 4.8, 0.3);
  fillStroke(ctx, lin(ctx, -0.5, 0, 0.5, 0, BRASS), null);
  // anello e placca
  ell(ctx, 0, -18.2, 0.9, 0.9);
  ctx.strokeStyle = '#d4af37';
  ctx.lineWidth = 0.45;
  ctx.stroke();
  ell(ctx, 0, -11.4, 7.6, 6.3);
  fillStroke(ctx, lin(ctx, -7.6, -17, 7.6, -5, BRASS));
  ell(ctx, 0, -11.4, 6.4, 5.2);
  fillStroke(
    ctx,
    rad(ctx, -1.5, -13, 0.5, 0, -11.4, 6.4, [
      [0, '#3557c4'],
      [1, '#14246b'],
    ]),
    null,
  );
  // pagliuzze dorate del lapislazzuli
  ctx.fillStyle = 'rgba(240,200,90,0.7)';
  for (const [x, y] of [
    [-4.5, -12],
    [3.9, -14],
    [-2.6, -7.8],
    [4.6, -9.4],
    [-0.8, -15.2],
  ])
    ctx.fillRect(x, y, 0.25, 0.25);
  // l'occhio
  const gold = '#f1cb52';
  ctx.strokeStyle = gold;
  ctx.fillStyle = gold;
  ctx.lineCap = 'round';
  ctx.lineWidth = 0.75;
  ctx.beginPath();
  ctx.moveTo(-4.2, -14.1);
  ctx.quadraticCurveTo(0, -16.1, 4.4, -14.3); // sopracciglio
  ctx.stroke();
  ctx.lineWidth = 0.55;
  ctx.beginPath();
  ctx.moveTo(-3.8, -11.8);
  ctx.quadraticCurveTo(0, -14.4, 3.3, -11.9); // palpebra sopra
  ctx.quadraticCurveTo(0, -10, -3.8, -11.8); // palpebra sotto
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(3.3, -11.9);
  ctx.lineTo(5.2, -11.9); // coda dell'occhio
  ctx.stroke();
  ell(ctx, -0.1, -12, 0.95, 0.95);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-0.7, -10.9);
  ctx.lineTo(-1.1, -7.6); // la lacrima
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0.6, -10.9);
  ctx.quadraticCurveTo(1.4, -8.2, 3, -8.2); // la spirale
  ctx.arc(3, -8.9, 0.7, Math.PI / 2, -Math.PI, true);
  ctx.stroke();
  ctx.lineCap = 'butt';
  sparkle(ctx, 5.2, -15.8, 0.8, 0.3 + 0.6 * Math.max(0, Math.sin(t * 1.8)));
}

/** Sveglia rossa a due campane, con le lancette all'ora vera. */
function sveglia(ctx: Ctx) {
  const cy = -9.4,
    r = 6;
  // zampette
  for (const s of [-1, 1]) {
    ctx.lineCap = 'round';
    seg(ctx, s * 3.4, cy + 4.6, s * 4.4, -0.4, '#8b1e1e', 0.9);
    ctx.lineCap = 'butt';
  }
  // campane e martelletto
  for (const s of [-1, 1]) {
    ctx.save();
    ctx.translate(s * 4.2, cy - 5.6);
    ctx.rotate(s * 0.5);
    ctx.beginPath();
    ctx.arc(0, 0.6, 2.4, Math.PI, 0);
    ctx.closePath();
    fillStroke(ctx, lin(ctx, -2.4, 0, 2.4, 0, BRASS));
    ell(ctx, 0, -2, 0.45, 0.45);
    fillStroke(ctx, '#c9a227', null);
    ctx.restore();
  }
  seg(ctx, 0, cy - r, 0, cy - r - 2.4, '#b0b6bc', 0.4);
  ell(ctx, 0, cy - r - 2.6, 0.6, 0.6);
  fillStroke(ctx, '#d0d5da', null);
  // cassa
  ell(ctx, 0, cy, r, r);
  fillStroke(
    ctx,
    rad(ctx, -2, cy - 2.2, 0.5, 0, cy, r, [
      [0, '#ff6b6b'],
      [0.7, '#d63031'],
      [1, '#8b1e1e'],
    ]),
  );
  ell(ctx, 0, cy, r - 1, r - 1);
  fillStroke(ctx, lin(ctx, -5, 0, 5, 0, CHROME), null);
  ell(ctx, 0, cy, r - 1.5, r - 1.5);
  fillStroke(
    ctx,
    rad(ctx, -1, cy - 1.2, 0.2, 0, cy, r, [
      [0, '#ffffff'],
      [1, '#ece6d8'],
    ]),
    null,
  );
  clockTicks(ctx, 0, cy, r - 1.5, '#333');
  clockHands(ctx, 0, cy, r - 1.5, true);
  ell(ctx, -2, cy - 2.4, 1.5, 0.8, -0.6);
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.fill();
}

/** Veliero in miniatura su un supporto di legno, con la bandierina che sventola. */
function barca(ctx: Ctx, t: number) {
  // supporto
  rr(ctx, -7.5, -1.4, 15, 1.4, 0.4);
  fillStroke(ctx, lin(ctx, -7.5, 0, 7.5, 0, DARK_WOOD));
  for (const x of [-4, 4]) {
    poly(ctx, [
      [x - 0.7, -1.4],
      [x + 0.7, -1.4],
      [x + 0.9, -3.6],
      [x - 0.9, -3.6],
    ]);
    fillStroke(ctx, '#5a2e15', null);
  }
  // scafo
  ctx.beginPath();
  ctx.moveTo(-9.4, -6.6);
  ctx.lineTo(9.6, -7.4);
  ctx.quadraticCurveTo(8.4, -3.2, 5.4, -2.8);
  ctx.lineTo(-6, -2.8);
  ctx.quadraticCurveTo(-8.6, -3.4, -9.4, -6.6);
  ctx.closePath();
  fillStroke(
    ctx,
    lin(ctx, 0, -7, 0, -2.8, [
      [0, '#a0612f'],
      [1, '#5a2e15'],
    ]),
  );
  seg(ctx, -8.9, -5.6, 9.1, -6.3, '#f5f0e6', 0.45);
  seg(ctx, -7.6, -3.7, 7.4, -3.9, '#b33939', 0.5);
  // albero
  seg(ctx, 0.2, -6.9, 0.2, -20.2, '#4a2510', 0.55);
  // vele
  poly(ctx, [
    [0.6, -19.4],
    [0.6, -7.6],
    [7.6, -8],
  ]);
  fillStroke(
    ctx,
    lin(ctx, 0.6, -19, 7.6, -8, [
      [0, '#ffffff'],
      [1, '#e5ddc8'],
    ]),
    'rgba(90,70,40,0.5)',
    0.2,
  );
  poly(ctx, [
    [-0.2, -18.4],
    [-7.8, -7.4],
    [-0.2, -7.6],
  ]);
  fillStroke(
    ctx,
    lin(ctx, -7.8, -7, -0.2, -18, [
      [0, '#e5ddc8'],
      [1, '#ffffff'],
    ]),
    'rgba(90,70,40,0.5)',
    0.2,
  );
  seg(ctx, 0.2, -20, 9.4, -7.4, 'rgba(60,40,20,0.45)', 0.12);
  // bandierina
  ctx.beginPath();
  ctx.moveTo(0.4, -20.2);
  for (let i = 0; i <= 6; i++) ctx.lineTo(0.4 + i * 0.5, -20.2 + Math.sin(t * 5 + i) * 0.25);
  for (let i = 6; i >= 0; i--) ctx.lineTo(0.4 + i * 0.5, -19 + Math.sin(t * 5 + i) * 0.25);
  ctx.closePath();
  fillStroke(ctx, '#c0392b', null);
}

/** Telescopio d'ottone puntato verso l'alto, sul treppiede di legno. */
function telescopio(ctx: Ctx) {
  // treppiede
  ctx.lineCap = 'round';
  for (const [x, w] of [
    [-6.4, 0.9],
    [6, 0.9],
    [0.9, 0.7],
  ])
    seg(ctx, 0, -8.6, x, 0, x === 0.9 ? '#3b1f0e' : '#6b3a1a', w);
  ctx.lineCap = 'butt';
  seg(ctx, -3.2, -4.2, 3, -4.2, '#c9a227', 0.35);
  ell(ctx, 0, -9, 1.2, 1.2);
  fillStroke(ctx, lin(ctx, -1.2, 0, 1.2, 0, BRASS), null);
  // tubo
  ctx.save();
  ctx.translate(0, -10.2);
  ctx.rotate(-0.5);
  rr(ctx, -10.2, -0.6, 2.8, 1.2, 0.3); // oculare
  fillStroke(ctx, lin(ctx, 0, -0.6, 0, 0.6, BRASS));
  rr(ctx, -7.6, -1.35, 14, 2.7, 0.5);
  fillStroke(ctx, lin(ctx, 0, -1.35, 0, 1.35, BRASS));
  rr(ctx, 6, -1.8, 3.4, 3.6, 0.5); // paraluce
  fillStroke(ctx, lin(ctx, 0, -1.8, 0, 1.8, BRASS));
  for (const x of [-7.6, -1.6, 6]) {
    ctx.fillStyle = 'rgba(80,55,10,0.55)';
    ctx.fillRect(x, -1.35, 0.5, 2.7);
  }
  ell(ctx, 9.4, 0, 0.6, 1.6);
  fillStroke(
    ctx,
    rad(ctx, 9.4, -0.6, 0.1, 9.4, 0, 1.6, [
      [0, '#d6f0ff'],
      [1, '#2c6f9e'],
    ]),
    null,
  );
  shine(ctx, -6.8, -0.75, 5.4, -0.75, 0.6, 0.35);
  ctx.restore();
}

/** Scacchiera di legno intarsiato in prospettiva, con qualche pezzo in gioco. */
function scacchi(ctx: Ctx) {
  // bordo frontale
  poly(ctx, [
    [-10.4, -2.4],
    [10.4, -2.4],
    [10.4, -0.4],
    [-10.4, -0.4],
  ]);
  fillStroke(ctx, lin(ctx, -10, 0, 10, 0, DARK_WOOD));
  // piano in prospettiva: davanti largo 20.8, dietro 15
  const at = (u: number, v: number): [number, number] => {
    const halfW = 10.4 - v * 2.9;
    return [-halfW + u * halfW * 2, -2.4 - v * 7.2];
  };
  poly(ctx, [at(0, 0), at(1, 0), at(1, 1), at(0, 1)]);
  fillStroke(ctx, '#3e1f0c');
  const n = 8,
    m = 0.05;
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const u0 = m + ((1 - 2 * m) * i) / n,
        u1 = m + ((1 - 2 * m) * (i + 1)) / n;
      const v0 = m + ((1 - 2 * m) * j) / n,
        v1 = m + ((1 - 2 * m) * (j + 1)) / n;
      poly(ctx, [at(u0, v0), at(u1, v0), at(u1, v1), at(u0, v1)]);
      ctx.fillStyle = (i + j) % 2 ? '#6b3e1e' : '#e8c99b';
      ctx.fill();
    }
  // pezzi
  const piece = (u: number, v: number, white: boolean, kind: 'king' | 'queen' | 'pawn') => {
    const [x, y] = at(u, v);
    const s = 1 - v * 0.25;
    const body = white
      ? lin(ctx, x - 1.5, 0, x + 1.5, 0, [
          [0, '#d9cdb5'],
          [0.4, '#fffaf0'],
          [1, '#bfb29a'],
        ])
      : lin(ctx, x - 1.5, 0, x + 1.5, 0, [
          [0, '#0d0d0d'],
          [0.4, '#4a4a4a'],
          [1, '#111'],
        ]);
    const h = (kind === 'pawn' ? 4 : kind === 'queen' ? 6.6 : 7.4) * s;
    ell(ctx, x, y, 1.4 * s, 0.5 * s);
    fillStroke(ctx, body, 'rgba(0,0,0,0.5)', 0.18);
    poly(ctx, [
      [x - 1.2 * s, y],
      [x + 1.2 * s, y],
      [x + 0.55 * s, y - h * 0.7],
      [x - 0.55 * s, y - h * 0.7],
    ]);
    fillStroke(ctx, body, 'rgba(0,0,0,0.5)', 0.18);
    if (kind === 'pawn') {
      ell(ctx, x, y - h * 0.82, 0.9 * s, 0.9 * s);
      fillStroke(ctx, body, 'rgba(0,0,0,0.5)', 0.18);
    } else {
      ell(ctx, x, y - h * 0.74, 1.1 * s, 0.35 * s);
      fillStroke(ctx, body, 'rgba(0,0,0,0.5)', 0.18);
      poly(ctx, [
        [x - 0.9 * s, y - h * 0.74],
        [x + 0.9 * s, y - h * 0.74],
        [x + 1.1 * s, y - h * 0.9],
        [x - 1.1 * s, y - h * 0.9],
      ]);
      fillStroke(ctx, body, 'rgba(0,0,0,0.5)', 0.18);
      if (kind === 'king') {
        seg(ctx, x, y - h * 0.9, x, y - h * 1.08, white ? '#cdbf9f' : '#222', 0.35 * s);
        seg(ctx, x - 0.45 * s, y - h, x + 0.45 * s, y - h, white ? '#cdbf9f' : '#222', 0.35 * s);
      } else {
        ell(ctx, x, y - h * 0.97, 0.4 * s, 0.4 * s);
        fillStroke(ctx, body, null);
      }
    }
  };
  piece(0.62, 0.78, false, 'queen');
  piece(0.3, 0.55, false, 'pawn');
  piece(0.75, 0.42, true, 'pawn');
  piece(0.38, 0.22, true, 'king');
}

const ART: Record<string, (ctx: Ctx, t: number) => void> = {
  col_tomo: tomo,
  col_globo: globo,
  col_clessidra: clessidra,
  col_sfera: sfera,
  col_pendolo: pendolo,
  col_torso: torso,
  col_busto: busto,
  col_lava: lava,
  col_fumetti: fumetti,
  col_manuale: manuale,
  col_newton: newton,
  col_cranio: cranio,
  col_giradischi: giradischi,
  col_cactus: cactus,
  col_ametista: ametista,
  col_horus: horus,
  col_sveglia: sveglia,
  col_barca: barca,
  col_telescopio: telescopio,
  col_scacchi: scacchi,
};

/** Disegna il pezzo `id` appoggiato in (cx, by), alto circa `size`. Restituisce false se non c'è. */
export function drawCollectibleArt(
  ctx: Ctx,
  id: string,
  cx: number,
  by: number,
  size: number,
  t: number,
): boolean {
  const draw = ART[id];
  if (!draw) return false;
  ctx.save();
  ctx.translate(cx, by);
  ctx.scale(size / 20, size / 20);
  try {
    draw(ctx, t);
  } finally {
    ctx.restore();
  }
  return true;
}
