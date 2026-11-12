// Screenshot del gioco in modalità prova (niente dati verso il server): entra con un personaggio
// nuovo, lo porta dove serve e fotografa. Serve per controllare a occhio grafica e scene.
//
//   node scripts/shot.mjs <cartella> '<scatti>' ['<opzioni>']
//
// scatti (JSON): [{ "name": "lab", "env": "ingegneria", "x": 0, "y": 200,
//                  "setup": "game.player.pets = { dog: {} }",   codice con `game` a disposizione
//                  "clip": [x, y, larghezza, altezza],          ritaglio in pixel della pagina
//                  "wait": 1200 }]                              attesa prima dello scatto (ms)
// opzioni (JSON): { "hour": 21, "phone": true, "scale": 2 }      ora del giorno, telefono, zoom
//                 "portrait": true                               telefono in verticale
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const [out, shotsArg, optsArg] = process.argv.slice(2);
if (!out || !shotsArg) {
  console.error("Uso: node scripts/shot.mjs <cartella> '<scatti JSON>' ['<opzioni JSON>']");
  process.exit(1);
}
const shots = JSON.parse(shotsArg);
const opts = optsArg ? JSON.parse(optsArg) : {};

const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch(
  process.platform === 'win32' ? { channel: 'msedge', args: ['--disable-gpu'] } : {},
);
const page = await browser.newPage({
  viewport: opts.phone
    ? opts.portrait
      ? { width: 390, height: 844 }
      : { width: 844, height: 390 }
    : { width: 1280, height: 800 },
  deviceScaleFactor: opts.scale || 1,
  hasTouch: !!opts.phone,
  isMobile: !!opts.phone,
});
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.setDefaultTimeout(15000);
try {
  if (opts.hour !== undefined) {
    const d = new Date();
    d.setHours(opts.hour, 0, 0, 0);
    await page.clock.setFixedTime(d);
  }
  await page.goto(server.resolvedUrls.local[0] + '?offline=1');
  await page.locator('#nickname').fill('Prova');
  await page.locator('#start-game-btn').click();
  // giocatore nuovo: si entra nel condominio di sempre
  await page.locator('#creator-modal').locator('#creator-ok').click();
  await page.locator('#world-modal [data-w="public"]').click();
  // niente arrivo del giocatore nuovo (riquadro e valigia) nelle foto
  await page.evaluate(async () => (await import('/src/game/arrival.ts')).finishArrival());
  for (const s of shots) {
    await page.evaluate(async (s) => {
      const { game } = await import('/src/game/context.ts');
      const { applyRoomBounds } = await import('/src/game/room-size.ts');
      if (s.env) {
        game.view.activeEnvironment = s.env;
        game.view.currentRoomTitle = s.title ?? '';
        applyRoomBounds(s.env);
      }
      if (s.x !== undefined) game.playerPos = { x: s.x, y: s.y };
      game.cam = null; // la telecamera riparte centrata sul giocatore
      if (s.setup) await new Function('game', `return (async () => { ${s.setup} })()`)(game);
    }, s);
    await page.waitForTimeout(s.wait ?? 1200);
    const [x, y, width, height] = s.clip || [];
    const file = `${out}/${s.name}.png`;
    await page.screenshot({ path: file, ...(s.clip ? { clip: { x, y, width, height } } : {}) });
    console.log('📸', file);
  }
  if (errors.length) console.log('ERRORI', errors);
} finally {
  await browser.close();
  await server.close();
}
