// Icone dell'app installabile: una casetta isometrica sotto il cielo di notte, nei colori del
// gioco. Il disegno sta dentro il cerchio centrale (80% del lato), così Android può ritagliarla
// a cerchio o a goccia ("maskable") senza tagliare il tetto.
//
//   node scripts/icons.mjs        scrive public/icons/*.png e public/icons/icon.svg
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const OUT = new URL('../public/icons/', import.meta.url);

const STARS = [
  [70, 80, 3],
  [140, 50, 2],
  [420, 70, 3],
  [460, 150, 2],
  [370, 40, 2],
  [60, 180, 2],
  [180, 120, 2],
  [330, 110, 2],
];

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="cielo" cx="50%" cy="35%" r="75%">
      <stop offset="0" stop-color="#30227a"/>
      <stop offset="1" stop-color="#0f0f18"/>
    </radialGradient>
    <radialGradient id="luce" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="#feca57" stop-opacity="0.35"/>
      <stop offset="1" stop-color="#feca57" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="512" height="512" fill="url(#cielo)"/>
  ${STARS.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#dfe6e9" opacity="0.8"/>`).join('')}
  <ellipse cx="316" cy="330" rx="120" ry="80" fill="url(#luce)"/>
  <polygon points="256,432 422,349 256,266 90,349" fill="#1e9e55"/>
  <polygon points="256,432 422,349 422,361 256,444" fill="#157a41"/>
  <polygon points="256,432 90,349 90,361 256,444" fill="#19894a"/>
  <polygon points="136,340 256,400 256,290 136,230" fill="#f5e6c8"/>
  <polygon points="256,400 376,340 376,230 256,290" fill="#d4b98c"/>
  <polygon points="210,377 184,364 184,299 210,312" fill="#8e5a3c"/>
  <circle cx="204" cy="342" r="3" fill="#feca57"/>
  <polygon points="280,358 306,345 306,300 280,313" fill="#feca57"/>
  <polygon points="326,335 352,322 352,277 326,290" fill="#feca57"/>
  <line x1="293" y1="352" x2="293" y2="307" stroke="#d4b98c" stroke-width="3"/>
  <line x1="339" y1="329" x2="339" y2="284" stroke="#d4b98c" stroke-width="3"/>
  <polygon points="122,233 256,300 256,128" fill="#ff4757"/>
  <polygon points="256,300 390,233 256,128" fill="#c0392b"/>
  <path d="M256 112 C230 92 222 70 240 64 C250 61 256 70 256 76 C256 70 262 61 272 64 C290 70 282 92 256 112 Z" fill="#ff6b81"/>
</svg>`;

// Nome del file e lato in pixel. apple-touch-icon è quella che usa l'iPhone per la Home.
const SIZES = [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['apple-touch-icon.png', 180],
];

await mkdir(OUT, { recursive: true });
await writeFile(new URL('icon.svg', OUT), SVG + '\n');

const browser = await chromium.launch(process.platform === 'win32' ? { channel: 'msedge' } : {});
try {
  for (const [name, size] of SIZES) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(
      `<body style="margin:0">${SVG.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body>`,
    );
    await page.screenshot({ path: fileURLToPath(new URL(name, OUT)) });
    await page.close();
  }
} finally {
  await browser.close();
}
console.log('Icone scritte in public/icons/');
