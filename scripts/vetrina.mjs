// Le immagini della prima schermata (la "vetrina"): il cortile disegnato dal motore del gioco, in
// verticale, senza interfaccia né nomi, di giorno, al tramonto e di notte. Il gioco sceglie quella
// dell'ora di Roma (src/game/showcase.ts). Si rifanno quando cambia il cortile:
//   node scripts/vetrina.mjs     → public/vetrina/giorno.jpg, tramonto.jpg, notte.jpg
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { createServer } from 'vite';

const OUT = 'public/vetrina';
const SHOTS = [
  { name: 'giorno', hour: 11 },
  { name: 'tramonto', hour: 19 },
  { name: 'notte', hour: 22 },
];
// il personaggio sta vicino alla fontana: in alto i palazzi con i tetti, lontano dalle porte
const SPOT = { x: -80, y: -110 };

mkdirSync(OUT, { recursive: true });
const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch(
  process.platform === 'win32' ? { channel: 'msedge', args: ['--disable-gpu'] } : {},
);
try {
  for (const shot of SHOTS) {
    const page = await browser.newPage({
      viewport: { width: 700, height: 1400 },
      deviceScaleFactor: 1.5,
    });
    page.setDefaultTimeout(20000);
    const d = new Date();
    d.setHours(shot.hour, 0, 0, 0);
    await page.clock.setFixedTime(d);
    await page.goto(server.resolvedUrls.local[0] + '?offline=1');
    // il pulsante di sviluppo "Sim di prova" copre gli altri: si clicca comunque
    await page.locator('#nickname').fill('Vetrina');
    await page.locator('#start-game-btn').click({ force: true });
    await page.locator('#creator-modal').locator('#creator-ok').click({ force: true });
    await page.locator('#world-modal [data-w="public"]').click({ force: true });
    // niente arrivo del giocatore nuovo (riquadro e valigia) nelle foto
    await page.evaluate(async () => (await import('/src/game/arrival.ts')).finishArrival());
    await page.evaluate(async (spot) => {
      const { game } = await import('/src/game/context.ts');
      const { applyRoomBounds } = await import('/src/game/room-size.ts');
      game.view.activeEnvironment = 'CORTILE';
      game.view.currentRoomTitle = '';
      applyRoomBounds('CORTILE');
      game.playerPos = { ...spot };
      game.cam = null;
      // senza nome il cartellino sopra il personaggio non si disegna
      game.player.myData.nick = '';
      // il motore nasconde le etichette degli oggetti a chi dorme; in cortile non cambia altro
      game.player.isSleeping = true;
      // solo il disegno: tutta l'interfaccia sopra si nasconde
      const st = document.createElement('style');
      st.textContent =
        'body *:not(canvas) { visibility: hidden !important } canvas, body *:has(canvas) { visibility: visible !important }';
      document.head.append(st);
    }, SPOT);
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${OUT}/${shot.name}.jpg`, type: 'jpeg', quality: 80 });
    console.log('📸', `${OUT}/${shot.name}.jpg`);
    await page.close();
  }
} finally {
  await browser.close();
  await server.close();
}
