// Video verticali (1080×1920, 30 fotogrammi al secondo) girati con il motore del gioco, per i
// social: node scripts/video.mjs <cartella> <video> [<video>…]   (video: vedi scripts/videos.mjs)
//
// Come shot.mjs il gioco si apre in modalità prova (?offline=1, niente dati verso il server). Per
// avere un video fluido anche su un PC lento l'orologio del gioco è finto: si ferma, avanza di
// 1/30 di secondo, si scatta una foto, e così via. Alla fine Edge stesso monta le foto in un MP4
// (MediaRecorder, H.264): niente programmi da installare.
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { mkdirSync, readFileSync, rmSync, writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { VIDEOS } from './videos.mjs';

const FPS = 30;
const W = 540;
const H = 960;
const SCALE = 2;

const [out, ...names] = process.argv.slice(2);
if (!out || !names.length) {
  console.error('Uso: node scripts/video.mjs <cartella> <video> [<video>…]');
  console.error('Video: ' + Object.keys(VIDEOS).join(', '));
  process.exit(1);
}
mkdirSync(out, { recursive: true });

const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch(
  process.platform === 'win32' ? { channel: 'msedge', args: ['--disable-gpu'] } : {},
);

/**
 * Monta le foto in un MP4, con Edge (un'altra scheda, con l'orologio vero). `frames`: per ogni
 * fotogramma i pezzi che lo compongono, { file, y, h } (uno a tutto schermo, o le strisce dello
 * schermo diviso).
 */
async function encode(frames, file) {
  const count = frames.length;
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.route('http://video.local/**', (route) => {
    const [i, name] = route.request().url().split('/').slice(-2);
    if (name === 'index.html')
      return route.fulfill({ contentType: 'text/html', body: '<!doctype html><body></body>' });
    return route.fulfill({
      contentType: 'image/jpeg',
      body: readFileSync(frames[Number(i)][parseInt(name)].file),
    });
  });
  writeFileSync(file, '');
  await page.exposeFunction('saveChunk', (b64) => appendFileSync(file, Buffer.from(b64, 'base64')));
  await page.goto('http://video.local/x/index.html');
  await page.evaluate(
    async ({ count, fps, w, h, geometry }) => {
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const c2d = canvas.getContext('2d');
      const stream = canvas.captureStream(0);
      const track = stream.getVideoTracks()[0];
      const rec = new MediaRecorder(stream, {
        mimeType: 'video/mp4;codecs=avc1.640028',
        videoBitsPerSecond: 14_000_000,
      });
      const pending = [];
      rec.ondataavailable = (e) => {
        if (!e.data.size) return;
        pending.push(
          e.data.arrayBuffer().then((buf) => {
            let s = '';
            const bytes = new Uint8Array(buf);
            for (let i = 0; i < bytes.length; i += 0x8000)
              s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
            return s;
          }),
        );
      };
      const load = (i) =>
        Promise.all(
          geometry[i].map((_, l) =>
            fetch(`http://video.local/${i}/${l}.jpg`)
              .then((r) => r.blob())
              .then((b) => createImageBitmap(b)),
          ),
        );
      // il primo fotogramma prima di partire, poi gli altri al loro tempo
      let next = load(0);
      rec.start();
      const start = performance.now();
      for (let i = 0; i < count; i++) {
        const bmps = await next;
        if (i + 1 < count) next = load(i + 1);
        const due = start + (i * 1000) / fps;
        while (performance.now() < due) await new Promise((r) => setTimeout(r, 2));
        bmps.forEach((b, l) => c2d.drawImage(b, 0, geometry[i][l][0], w, geometry[i][l][1]));
        track.requestFrame();
        bmps.forEach((b) => b.close());
      }
      await new Promise((r) => setTimeout(r, 1000 / fps + 50));
      const stopped = new Promise((r) => (rec.onstop = r));
      rec.stop();
      await stopped;
      // in ordine: i pezzi del file si scrivono uno dopo l'altro
      for (const p of pending) await window.saveChunk(btoa(await p));
    },
    {
      count,
      fps: FPS,
      w: W * SCALE,
      h: H * SCALE,
      geometry: frames.map((fr) => fr.map((l) => [l.y, l.h])),
    },
  );
  await ctx.close();
}

/** Apre il gioco con un personaggio nuovo e l'orologio fermo all'ora data. */
async function openGame(v, height = H) {
  // si entra a tutta altezza (i pulsanti dell'ingresso devono vedersi), poi la finestra si stringe
  const ctx = await browser.newContext({
    viewport: { width: W, height: H },
    deviceScaleFactor: SCALE,
    hasTouch: true,
    isMobile: true,
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const start = new Date();
  start.setHours(v.hour ?? 12, v.minute ?? 0, 0, 0);
  await page.clock.install({ time: start });
  await page.clock.resume();
  await page.goto(server.resolvedUrls.local[0] + '?offline=1');
  await page.locator('#nickname').fill(v.nick || 'Tommaso');
  await page.locator('#start-game-btn').click();
  await page.locator('#creator-modal').locator('#creator-ok').click();
  await page.locator('#world-modal [data-w="public"]').click();
  await page.waitForTimeout(1500);
  // gli aiuti della modalità prova e del sito non vanno nei video
  await page.addStyleTag({
    content:
      (v.toasts ? '' : '#toast-container, ') +
      '#app-version, #install-banner, #install-bar, #btn-fullscreen, #social-panel { display: none !important; }' +
      (v.prompts ? '' : '#pop-interaction, #btn-arrange { display: none !important; }') +
      (v.css || ''),
  });
  await page.evaluate(() =>
    [...document.querySelectorAll('button')]
      .filter((b) => b.textContent.includes('Sim di prova'))
      .forEach((b) => b.remove()),
  );
  // gli strumenti delle scene (scripts/video-kit.js) dentro la pagina
  await page.addScriptTag({
    type: 'module',
    content: readFileSync('scripts/video-kit.js', 'utf8'),
  });
  await page.waitForFunction(() => window.kit?.ready);
  if (height !== H) await page.setViewportSize({ width: W, height });
  return { page, ctx, errors };
}

/** Gira una ripresa (una scena, alta `height`) nella cartella `frames`: quanti fotogrammi. */
async function film(v, frames, height) {
  rmSync(frames, { recursive: true, force: true });
  mkdirSync(frames, { recursive: true });
  const { page, ctx, errors } = await openGame(v, height);
  let n = 0;
  const run = (code, arg) => page.evaluate(code, arg);
  /**
   * `secondi` di video: a ogni fotogramma `each` (codice nella pagina, con { f, t, total }).
   * `speed`: quante volte più veloce passa il tempo del gioco (3 = al triplo). `onFrame`: codice
   * qui fuori prima di ogni fotogramma (per esempio per spostare l'ora).
   */
  const shoot = async (seconds, each, { speed = 1, onFrame } = {}) => {
    const total = Math.round(seconds * FPS);
    for (let f = 0; f < total; f++) {
      if (onFrame) await onFrame(f, total);
      if (each) await page.evaluate(each, { f, t: f / FPS, total });
      await page.evaluate(() => window.kit.tick());
      await page.clock.runFor((1000 / FPS) * speed);
      await page.screenshot({ path: join(frames, `${n++}.jpg`), type: 'jpeg', quality: 90 });
    }
  };
  /** Lascia passare il tempo senza riprendere (per preparare la scena). */
  const wait = (ms) => page.clock.runFor(ms);
  /** Sposta l'ora del gioco (senza far scattare tutto quello che succede nel frattempo). */
  const setTime = async (ms) => page.clock.setSystemTime(ms);
  // l'orologio si ferma: da qui avanza solo a comando
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 200);
  await v.scene({ run, shoot, wait, setTime, page });
  await ctx.close();
  if (errors.length) console.log('  errori nella pagina:', errors.join(' | '));
  return n;
}

/**
 * Le foto di una parte del video: una ripresa a tutto schermo, oppure `split` (strisce una sopra
 * l'altra, tutte della stessa altezza). Restituisce i fotogrammi, coi pezzi che li compongono.
 */
async function shootPart(part, dir) {
  if (!part.split) {
    const n = await film(part, dir, H);
    return [...Array(n)].map((_, i) => [{ file: join(dir, `${i}.jpg`), y: 0, h: H * SCALE }]);
  }
  const k = part.split.length;
  const stripH = Math.round(H / k);
  const counts = [];
  for (const [i, strip] of part.split.entries())
    counts.push(await film(strip, `${dir}-${i}`, stripH));
  const n = Math.min(...counts);
  return [...Array(n)].map((_, f) =>
    part.split.map((__, i) => ({
      file: join(`${dir}-${i}`, `${f}.jpg`),
      y: Math.round((i * H * SCALE) / k),
      h: Math.round((H * SCALE) / k),
    })),
  );
}

for (const name of names) {
  const v = VIDEOS[name];
  if (!v) throw new Error('Video sconosciuto: ' + name);
  const file = join(out, `${name}.mp4`);
  const parts = v.parts || [v];
  const frames = [];
  const dirs = [];
  for (const [i, part] of parts.entries()) {
    const dir = join(out, `.${name}-foto-${i}`);
    dirs.push(dir, ...(part.split || []).map((_, k) => `${dir}-${k}`));
    frames.push(...(await shootPart(part, dir)));
  }
  console.log(
    `🎬 ${name}: ${frames.length} fotogrammi (${(frames.length / FPS).toFixed(1)} s), monto il video…`,
  );
  if (frames.length) await encode(frames, file);
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
  console.log('✅', file);
}
await browser.close();
await server.close();
