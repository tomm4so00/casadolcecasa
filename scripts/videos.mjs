// Le scene dei video per i social (scripts/video.mjs). Ogni video: ora del giorno, nome del
// personaggio e una scena che usa run (codice nella pagina, con window.kit), shoot (secondi di
// ripresa, con il codice di ogni fotogramma), wait (tempo che passa senza riprendere) e setTime
// (sposta l'ora del gioco). I vicini e le lapidi sono simulati nel database di prova.

const HOUR = 3600_000;
const DAY = 24 * HOUR;

/** Il percorso di un vicino che gira intorno alla fontana del cortile. */
const aroundFountain = (r, start = 0, n = 10) =>
  [...Array(n)].map((_, i) => {
    const a = start + (i / n) * Math.PI * 2;
    return [Math.round(Math.cos(a) * r), Math.round(Math.sin(a) * r * 0.9)];
  });

/**
 * Una striscia del video dei parametri: la barra scende (il personaggio soffre), poi l'azione la
 * riporta su. `how`: 'sleep' (a letto), 'friends' (arrivano i vicini) o 'walk:x,y:emoji'.
 */
const strip = (icon, label, fix, env, at, sad, how) => ({
  hour: 18,
  async scene({ run, shoot }) {
    await run(
      ([icon, label, fix, env, at, sad, how]) => {
        kit.finish();
        kit.noHud();
        kit.go(env, at[0], at[1], '');
        window.s = { icon, label, fix, sad, how };
      },
      [icon, label, fix, env, at, sad, how],
    );
    await shoot(8, ({ t, f }) => {
      const s = window.s;
      const down = t < 3.2;
      const v = down ? 100 - (t / 3.2) * 88 : Math.min(100, 12 + ((t - 3.4) / 3) * 88);
      kit.bars([{ icon: s.icon, label: down ? s.label : s.fix, value: v }], {
        top: 8,
        left: 8,
        width: 300,
        size: 18,
      });
      if (f === 20) kit.say(s.sad);
      if (f === 100) {
        kit.say('');
        if (s.how === 'sleep') {
          kit.game.bedSlot = 0;
          kit.game.player.isSleeping = true;
        }
        if (s.how === 'friends')
          kit.addCrowd([
            { id: 'f1', name: 'Giulia', x: 140, y: 85, path: [[45, 85]], once: true, speed: 2.2 },
            { id: 'f2', name: 'Marco', x: -140, y: 85, path: [[-45, 85]], once: true, speed: 2.2 },
          ]);
      }
      if (s.how.startsWith('walk:') && f >= 100) {
        const [, xy, emo] = s.how.split(':');
        const [x, y] = xy.split(',').map(Number);
        if (kit.walkTo(x, y) && f > 130 && !kit.game.mySay) kit.say(emo);
      }
      if (s.how === 'friends') {
        kit.crowdStep();
        if (f === 150) {
          kit.crowdSay('f1', '😂');
          kit.say('😄');
        }
      }
    });
  },
});

export const VIDEOS = {
  // ---------------------------------------------------------------- 1. lo sviluppatore
  // "Ho creato un gioco dove vivi in un condominio con persone vere"
  sviluppatore: {
    hour: 17,
    async scene({ run, shoot, setTime, page }) {
      // A. l'arrivo: valigia, riquadro "Benvenuto a casa", i vicini che passano
      await run(() => {
        kit.addCrowd([
          { id: 'n1', name: 'Giulia', x: -190, y: 40, path: [[-290, 60]], once: true, speed: 1.6 },
          {
            id: 'n2',
            name: 'Marco',
            x: -500,
            y: 150,
            path: [
              [-150, 150],
              [-500, 150],
            ],
            speed: 2.4,
          },
          {
            id: 'n3',
            name: 'Sara',
            x: -420,
            y: -10,
            path: [
              [-120, -10],
              [-420, -10],
            ],
            speed: 2,
          },
          {
            id: 'n4',
            name: 'Luca',
            x: -60,
            y: 100,
            path: [
              [-260, 180],
              [-60, 100],
            ],
            speed: 1.8,
          },
        ]);
      });
      await shoot(3.5, ({ f }) => {
        if (f === 30) kit.crowdSay('n1', 'Ciao! Benvenuto 👋');
        if (f === 75) kit.say('Ciao! 😊');
        kit.crowdStep();
      });
      // B. si parte: due passi nel cortile, verso la fontana
      await run(() => {
        kit.finish();
        kit.crowd.find((n) => n.id === 'n1').path = [
          [-120, 20],
          [-420, 20],
        ];
      });
      await shoot(4, () => {
        kit.walkTo(-110, 45);
        kit.crowdStep();
      });
      // C. la tua stanza, e un vicino che passa a trovarti
      await run(() => {
        kit.clearCrowd();
        kit.go('PLAYER_ROOM', 0, 140, 'La tua stanza');
        kit.own('lamp_std');
        kit.own('plant_pre');
        kit.addCrowd([
          {
            id: 'r1',
            name: 'Marco',
            x: 60,
            y: 160,
            env: 'PLAYER_ROOM',
            path: [[60, 60]],
            once: true,
            speed: 1.4,
          },
        ]);
      });
      await shoot(4, ({ f }) => {
        kit.walkTo(-20, 30);
        if (f === 60) kit.crowdSay('r1', 'Bella stanza! 😍');
        kit.crowdStep();
      });
      // D. il cortile dalle 17:30 alle 22: si accendono i lampioni, i vicini girano
      await run(
        (paths) => {
          kit.clearCrowd();
          kit.go('CORTILE', 0, 75, 'Cortile Condominiale');
          kit.addCrowd([
            { id: 'c1', name: 'Giulia', x: 100, y: 0, path: paths[0], speed: 1.8 },
            { id: 'c2', name: 'Sara', x: -100, y: 0, path: paths[1], speed: 1.8 },
            { id: 'c3', name: 'Luca', x: 0, y: -130, path: paths[2], speed: 2.2 },
            {
              id: 'c4',
              name: 'Chiara',
              x: -300,
              y: 150,
              path: [
                [300, 150],
                [-300, 150],
              ],
              speed: 2,
            },
            {
              id: 'c5',
              name: 'Matteo',
              x: 260,
              y: -30,
              path: [
                [-240, -30],
                [260, -30],
              ],
              speed: 2.4,
            },
          ]);
        },
        [aroundFountain(100, 0), aroundFountain(100, Math.PI), aroundFountain(140, -Math.PI / 2)],
      );
      const t0 = await page.evaluate(() => Date.now());
      const from = t0 + 30 * 60_000;
      await shoot(6, () => kit.crowdStep(), {
        onFrame: (f, total) => setTime(from + (4.5 * HOUR * f) / total),
      });
      // E. buonanotte
      await shoot(3, ({ f }) => {
        if (f === 2) kit.crowdSay('c1', 'Buonanotte! 🌙');
        if (f === 20) kit.crowdSay('c3', 'A domani! 👋');
        if (f === 40) kit.say('Che bello vivere qui 🏠');
        kit.crowdStep();
      });
    },
  },

  // ---------------------------------------------------------------- 2. POV: il primo giorno
  'primo-giorno': {
    hour: 9,
    async scene({ run, shoot, setTime, page }) {
      // A. l'arrivo con la valigia
      await shoot(2.5, () => {});
      // B. verso il portone del tuo palazzo
      await run(() => kit.finish());
      await shoot(3, ({ f }) => (f < 30 ? kit.walkTo(-420, 60) : kit.walkTo(-440, -165)));
      // C. il salone dell'appartamento, fino alla porta della tua stanza
      await run(() => kit.go('SALOON', 0, -180, 'Salone · Appartamento 1'));
      await shoot(3, () => kit.walkTo(-190, 0));
      // D. la stanza: la lampada che ti abbiamo regalato, da mettere dove vuoi
      await run(() => {
        kit.go('PLAYER_ROOM', 30, 120, 'La tua stanza');
        kit.own('lamp_std');
      });
      await shoot(1.2, () => kit.walkTo(10, 40));
      await run(() => {
        kit.stop();
        kit.game.activeTargetProp = 'lamp';
        kit.character.startMovingFurniture();
      });
      await shoot(3.2, ({ f }) => {
        if (f < 30) kit.keys(1, 0);
        else if (f < 55) kit.keys(0, 1);
        else kit.stop();
        if (f === 70) kit.character.rotateFurniture();
      });
      await run(() => kit.character.placeFurniture());
      await shoot(1, () => kit.say('Perfetta ✨'));
      // E. il primo lavoro: il cantiere
      await run(() => {
        kit.say('');
        kit.go('lavoro_cantiere', 0, 120, '🏗️ Cantiere');
        kit.game.activeShift = {
          jobKey: 'cantiere',
          title: 'Cantiere',
          pay: 40,
          perItem: 5,
          delivered: 0,
          remaining: 300,
        };
        kit.jobs.mgStart('cantiere');
      });
      await shoot(4.5, () => kit.bot());
      // F. la sera, a letto (l'ora si sposta una volta sola: poi si dorme e basta)
      await run(() => {
        kit.jobs.mgStop();
        kit.game.activeShift = null;
        kit.go('PLAYER_ROOM', -100, -20, 'La tua stanza');
      });
      const t0 = await page.evaluate(() => Date.now());
      await setTime(t0 + 13 * HOUR);
      const night = () => {
        const p = kit.game.player;
        kit.game.bedSlot = 0;
        p.isSleeping = true;
        p.sleepLevel = 35;
        p.healthLevel = 90;
        p.hungerLevel = 70;
        p.hygieneLevel = 85;
        p.happinessLevel = 95;
      };
      await run(night);
      await shoot(3, night);
    },
  },

  // ---------------------------------------------------------------- 3. dieci giorni
  // "Se non entri per 10 giorni il tuo personaggio muore"
  'dieci-giorni': {
    hour: 21,
    async scene({ run, shoot, setTime, page }) {
      await run(() => {
        kit.finish();
        kit.clean();
        kit.go('PLAYER_ROOM', -60, 40, 'La tua stanza');
        kit.own('lamp_std');
        kit.badge('GIORNO 1', { top: 170 });
      });
      const full = () => {
        const p = kit.game.player;
        p.healthLevel = p.sleepLevel = p.hungerLevel = p.hygieneLevel = p.happinessLevel = 100;
      };
      // A. tutto al massimo
      await shoot(2.5, full);
      // B. i giorni passano: i parametri scendono
      const t0 = await page.evaluate(() => Date.now());
      await shoot(
        6,
        ({ f, total }) => {
          const k = f / total;
          const p = kit.game.player;
          const day = 1 + Math.floor(k * 9.99);
          kit.badge(`GIORNO ${day}`, { top: 170, color: day >= 8 ? '#ff6b6b' : '#fff' });
          p.hungerLevel = Math.max(0, 100 - k * 115);
          p.sleepLevel = Math.max(2, 100 - k * 98);
          p.hygieneLevel = Math.max(0, 100 - k * 125);
          p.happinessLevel = Math.max(0, 100 - k * 110);
          p.healthLevel = Math.max(1, 100 - k * k * 99);
          if (f % 40 < 20) kit.walkTo(-20, 40);
          else kit.walkTo(-90, 40);
        },
        { onFrame: (f, total) => setTime(t0 + (9 * DAY * f) / total) },
      );
      // C. intanto Zero entra nel sistema, e qualcuno prova la tua cassaforte
      await run(() => {
        kit.stop();
        kit.badge('');
        document.body.classList.add('hacker-glitch');
        kit.addCrowd([
          {
            id: 'z1',
            name: 'Ladro',
            x: -140,
            y: 30,
            env: 'PLAYER_ROOM',
            crack: String(kit.game.myAssignedRoomIdx),
            crackT: Date.now(),
          },
        ]);
      });
      await shoot(3.5, ({ f }) => {
        if (f === 10) kit.crowdSay('z1', '🔓 …');
        kit.crowdStep();
      });
      // D. il cimitero del condominio
      await run(() => {
        document.body.classList.remove('hacker-glitch');
        kit.clearCrowd();
        kit.grave('me', {
          name: kit.game.player.myData.nick,
          epitaph: 'Non è entrato per 10 giorni',
          style: 0,
          visitors: 4,
        });
        ['Paolo', 'Elena', 'Davide', 'Anna', 'Franco'].forEach((name, i) =>
          kit.grave('g' + i, {
            name,
            epitaph: 'Riposa in pace',
            style: i % 3,
            visitors: i,
            deadAt: Date.now() - (i + 1) * 86400000,
          }),
        );
        kit.go('CIMITERO', -700, -500, 'Cimitero');
        kit.badge('GIORNO 10', { top: 170, color: '#ff6b6b' });
      });
      await shoot(5, ({ f }) => {
        // il personaggio resta in un angolo: in scena solo le lapidi
        if (f === 90) kit.badge('');
      });
    },
  },

  // ---------------------------------------------------------------- 4. il glow up
  // La stanza dal livello 1 (vuota) al livello 100 (tutto di lusso), un passo ogni 1,25 s
  'glow-up': {
    hour: 16,
    async scene({ run, shoot }) {
      await run(() => {
        kit.finish();
        kit.clean();
        kit.go('PLAYER_ROOM', -10, 55, 'La tua stanza');
        kit.emptyRoom(['doorExit']);
      });
      const levels = [
        ['LIVELLO 1', []],
        ['LIVELLO 2', ['=bed']],
        ['LIVELLO 5', ['=desk', '=wardrobe']],
        ['LIVELLO 10', ['=safe', '=trashBin', 'lamp_std', 'nightstand_std', 'plant_std']],
        ['LIVELLO 20', ['sofa_std', 'tv_std']],
        ['LIVELLO 30', ['bed_pre', 'wardrobe_pre', 'desk_pre']],
        ['LIVELLO 45', ['nightstand_pre', 'lamp_pre', 'plant_pre', 'sofa_pre', 'tv_pre']],
        ['LIVELLO 60', ['bed_lux', 'wardrobe_lux', 'desk_lux']],
        ['LIVELLO 75', ['nightstand_lux', 'lamp_lux', 'plant_lux', 'sofa_lux', 'tv_lux']],
        ['LIVELLO 90', ['safe_pre', 'cabinet_std', '+plants']],
        ['LIVELLO 100', ['+gold']],
      ];
      for (const [i, level] of levels.entries()) {
        const last = i === levels.length - 1;
        await run(
          ([label, items, last]) => {
            kit.badge(label, { top: 150, color: last ? '#feca57' : '#fff' });
            for (const it of items) {
              if (it.startsWith('=')) kit.restore(it.slice(1));
              else if (it === '+plants') {
                const plant = kit.catalog('plant_lux').propData;
                [
                  [-175, 150],
                  [175, -160],
                  [-60, -160],
                  [175, 150],
                ].forEach(([x, y], n) =>
                  kit.addFurniture('extraPlant' + n, 'plant', { ...plant, x, y }),
                );
              } else if (it === '+gold') {
                kit.addFurniture('ltd_statue', 'ltd_statue', {
                  x: 150,
                  y: 120,
                  w: 34,
                  h: 34,
                  z: 70,
                  name: "Statua d'oro",
                });
                kit.addFurniture('ltd_jukebox', 'ltd_jukebox', {
                  x: -150,
                  y: 110,
                  w: 40,
                  h: 30,
                  z: 62,
                  name: 'Jukebox',
                });
                const lamp = kit.catalog('lamp_lux').propData;
                kit.addFurniture('extraLamp', 'lamp', { ...lamp, x: -95, y: -150 });
              } else kit.own(it);
            }
          },
          [...level, last],
        );
        await run((last) => (window.lastLevel = last), last);
        await shoot(last ? 3.2 : 1.25, ({ f }) => {
          if (f === 25 && window.lastLevel) kit.say('Casa dolce casa 😎');
        });
      }
    },
  },

  // ---------------------------------------------------------------- 5. il buon gusto
  // Schermo diviso: sopra una stanza povera ma curata, sotto 200 mobili di lusso a caso
  'buon-gusto': {
    split: [
      {
        hour: 19,
        nick: 'Giulia',
        async scene({ run, shoot }) {
          await run(() => {
            kit.finish();
            kit.clean();
            kit.go('PLAYER_ROOM', -30, 90, 'La stanza di Giulia');
            kit.emptyRoom(['doorExit', 'safe', 'trashBin', 'bed', 'desk', 'wardrobe']);
            for (const id of ['lamp_std', 'nightstand_std', 'plant_pre', 'sofa_std']) kit.own(id);
            const plant = kit.catalog('plant_std').propData;
            kit.addFurniture('extraPlant0', 'plant', { ...plant, x: -175, y: 150 });
            kit.addFurniture('extraPlant1', 'plant', { ...plant, x: 60, y: -160 });
            kit.badge('💰 120 Đ', { top: 60, size: 26 });
          });
          await shoot(9, ({ f }) => {
            if (f % 120 < 60) kit.walkTo(40, 90);
            else kit.walkTo(-60, 90);
            if (f === 150) kit.say('Che pace 🌿');
          });
        },
      },
      {
        hour: 19,
        nick: 'Marco',
        async scene({ run, shoot }) {
          await run(() => {
            kit.finish();
            kit.clean();
            kit.go('PLAYER_ROOM', 0, 20, 'La stanza di Marco');
            kit.emptyRoom(['doorExit']);
            kit.badge('💰 99.999 Đ', { top: 60, size: 26, color: '#feca57' });
            window.chaos = [];
            const kinds = ['bed', 'wardrobe', 'desk', 'sofa', 'tv', 'lamp', 'plant', 'nightstand'];
            for (let i = 0; i < 200; i++) {
              const kind = kinds[i % kinds.length];
              const data = kit.catalog(kind + '_lux').propData;
              // a caso, ma sempre lo stesso caos a ogni ripresa
              const r = (n) => (((Math.sin(i * 12.9898 + n * 78.233) * 43758.5453) % 1) + 1) % 1;
              window.chaos.push([
                'chaos' + i,
                kind,
                {
                  ...data,
                  name: '',
                  x: -190 + r(1) * 380,
                  y: -170 + r(2) * 340,
                  rot: Math.floor(r(3) * 4),
                },
              ]);
            }
          });
          await shoot(9, ({ f }) => {
            // i mobili arrivano nei primi 3 secondi, poi il caos resta
            for (let n = 0; n < 3 && window.chaos.length; n++)
              kit.addFurniture(...window.chaos.shift());
            if (f === 120) kit.say('aiuto 😵');
          });
        },
      },
    ],
  },

  // ---------------------------------------------------------------- 6. il lavoratore perfetto
  // Il cantiere giocato da un bot: mai un errore, al triplo della velocità, i soldi che salgono
  lavoratore: {
    hour: 11,
    async scene({ run, shoot }) {
      await run(() => {
        kit.finish();
        kit.go('lavoro_cantiere', 0, 110, '🏗️ Cantiere');
        kit.game.isSprinting = true;
        kit.game.activeShift = {
          jobKey: 'cantiere',
          title: 'Cantiere',
          pay: 40,
          perItem: 5,
          delivered: 0,
          remaining: 300,
        };
        kit.jobs.mgStart('cantiere');
      });
      await shoot(1.6, () => {});
      await shoot(16, () => kit.bot(), { speed: 3 });
      await run(() => kit.stop());
      await shoot(1.6, ({ f }) => {
        if (f === 2) kit.say('Ancora un turno e mi compro il letto 😩');
      });
    },
  },

  // ---------------------------------------------------------------- 7. il flash mob
  // "Quando entri nel server alle 3 di notte": 10 vicini che si muovono tutti insieme
  'flash-mob': {
    hour: 3,
    async scene({ run, shoot }) {
      await run(() => {
        kit.finish();
        kit.clean();
        kit.go('CORTILE', 0, 85, 'Cortile Condominiale');
        const names = [
          'Giulia',
          'Marco',
          'Sara',
          'Luca',
          'Chiara',
          'Matteo',
          'Elena',
          'Davide',
          'Anna',
          'Paolo',
        ];
        kit.addCrowd(
          names.map((name, i) => ({
            id: 'm' + i,
            name,
            bx: -100 + (i % 5) * 50,
            by: i < 5 ? 130 : 165,
            x: -100 + (i % 5) * 50,
            y: i < 5 ? 130 : 165,
          })),
        );
      });
      await shoot(12, ({ t }) => {
        // la coreografia: tutti con lo stesso spostamento (ox, oy) e, in mezzo, un giro intero
        let ox = 0,
          oy = 0,
          turn = 0;
        if (t >= 1 && t < 2) ox = 70 * (t - 1);
        else if (t >= 2 && t < 3) ox = 70 - 140 * (t - 2);
        else if (t >= 3 && t < 4) ox = -70 + 70 * (t - 3);
        else if (t >= 4 && t < 5) oy = -45 * (t - 4);
        else if (t >= 5 && t < 6) oy = -45 + 45 * (t - 5);
        else if (t >= 6 && t < 8.5) turn = ((t - 6) / 2.5) * Math.PI * 2;
        const cx = 0,
          cy = 147;
        for (const n of kit.crowd) {
          const rx = n.bx - cx,
            ry = n.by - cy;
          n.x = cx + rx * Math.cos(turn) - ry * Math.sin(turn) + ox;
          n.y = cy + rx * Math.sin(turn) + ry * Math.cos(turn) + oy;
        }
        if (Math.abs(t - 8.7) < 0.02) for (const n of kit.crowd) kit.crowdSay(n.id, '👀');
        if (Math.abs(t - 10.3) < 0.02) kit.say('…ok 😳');
        kit.walkTo(ox, 85 + oy, 4);
        kit.crowdStep();
      });
    },
  },

  // ---------------------------------------------------------------- 8. il buttafuori
  // Il letto di lusso: ci provi e riprovi, ma i soldi non bastano mai
  buttafuori: {
    hour: 15,
    toasts: true,
    prompts: true,
    async scene({ run, shoot, wait }) {
      await run(() => {
        kit.finish();
        kit.go('negozio_mobili', -110, -95, 'Negozio di Mobili');
        // il letto pregiato c'è già: il prossimo della serie è quello di lusso, da 105 Đ
        kit.own('bed_pre');
      });
      // i messaggi dell'ingresso se ne vanno prima di riprendere
      await wait(11000);
      // via i messaggi rimasti (gli inviti, il benvenuto): nel video solo il rifiuto del negozio
      await run(() => (document.getElementById('toast-container').innerHTML = ''));
      // dal corridoio a destra delle scrivanie: su fino al letto di lusso, e giù di nuovo
      const go = [
        [-110, -203],
        [-170, -204],
      ];
      const back = [
        [-110, -203],
        [-110, -95],
      ];
      for (const speed of [1, 1.3, 1.7, 2.2]) {
        await run((go) => (window.route = go.slice()), go);
        await shoot(
          2 / speed,
          () => {
            kit.game.isSprinting = true;
            if (window.route.length && kit.walkTo(...window.route[0], 5)) window.route.shift();
          },
          { speed },
        );
        await run(() => {
          kit.stop();
          document.getElementById('btn-act-main')?.click();
        });
        await shoot(0.8 / speed, () => {}, { speed });
        await run((back) => (window.route = back.slice()), back);
        await shoot(
          1.6 / speed,
          () => {
            if (window.route.length && kit.walkTo(...window.route[0], 5)) window.route.shift();
          },
          { speed },
        );
      }
      await run(() => kit.stop());
      await shoot(2.5, ({ f }) => {
        if (f === 5) kit.say('😭');
      });
    },
  },

  // ================================================================ la serie «Come funziona»

  // ---------------------------------------------------------------- 9. tutto in 30 secondi
  // Il video manifesto: 20 cose da fare, una ogni 1,4 secondi, con icona e parola
  'tutto-in-30': {
    hour: 17,
    async scene({ run, shoot, wait }) {
      const act = async (icon, word, setup, each, { secs = 1.4, before = 0 } = {}) => {
        await run(() => kit.reset());
        await run(setup);
        if (before) await wait(before);
        await run(([i, w]) => kit.title(i, w, { top: 110, size: 56 }), [icon, word]);
        await shoot(secs, each || (() => {}));
      };
      await run(() => {
        kit.finish();
        kit.noHud();
        kit.go('CORTILE', 0, 80, '');
        kit.addCrowd([
          {
            id: 'a1',
            name: 'Giulia',
            x: 120,
            y: 0,
            path: [
              [-120, 0],
              [120, 0],
            ],
            speed: 2,
          },
          {
            id: 'a2',
            name: 'Marco',
            x: -200,
            y: 150,
            path: [
              [200, 150],
              [-200, 150],
            ],
            speed: 2.4,
          },
        ]);
        kit.title('🏠', 'CASA DOLCE CASA', {
          top: 120,
          size: 50,
          sub: 'Tutto quello che puoi fare in 30 secondi',
        });
      });
      await shoot(1.8, () => kit.crowdStep());

      await act(
        '🛋️',
        'ARREDA',
        () => {
          kit.go('PLAYER_ROOM', 10, 40, '');
          kit.own('lamp_std');
          kit.game.activeTargetProp = 'lamp';
          kit.character.startMovingFurniture();
        },
        ({ f }) => {
          kit.keys(f < 18 ? 1 : 0, f >= 18 && f < 32 ? 1 : 0);
          if (f === 34) kit.character.rotateFurniture();
        },
      );
      await act(
        '🍳',
        'CUCINA',
        () => kit.go('KITCHEN', 40, 60, ''),
        ({ f }) => {
          kit.walkTo(-40, 20);
          if (f === 12) kit.say('🍝 Pronto!');
        },
      );
      await act(
        '🚿',
        'DOCCIA',
        () => kit.go('BATHROOM', 0, 60, ''),
        ({ f }) => {
          kit.walkTo(-50, 10);
          if (f === 10) kit.say('🎶 la la la');
        },
      );
      await act(
        '💼',
        'LAVORA',
        () => {
          kit.go('lavoro_cantiere', 0, 110, '');
          kit.game.activeShift = {
            jobKey: 'cantiere',
            title: 'Cantiere',
            pay: 40,
            perItem: 5,
            delivered: 0,
            remaining: 300,
          };
          kit.jobs.mgStart('cantiere');
          kit.game.isSprinting = true;
        },
        () => kit.bot(),
        { before: 1600 },
      );
      await act('📈', 'INVESTI', async () => {
        kit.go('banca', 0, 40, '');
        (await import('/src/game/business.ts')).openBizSite();
      });
      await act(
        '🎨',
        'DIPINGI',
        () => kit.go('laboratorio', -60, -20, ''),
        ({ f }) => {
          kit.walkTo(-115, -25);
          if (f === 14) kit.say('🎨 Il mio capolavoro');
        },
      );
      await act(
        '🔨',
        "VENDI ALL'ASTA",
        () => kit.go('galleria', 0, 60, ''),
        ({ f }) => {
          kit.walkTo(0, 0);
          if (f === 10) kit.say('🔨 Venduto!');
        },
      );
      await act(
        '🐶',
        'ADOTTA',
        () => kit.go('negozio_animali', 0, 60, ''),
        ({ f }) => {
          kit.walkTo(-60, 10);
          if (f === 8) kit.say('Lo prendo! 🐶');
        },
      );
      await act(
        '❤️',
        'INNAMORATI',
        () => {
          kit.go('CORTILE', -10, 90, '');
          kit.addCrowd([
            { id: 'l1', name: 'Giulia', x: 60, y: 90, path: [[18, 90]], once: true, speed: 1.6 },
          ]);
        },
        ({ f }) => {
          kit.crowdStep();
          if (f === 14) kit.crowdSay('l1', '❤️');
          if (f === 20) kit.say('❤️');
        },
      );
      await act(
        '💍',
        'SPOSATI',
        () => {
          kit.go('passeggiata', -10, 40, '');
          kit.addCrowd([{ id: 'l1', name: 'Giulia', x: 20, y: 40, env: 'passeggiata' }]);
        },
        ({ f }) => {
          kit.crowdStep();
          if (f === 4) kit.say('Mi vuoi sposare? 💍');
          if (f === 22) kit.crowdSay('l1', 'Sì! 😍');
        },
      );
      await act(
        '🔓',
        'SCASSINA',
        () => {
          kit.go('PLAYER_ROOM', -90, 40, '');
          document.body.classList.add('hacker-glitch');
        },
        ({ f }) => {
          kit.walkTo(-140, 30);
          if (f === 14) kit.say('🔓 4… 7… 1…');
        },
      );
      await act(
        '👊',
        'DIFENDITI',
        () => {
          kit.go('PLAYER_ROOM', 20, 40, '');
          kit.addCrowd([
            {
              id: 'z1',
              name: 'Ladro',
              x: -140,
              y: 30,
              env: 'PLAYER_ROOM',
              crack: String(kit.game.myAssignedRoomIdx),
              crackT: Date.now(),
            },
          ]);
        },
        ({ f }) => {
          kit.walkTo(-100, 32);
          if (f === 22) kit.say('👊');
          if (f === 26) kit.crowdSay('z1', 'Ahia! 😵');
          kit.crowdStep();
        },
      );
      await act(
        '🚀',
        'VAI SULLA LUNA',
        () => {
          kit.go('luna', 0, 60, '');
          document.getElementById('no-air-overlay')?.classList.remove('hidden');
        },
        ({ f }) => {
          kit.walkTo(60, 0);
          if (f === 10) kit.say('Manca l’aria! 😱');
        },
      );
      await act('🎡', 'ROULETTE', () => {
        kit.go('scommesse', -50, 150, '');
        kit.wheel(17, { frames: 40 });
      });
      await act(
        '🎰',
        'SCOMMETTI',
        () => kit.go('scommesse', -200, -130, ''),
        ({ f }) => {
          kit.walkTo(-235, -150);
          if (f === 12) kit.say('🍒🍒🍒');
        },
      );
      await act(
        '🛍️',
        'FAI SHOPPING',
        () => kit.go('negozio_vestiti', 0, 60, ''),
        ({ f }) => {
          kit.walkTo(-50, 0);
          if (f === 10) kit.say('Questo mi sta bene ✨');
        },
      );
      await act(
        '🕹️',
        'SFIDA I VICINI',
        () => {
          kit.go('sala_giochi', -95, 45, '');
          kit.addCrowd([{ id: 's1', name: 'Marco', x: -95, y: -60, env: 'sala_giochi' }]);
        },
        ({ f }) => {
          kit.crowdStep();
          if (f === 6) kit.crowdSay('s1', 'Ti batto! 😤');
          if (f === 22) kit.say('Vedremo 😏');
        },
      );
      await act(
        '🖼️',
        'VOTA IL QUADRO',
        () => kit.go('galleria', 60, 40, ''),
        ({ f }) => {
          kit.walkTo(80, -20);
          if (f === 10) kit.say('❤️ 10 e lode');
        },
      );
      await act(
        '❄️',
        'IBERNA IL PERSONAGGIO',
        () => {
          kit.go('PLAYER_ROOM', -60, 30, '');
          kit.veil('rgba(140,210,255,.95)', 0.9);
        },
        ({ f }) => {
          if (f === 6) kit.say('Ci vediamo tra un mese ❄️');
        },
      );
      await act(
        '💀',
        'SOPRAVVIVI',
        () => {
          kit.go('CORTILE', 0, 80, '');
          kit.veil('rgba(200,0,0,.95)', 0.85);
        },
        ({ f }) => {
          if (f === 8) kit.game.fainted = true;
        },
      );
      // il finale: il cortile al tramonto, i vicini, il nome del gioco
      await run(() => {
        kit.reset();
        kit.go('CORTILE', 0, 80, '');
        kit.addCrowd([
          {
            id: 'b1',
            name: 'Giulia',
            x: 100,
            y: 0,
            path: [
              [-100, 0],
              [100, 0],
            ],
            speed: 1.8,
          },
          {
            id: 'b2',
            name: 'Marco',
            x: -200,
            y: 150,
            path: [
              [200, 150],
              [-200, 150],
            ],
            speed: 2.2,
          },
          {
            id: 'b3',
            name: 'Sara',
            x: 0,
            y: -120,
            path: [
              [150, -120],
              [-150, -120],
            ],
            speed: 2,
          },
        ]);
        kit.title('🏠', 'CASA DOLCE CASA', {
          top: 120,
          size: 50,
          sub: 'Gioca gratis dal browser · link in bio',
        });
      });
      await shoot(2.6, () => kit.crowdStep());
    },
  },

  // ---------------------------------------------------------------- 10. i 5 parametri
  parametri: {
    parts: [
      {
        hour: 18,
        async scene({ run, shoot }) {
          await run(() => {
            kit.finish();
            kit.noHud();
            kit.go('CORTILE', 0, 80, '');
            kit.title('📊', 'I 5 PARAMETRI', {
              top: 160,
              size: 60,
              sub: 'Tienili alti per stare bene',
            });
            kit.bars(
              [
                { icon: '😴', label: 'Sonno', value: 100 },
                { icon: '🍝', label: 'Fame', value: 100 },
                { icon: '🚿', label: 'Igiene', value: 100 },
                { icon: '😄', label: 'Felicità', value: 100 },
                { icon: '❤️', label: 'Salute', value: 100 },
              ],
              { top: 560, left: 50, width: 440, size: 28 },
            );
          });
          await shoot(2.4, () => {});
        },
      },
      {
        split: [
          strip('😴', 'Sonno', '🛏️ Letto', 'PLAYER_ROOM', [-90, 20], '🥱', 'sleep'),
          strip('🍝', 'Fame', '🍳 Cucina', 'KITCHEN', [40, 40], '😫', 'walk:-40,10:🍝'),
          strip('🚿', 'Igiene', '🛁 Doccia', 'BATHROOM', [40, 40], '🤢', 'walk:-50,0:✨'),
          strip('😄', 'Felicità', '👋 Amici', 'CORTILE', [0, 85], '😞', 'friends'),
          strip('❤️', 'Salute', '🏥 Ospedale', 'lavoro_ospedale', [0, 60], '🤒', 'walk:-40,20:💊'),
        ],
      },
      {
        hour: 22,
        async scene({ run, shoot }) {
          await run(() => {
            kit.finish();
            kit.noHud();
            kit.go('CORTILE', 0, 90, '');
          });
          await shoot(4.5, ({ f }) => {
            const v = Math.max(0, 30 - f * 0.7);
            kit.bars(
              ['😴', '🍝', '🚿', '😄', '❤️'].map((icon, i) => ({
                icon,
                label: ['Sonno', 'Fame', 'Igiene', 'Felicità', 'Salute'][i],
                value: i === 4 ? Math.max(3, v) : v,
              })),
              { top: 130, left: 50, width: 440, size: 26 },
            );
            if (f === 45) kit.game.fainted = true;
            if (f >= 45) kit.veil('rgba(200,0,0,.95)', Math.min(0.85, (f - 45) / 20));
            if (f === 62)
              kit.title('😵', "TIENILI D'OCCHIO", {
                top: 560,
                size: 52,
                sub: 'Casa dolce casa · link in bio',
              });
          });
        },
      },
    ],
  },

  // ---------------------------------------------------------------- 11. i Dindini
  dindini: {
    hour: 11,
    async scene({ run, shoot, wait }) {
      await run(() => {
        kit.finish();
        kit.noHud();
        kit.go('CORTILE', 0, 80, '');
        kit.money = 0;
        kit.piggy();
        kit.cityMap([
          { icon: '🏗️', label: 'Cantiere', x: 120, y: 260 },
          { icon: '🏥', label: 'Ospedale', x: 420, y: 260 },
          { icon: '🍕', label: 'Ristorante', x: 120, y: 660 },
          { icon: '💼', label: 'Ufficio', x: 420, y: 660 },
        ]);
        kit.caption('Come si guadagnano i Dindini 💰', { top: 70, size: 30 });
      });
      await shoot(3.4, () => {});
      const job = async (key, icon, word, pay, env, at, botOn) => {
        await run(() => kit.reset());
        await run(
          ([key, env, at]) => {
            kit.off('fx-caption');
            kit.go(env, at[0], at[1], '');
            kit.game.activeShift = {
              jobKey: key,
              title: key,
              pay: 40,
              perItem: 5,
              delivered: 0,
              remaining: 300,
            };
            kit.jobs.mgStart(key);
            kit.game.isSprinting = true;
          },
          [key, env, at],
        );
        await wait(1600);
        await run(([i, w]) => kit.title(i, w, { top: 90, size: 46 }), [icon, word]);
        await run((p) => (window.pay = p), pay);
        await shoot(
          2.3,
          botOn
            ? ({ f }) => {
                kit.bot();
                if (f === 30) kit.coin(window.pay);
              }
            : ({ f }) => {
                kit.walkTo(-60, 0);
                if (f === 30) kit.coin(window.pay);
              },
          { speed: 1.5 },
        );
      };
      await job('cantiere', '🏗️', 'CANTIERE', 40, 'lavoro_cantiere', [0, 110], true);
      await job('ospedale', '🏥', 'OSPEDALE', 55, 'lavoro_ospedale', [0, 60], false);
      await job('ristorante', '🍕', 'RISTORANTE', 45, 'lavoro_ristorante', [0, 60], false);
      await job('ufficio', '💼', 'UFFICIO', 60, 'lavoro_ufficio', [0, 60], true);
      // la borsa e le aste
      await run(() => kit.reset());
      await run(async () => {
        kit.go('banca', 0, 40, '');
        (await import('/src/game/business.ts')).openBizSite();
        kit.title('📈', 'BORSA', { top: 90, size: 46, sub: 'Compra basso, vendi alto' });
      });
      await shoot(2.4, ({ f }) => f === 26 && kit.coin(120));
      await run(() => kit.reset());
      await run(() => {
        kit.go('galleria', 0, 60, '');
        kit.title('🖼️', 'ASTE DEI QUADRI', { top: 90, size: 46, sub: 'Dipingi e vendi' });
      });
      await shoot(2.4, ({ f }) => {
        kit.walkTo(0, 0);
        if (f === 12) kit.say('🔨 Venduto!');
        if (f === 26) kit.coin(300);
      });
      // la roulette: se ti senti fortunato…
      await run(() => kit.reset());
      await run(() => {
        kit.go('scommesse', -50, 150, '');
        kit.title('🍀', 'SE TI SENTI FORTUNATO…', { top: 90, size: 40 });
        kit.wheel(32, { frames: 70 });
      });
      await shoot(3, () => {});
      await run(() => {
        kit.off('fx-wheel');
        kit.title('🎉', 'RADDOPPIATO!', { top: 300, size: 56, color: '#feca57' });
        kit.coin(kit.money, { from: [270, 470] });
      });
      await shoot(1.6, () => {});
      await run(() =>
        kit.title('🏠', 'CASA DOLCE CASA', {
          top: 300,
          size: 50,
          sub: 'Gioca gratis · link in bio',
        }),
      );
      await shoot(2.2, () => {});
    },
  },

  // ---------------------------------------------------------------- 12. arredare
  arredare: {
    hour: 16,
    async scene({ run, shoot }) {
      const step = (n, text) =>
        run(
          ([n, text]) =>
            kit.panel(
              'fx-step',
              `<span style="font:900 26px 'Segoe UI',system-ui;color:#feca57">${n}</span>` +
                `<span style="font:900 26px 'Segoe UI',system-ui;color:#fff;margin-left:10px">${text}</span>`,
              {
                css: 'left:50%;top:150px;padding:10px 20px;border-radius:16px;background:rgba(10,10,20,.78);white-space:nowrap;',
                base: 'translateX(-50%)',
                pop: true,
              },
            ),
          [n, text],
        );
      // la stanza vuota
      await run(() => {
        kit.finish();
        kit.noHud();
        kit.go('PLAYER_ROOM', -10, 60, '');
        kit.emptyRoom(['doorExit', 'safe', 'trashBin']);
        kit.title('🛋️', 'DA STANZA VUOTA', { top: 110, size: 50, sub: '…a casa tua, in 4 passi' });
      });
      await shoot(2.2, () => {});
      // 1. il negozio, con le tre serie fianco a fianco
      await run(() => {
        kit.reset();
        kit.go('negozio_mobili', -470, 165, '');
      });
      await step('1', 'Scegli al negozio di mobili');
      await shoot(4.2, ({ f }) => {
        kit.walkTo(-130, 165, 5);
        const tiers = [
          ['STANDARD', '20 Đ', '#dfe6e9'],
          ['PREGIATO', '50 Đ', '#74b9ff'],
          ['LUSSO', '75 Đ', '#feca57'],
        ];
        const on = Math.min(3, 1 + Math.floor(f / 38));
        kit.panel(
          'fx-tiers',
          `<div style="font:900 20px 'Segoe UI',system-ui;color:#fff;text-align:center;margin-bottom:6px">💡 La lampada</div>` +
            `<div style="display:flex;gap:8px">` +
            tiers
              .map(
                ([n, p, c], i) =>
                  `<div style="flex:1;text-align:center;padding:8px 4px;border-radius:12px;border:2px solid ${c};background:rgba(10,10,20,.8);opacity:${i < on ? 1 : 0.25};transform:scale(${i === on - 1 ? 1.08 : 1})">` +
                  `<div style="font:900 18px 'Segoe UI',system-ui;color:${c}">${n}</div>` +
                  `<div style="font:900 26px 'Segoe UI',system-ui;color:#fff">${p}</div></div>`,
              )
              .join('<div style="align-self:center;font-size:22px;color:#feca57">→</div>') +
            `</div>`,
          {
            css: 'left:20px;right:20px;bottom:110px;padding:12px;border-radius:18px;background:rgba(10,10,20,.55);',
          },
        );
      });
      // 2. comprala
      await run(() => {
        kit.off('fx-tiers');
        kit.say('La prendo! 🛒');
      });
      await step('2', 'Comprala');
      await shoot(1.6, ({ f }) => f === 12 && kit.coin(20, { from: [270, 470] }));
      // 3. spostala col dito
      await run(() => {
        kit.reset();
        kit.say('');
        kit.go('PLAYER_ROOM', 60, 90, '');
        kit.emptyRoom(['doorExit', 'safe', 'trashBin']);
        kit.restore('bed');
        kit.restore('desk');
        kit.own('lamp_std');
        kit.game.activeTargetProp = 'lamp';
        kit.character.startMovingFurniture();
      });
      await step('3', 'Spostala col dito');
      await shoot(3.4, ({ f }) => {
        kit.keys(f < 35 ? -1 : f < 70 ? 0 : 0, f >= 35 && f < 70 ? 1 : 0);
        const o = kit.map()[kit.game.movingPropKey];
        if (o) kit.pointAt(o.x, o.y);
      });
      // 4. girala
      await run(() => {
        kit.character.placeFurniture();
        kit.off('fx-finger');
        kit.game.activeTargetProp = 'desk';
        kit.character.startMovingFurniture();
      });
      await step('4', 'Girala come vuoi');
      await shoot(2.6, ({ f }) => {
        if (f === 10 || f === 40) kit.character.rotateFurniture();
        kit.panel('fx-rot', `<span style="font-size:90px">🔄</span>`, {
          css: 'left:50%;top:420px;',
          base: `translateX(-50%) rotate(${f * 6}deg)`,
        });
      });
      // e si sale di serie
      await run(() => {
        kit.character.placeFurniture();
        kit.reset();
        kit.go('PLAYER_ROOM', -10, 55, '');
      });
      const sets = [
        ['STANDARD', '#dfe6e9', ['lamp_std', 'nightstand_std', 'plant_std', 'sofa_std', 'tv_std']],
        [
          'PREGIATO',
          '#74b9ff',
          [
            'bed_pre',
            'wardrobe_pre',
            'desk_pre',
            'lamp_pre',
            'nightstand_pre',
            'plant_pre',
            'sofa_pre',
            'tv_pre',
          ],
        ],
        [
          'LUSSO',
          '#feca57',
          [
            'bed_lux',
            'wardrobe_lux',
            'desk_lux',
            'lamp_lux',
            'nightstand_lux',
            'plant_lux',
            'sofa_lux',
            'tv_lux',
          ],
        ],
      ];
      for (const set of sets) {
        await run(([name, color, ids]) => {
          for (const id of ids) kit.own(id);
          kit.title('✨', name, { top: 120, size: 54, color });
        }, set);
        await shoot(1.3, () => {});
      }
      await run(() =>
        kit.title('🏠', 'CASA TUA', { top: 120, size: 54, sub: 'Casa dolce casa · link in bio' }),
      );
      await shoot(2.2, () => {});
    },
  },

  // ---------------------------------------------------------------- 13. i vicini
  vicini: {
    hour: 17,
    async scene({ run, shoot }) {
      const ring = (done, label) =>
        run(
          ([done, label]) => {
            const icons = ['💬', '💭', '🎁', '🏠', '💋', '💍', '🕹️', '📰'];
            const R = 92;
            const dots = icons
              .map((ic, i) => {
                const a = -Math.PI / 2 + (i / icons.length) * Math.PI * 2;
                const x = 130 + Math.cos(a) * R,
                  y = 130 + Math.sin(a) * R;
                const on = i < done;
                return `<div style="position:absolute;left:${x - 26}px;top:${y - 26}px;width:52px;height:52px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:30px;background:${on ? '#fd79a8' : 'rgba(30,30,46,.9)'};border:3px solid ${on ? '#fff' : 'rgba(253,121,168,.6)'}">${on ? ic : ''}</div>`;
              })
              .join('');
            kit.panel(
              'fx-ring',
              `<div style="position:relative;width:260px;height:260px">` +
                `<div style="position:absolute;left:40px;top:40px;width:180px;height:180px;border-radius:50%;border:4px dashed rgba(253,121,168,.7)"></div>` +
                `<div style="position:absolute;left:0;right:0;top:100px;text-align:center;font-size:54px">${done >= 8 ? '❤️' : '🤝'}</div>` +
                dots +
                `</div>` +
                `<div style="text-align:center;font:900 28px 'Segoe UI',system-ui;color:#fff;margin-top:6px;white-space:nowrap">${label}</div>`,
              {
                css: 'left:50%;top:50px;padding:10px 22px 14px;border-radius:26px;background:rgba(10,10,20,.78);',
                base: 'translateX(-50%)',
              },
            );
          },
          [done, label],
        );
      const scene = async (i, label, setup, each, secs = 2.6) => {
        await run(() => kit.reset());
        await run(setup);
        await ring(i, label);
        await shoot(secs, each);
        await ring(i + 1, label);
      };
      await run(() => {
        kit.finish();
        kit.noHud();
        kit.go('CORTILE', 0, 120, '');
      });
      await ring(0, 'I tuoi vicini sono persone vere');
      await shoot(1.6, () => {});
      await scene(
        0,
        '💬 Chatta con tutti',
        () => {
          kit.go('CORTILE', 0, 140, '');
          kit.addCrowd([
            { id: 'v1', name: 'Giulia', x: -60, y: 150 },
            { id: 'v2', name: 'Marco', x: 60, y: 150 },
            { id: 'v3', name: 'Sara', x: 0, y: 190 },
          ]);
        },
        ({ f }) => {
          kit.crowdStep();
          if (f === 6) kit.crowdSay('v1', 'Ciao a tutti! 👋');
          if (f === 26) kit.crowdSay('v2', 'Chi viene al bar? 🍹');
          if (f === 46) kit.say('Io! 🙋');
        },
      );
      await scene(
        1,
        '💭 Parla con i fumetti',
        () => {
          kit.go('CORTILE', -30, 140, '');
          kit.addCrowd([{ id: 'v1', name: 'Luca', x: 30, y: 140 }]);
        },
        ({ f }) => {
          kit.crowdStep();
          if (f === 6) kit.say('Che bella giornata ☀️');
          if (f === 36) kit.crowdSay('v1', 'Vero! Facciamo un giro? 🚶');
        },
      );
      await scene(
        2,
        '🎁 Fai un regalo',
        () => {
          kit.go('CORTILE', -30, 140, '');
          kit.addCrowd([{ id: 'v1', name: 'Chiara', x: 30, y: 140 }]);
        },
        ({ f }) => {
          kit.crowdStep();
          if (f === 6) kit.say('Questo è per te 🎁');
          if (f === 36) kit.crowdSay('v1', 'Grazie!! 😍');
        },
      );
      await scene(
        3,
        '🏠 Visita la sua stanza',
        () => {
          kit.go('PLAYER_ROOM', 0, 150, '');
          kit.own('sofa_lux');
          kit.own('lamp_lux');
          kit.own('plant_lux');
        },
        ({ f }) => {
          kit.walkTo(-20, 40);
          if (f === 40) kit.say('Che bella stanza! 😍');
        },
      );
      await scene(
        4,
        '💋 Un bacio',
        () => {
          kit.go('CORTILE', -12, 150, '');
          kit.addCrowd([{ id: 'v1', name: 'Giulia', x: 14, y: 150 }]);
        },
        ({ f }) => {
          kit.crowdStep();
          if (f === 8) kit.say('💋');
          if (f === 20) kit.crowdSay('v1', '💋❤️');
        },
      );
      await scene(
        5,
        '💍 Fidanzati',
        () => {
          kit.go('CORTILE', -12, 150, '');
          kit.addCrowd([{ id: 'v1', name: 'Giulia', x: 14, y: 150 }]);
        },
        ({ f }) => {
          kit.crowdStep();
          if (f === 6) kit.say('Mi vuoi sposare? 💍');
          if (f === 40) kit.crowdSay('v1', 'SÌ! 😭❤️');
        },
      );
      await scene(
        6,
        '🕹️ Sfidalo in sala giochi',
        () => {
          kit.go('sala_giochi', -95, 45, '');
          kit.addCrowd([{ id: 'v1', name: 'Marco', x: -95, y: -60, env: 'sala_giochi' }]);
        },
        ({ f }) => {
          kit.crowdStep();
          if (f === 6) kit.crowdSay('v1', 'Ti batto! 😤');
          if (f === 36) kit.say('Ho vinto io 😎');
        },
      );
      await scene(
        7,
        '📰 Leggi i pettegolezzi',
        () => kit.go('CORTILE', -150, 175, ''),
        ({ f }) => {
          kit.walkTo(-176, 150);
          if (f === 30) kit.say('Hai sentito di Marco? 👀');
        },
      );
      await run(() => {
        kit.reset();
        kit.go('CORTILE', 0, 120, '');
        kit.addCrowd([
          { id: 'w1', name: 'Giulia', x: -60, y: 140 },
          { id: 'w2', name: 'Marco', x: 60, y: 140 },
          { id: 'w3', name: 'Sara', x: -30, y: 185 },
          { id: 'w4', name: 'Luca', x: 40, y: 190 },
        ]);
        kit.title('❤️', 'NON GIOCHI DA SOLO', {
          top: 120,
          size: 50,
          sub: 'Casa dolce casa · link in bio',
        });
      });
      await shoot(2.6, ({ f }) => {
        kit.crowdStep();
        if (f === 10) for (const id of ['w1', 'w2', 'w3', 'w4']) kit.crowdSay(id, '👋');
      });
    },
  },

  // ---------------------------------------------------------------- 14. Zero
  zero: {
    hour: 18,
    async scene({ run, shoot }) {
      const box = (n, icon, text) =>
        run(
          ([n, icon, text]) =>
            kit.panel(
              'fx-rule',
              `<div style="display:flex;align-items:center;gap:14px">` +
                `<div style="flex:none;width:54px;height:54px;border-radius:50%;background:#ff4757;display:flex;align-items:center;justify-content:center;font:900 30px 'Segoe UI',system-ui;color:#fff">${n}</div>` +
                `<div style="font-size:46px">${icon}</div>` +
                `<div style="font:800 24px 'Segoe UI',system-ui;color:#fff;line-height:1.25">${text}</div></div>`,
              {
                css: 'left:18px;right:18px;bottom:100px;padding:14px 16px;border-radius:20px;background:rgba(10,10,20,.85);border:2px solid #ff4757;',
                pop: true,
              },
            ),
          [n, icon, text],
        );
      await run(() => {
        kit.finish();
        kit.noHud();
        kit.go('CORTILE', 0, 90, '');
        document.body.classList.add('hacker-glitch');
        kit.title('💻', 'ZERO', {
          top: 140,
          size: 64,
          color: '#ff6b6b',
          sub: 'La regola più importante del condominio',
        });
      });
      await shoot(2.4, () => {});
      // 1. l'annuncio delle 11:45
      await run(() => {
        document.body.classList.remove('hacker-glitch');
        kit.off('fx-title');
        kit.clock('11:45');
        kit.panel(
          'fx-notif',
          `<div style="font:900 22px 'Segoe UI',system-ui;color:#ff6b6b">⚠️ Alle 18:30 arriva Zero</div>` +
            `<div style="font:600 18px 'Segoe UI',system-ui;color:#dfe6e9;margin-top:4px">Le casseforti si indeboliscono. Resta vicino alla tua!</div>`,
          {
            css: 'left:20px;right:20px;top:100px;padding:14px 18px;border-radius:18px;background:rgba(20,20,32,.95);border:1px solid rgba(255,255,255,.2);',
            pop: true,
          },
        );
      });
      await box(
        '1',
        '📢',
        'Ogni giorno alle 11:45 Zero annuncia l’ora dell’attacco: tra le 12 e le 23.',
      );
      await shoot(4, () => {});
      // 2. l'attacco: 10 minuti, il timer che scorre
      await run(() => {
        kit.off('fx-notif');
        document.body.classList.add('hacker-glitch');
      });
      await box(
        '2',
        '🔓',
        'Per 10 minuti tutte le casseforti sono indebolite: chi prova ad aprirle vede già la prima cifra.',
      );
      await shoot(4, ({ f, total }) => {
        const left = 600 - Math.round((f / total) * 600);
        kit.clock(`18:3${Math.min(9, Math.floor((f / total) * 10))}`);
        kit.panel(
          'fx-timer',
          `<div style="font:900 96px 'Segoe UI',system-ui;color:#ff4757;text-shadow:0 0 30px rgba(255,71,87,.8)">${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}</div>`,
          { css: 'left:0;right:0;top:330px;text-align:center;' },
        );
      });
      // 3. lo scasso: 15 secondi, poi i soldi spariscono
      await run(() => {
        kit.off('fx-timer');
        kit.go('PLAYER_ROOM', 40, 60, '');
        kit.addCrowd([
          {
            id: 'z1',
            name: 'Ladro',
            x: -140,
            y: 30,
            env: 'PLAYER_ROOM',
            crack: String(kit.game.myAssignedRoomIdx),
            crackT: Date.now(),
          },
        ]);
      });
      await box(
        '3',
        '💰',
        'Uno scasso dura 15 secondi. Se riesce, i soldi della tua cassaforte sono suoi.',
      );
      await shoot(4.2, ({ f, total }) => {
        kit.crowdStep();
        if (f === 10) kit.crowdSay('z1', '🔓 4 … ? … ?');
        const k = f / total;
        kit.panel(
          'fx-crack',
          `<div style="font:900 22px 'Segoe UI',system-ui;color:#fff;margin-bottom:6px">🔓 Scasso in corso · ${Math.round(15 - k * 15)} s</div>` +
            `<div style="height:16px;border-radius:99px;background:rgba(255,255,255,.2);overflow:hidden"><div style="height:100%;width:${k * 100}%;background:#ff4757"></div></div>`,
          {
            css: 'left:40px;right:40px;top:110px;padding:12px 16px;border-radius:16px;background:rgba(10,10,20,.85);',
          },
        );
      });
      // 4. il pugno
      await run(() => kit.off('fx-crack'));
      await box(
        '4',
        '👊',
        'Se lo vedi, dagli un pugno: lo scasso fallisce e la tua cassaforte, per lui, resta chiusa per sempre.',
      );
      await shoot(4, ({ f }) => {
        kit.crowdStep();
        kit.game.isSprinting = true;
        kit.walkTo(-100, 32);
        if (f === 30) {
          kit.say('👊');
          kit.crowdSay('z1', 'Ahia! 😵');
          kit.title('👊', 'PUGNO!', { top: 230, size: 70, color: '#feca57', bg: false });
        }
      });
      await run(() => {
        kit.reset();
        document.body.classList.remove('hacker-glitch');
        kit.go('PLAYER_ROOM', -60, 40, '');
        kit.title('🛡️', 'DIFENDI LA TUA CASSAFORTE', {
          top: 150,
          size: 40,
          sub: 'Casa dolce casa · link in bio',
        });
      });
      await shoot(2.4, () => {});
    },
  },

  // ---------------------------------------------------------------- 15. se esci dal gioco
  'se-esci': {
    hour: 15,
    async scene({ run, shoot }) {
      /** La linea del tempo in basso, con i parametri: `day` da 0 a 10, `frozen` per la capsula. */
      const timeline = () =>
        run(() => {
          window.vals = (d) => {
            const k = Math.min(1, d / 10);
            return [100 - k * 85, 100 - k * 100, 100 - k * 95, 100 - k * 90, 100 - k * k * 97];
          };
          window.tl = (day, vals, { frozen = false, dead = false } = {}) => {
            const x = 30 + (day / 10) * 420;
            const ticks = [...Array(11)]
              .map(
                (_, d) =>
                  `<div style="position:absolute;left:${30 + d * 42 - 10}px;top:30px;width:20px;text-align:center;font:800 14px 'Segoe UI',system-ui;color:#dfe6e9">${d}</div>`,
              )
              .join('');
            kit.panel(
              'fx-tl',
              `<div style="position:relative;height:60px">` +
                `<div style="position:absolute;left:30px;right:30px;top:20px;height:6px;border-radius:9px;background:rgba(255,255,255,.25)"></div>` +
                `<div style="position:absolute;left:30px;width:${x - 30}px;top:20px;height:6px;border-radius:9px;background:${frozen ? '#74b9ff' : day > 7 ? '#ff4757' : '#feca57'}"></div>` +
                ticks +
                `<div style="position:absolute;left:${x - 20}px;top:-8px;font-size:32px">${dead ? '⚰️' : frozen ? '❄️' : '🧍'}</div>` +
                `<div style="position:absolute;right:20px;top:-6px;font-size:26px">⚰️</div></div>` +
                `<div style="text-align:center;font:900 22px 'Segoe UI',system-ui;color:#fff;margin:6px 0 4px">${frozen ? '❄️ Il tempo è fermo' : `Giorno ${Math.floor(day)} senza entrare`}</div>`,
              {
                css: 'left:18px;right:18px;bottom:80px;padding:14px 10px 8px;border-radius:18px;background:rgba(10,10,20,.82);',
              },
            );
            kit.bars(
              ['😴', '🍝', '🚿', '😄', '❤️'].map((icon, i) => ({
                icon,
                label: '',
                value: vals[i],
              })),
              { top: 560, left: 40, width: 460, size: 20 },
            );
          };
        });
      await run(() => {
        kit.finish();
        kit.noHud();
        kit.go('CORTILE', 0, 90, '');
        kit.title('🚪', 'SE ESCI DAL GIOCO…', {
          top: 120,
          size: 50,
          sub: '…il tuo personaggio non sparisce',
        });
      });
      await timeline();
      await shoot(2.2, () => window.tl(0, [100, 100, 100, 100, 100]));

      // giorni 0-3: passeggia in cortile
      await run(() => {
        kit.off('fx-title');
        kit.caption('Vive da solo: passeggia…', { top: 110, size: 28 });
      });
      await shoot(3, ({ f, total }) => {
        const d = (f / total) * 3;
        window.tl(d, window.vals(d));
        kit.walkTo(f % 60 < 30 ? 90 : -60, 90);
      });
      // giorni 3-6: dorme
      await run(() => {
        kit.stop();
        kit.go('PLAYER_ROOM', -100, -20, '');
        kit.game.bedSlot = 0;
        kit.game.player.isSleeping = true;
        kit.caption('…dorme nel suo letto…', { top: 110, size: 28 });
      });
      await shoot(3, ({ f, total }) => {
        const d = 3 + (f / total) * 3;
        window.tl(d, window.vals(d));
      });
      // giorni 6-9.9: sempre più lento
      await run(() => {
        kit.game.player.isSleeping = false;
        kit.go('CORTILE', -40, 90, '');
        kit.caption('…ma i parametri calano (7 volte più piano)', { top: 110, size: 24 });
      });
      await shoot(3.4, ({ f, total }) => {
        const d = 6 + (f / total) * 3.9;
        window.tl(d, window.vals(d));
        kit.game.isSprinting = false;
        if (f % 3 === 0) kit.walkTo(40, 90);
        else kit.stop();
        kit.veil('rgba(200,0,0,.95)', Math.max(0, (d - 8) / 2) * 0.6);
      });
      // giorno 10: la lapide
      await run(() => {
        kit.veil('', 0);
        kit.grave('me', {
          name: kit.game.player.myData.nick,
          epitaph: 'Non è entrato per 10 giorni',
          style: 0,
          visitors: 3,
        });
        kit.go('CIMITERO', -700, -500, '');
        kit.caption('');
        kit.title('⚰️', 'GIORNO 10', { top: 120, size: 56, color: '#ff6b6b' });
      });
      await shoot(2.6, () => window.tl(10, [0, 0, 0, 0, 0], { dead: true }));
      // la capsula
      await run(() => {
        kit.reset();
        kit.go('PLAYER_ROOM', -60, 30, '');
        kit.veil('rgba(140,210,255,.95)', 0.9);
        kit.title('❄️', 'MA C’È LA CRIOGENESI', {
          top: 120,
          size: 44,
          sub: 'Il tempo si ferma: niente cala',
        });
      });
      await shoot(3.2, ({ f }) => {
        window.tl(4, window.vals(4), { frozen: true });
        if (f === 20) kit.say('Ci vediamo dopo le vacanze 🏖️');
      });
      await run(() =>
        kit.title('🏖️', 'PARTI IN VACANZA TRANQUILLO', {
          top: 120,
          size: 38,
          sub: 'Casa dolce casa · link in bio',
        }),
      );
      await shoot(2.4, () => window.tl(4, window.vals(4), { frozen: true }));
    },
  },

  // ---------------------------------------------------------------- 16. le personalità
  personalita: {
    hour: 17,
    async scene({ run, shoot }) {
      const cards = [
        [
          '🎨',
          '#a29bfe',
          ['Artista', 'Pittore affermato', "Maestro d'arte"],
          'I collezionisti pagano di più i tuoi quadri',
          ['+25%', '+40%', '+60%'],
          'laboratorio',
        ],
        [
          '💼',
          '#feca57',
          ['Imprenditore', 'Manager', 'Magnate'],
          'Interessi sul conto in banca, ogni giorno',
          ['1%', '1,5%', '2%'],
          'banca',
        ],
        [
          '😈',
          '#ff6b6b',
          ['Criminale', 'Ladro esperto', 'Boss del condominio'],
          'Tentativi per indovinare le casseforti (invece di 3)',
          ['5', '7', '9'],
          'PLAYER_ROOM',
        ],
        [
          '💘',
          '#fd79a8',
          ['Romanticone', "Cuore d'oro", "Leggenda dell'amore"],
          'Salute e felicità in regalo ogni giorno',
          ['+10%', '+15%', '+20%'],
          'passeggiata',
        ],
        [
          '🎰',
          '#fdcb6e',
          ['Scommettitore', 'Giocatore incallito', 'Re del casinò'],
          'Vincite più alte alla slot',
          ['+10%', '+20%', '+30%'],
          'scommesse',
        ],
        [
          '🕺',
          '#e056fd',
          ['Animale da festa', 'Re della pista', 'Leggenda della notte'],
          'Sconto sull’ingresso in discoteca',
          ['-25%', '-50%', 'gratis'],
          'discoteca',
        ],
        [
          '🐾',
          '#fab1a0',
          ['Amico degli animali', 'Addestratore', 'Dottor Dolittle'],
          'I pasti saziano di più i tuoi animali',
          ['+20%', '+40%', '+60%'],
          'negozio_animali',
        ],
        [
          '🚀',
          '#74b9ff',
          ['Inventore', 'Ingegnere', 'Astronauta'],
          'Sconto sul biglietto per la Luna',
          ['-20%', '-35%', '-50%'],
          'luna',
        ],
        [
          '🕵️',
          '#81ecec',
          ['Cittadino modello', 'Detective', 'Commissario'],
          'La tua parte delle multe che fai prendere',
          ['60%', '70%', '80%'],
          'commissariato',
        ],
      ];
      await run(() => {
        kit.finish();
        kit.noHud();
        kit.go('CORTILE', 0, 90, '');
        kit.title('🃏', 'LE PERSONALITÀ', {
          top: 130,
          size: 56,
          sub: 'Diventi quello che fai ogni giorno',
        });
      });
      await shoot(2.2, () => {});
      for (const c of cards) {
        await run((c) => {
          kit.reset();
          kit.go(c[5], 0, 60, '');
          window.card = c;
        }, c);
        await shoot(2.3, ({ f }) => {
          const [emoji, color, titles, perk, values] = window.card;
          // la carta gira entrando (come una carta da collezione), poi i livelli si accendono
          const flip = Math.min(1, f / 9);
          const sx = Math.abs(Math.cos((1 - flip) * Math.PI));
          const lv = f < 22 ? 1 : f < 42 ? 2 : 3;
          kit.panel(
            'fx-card',
            `<div style="width:330px;padding:18px 18px 16px;border-radius:24px;background:linear-gradient(160deg,#1e2235,#121420);border:4px solid ${color};box-shadow:0 0 40px ${color}88">` +
              `<div style="text-align:center;font-size:84px;line-height:1.1">${emoji}</div>` +
              `<div style="text-align:center;font:900 30px 'Segoe UI',system-ui;color:${color};margin:4px 0 2px">${titles[lv - 1]}</div>` +
              `<div style="text-align:center;font:700 16px 'Segoe UI',system-ui;color:#dfe6e9;margin-bottom:12px">${perk}</div>` +
              titles
                .map(
                  (t, i) =>
                    `<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 12px;margin-top:6px;border-radius:12px;background:${i < lv ? color + '33' : 'rgba(255,255,255,.06)'};opacity:${i < lv ? 1 : 0.35}">` +
                    `<span style="font:800 17px 'Segoe UI',system-ui;color:#fff">Lv ${i + 1} · ${t}</span>` +
                    `<span style="font:900 20px 'Segoe UI',system-ui;color:${color}">${values[i]}</span></div>`,
                )
                .join('') +
              `</div>`,
            { css: 'left:50%;top:150px;', base: `translateX(-50%) scaleX(${sx})` },
          );
        });
      }
      // la decima: da scoprire
      await run(() => {
        kit.reset();
        kit.go('CORTILE', 0, 90, '');
        kit.title('❓', 'E LA DECIMA?', { top: 150, size: 54, sub: 'Scoprila nel gioco 🤫' });
      });
      await shoot(1.8, () => {});
      await run(() =>
        kit.title('🤔', 'QUALE SARESTI TU?', {
          top: 150,
          size: 50,
          sub: 'Scrivilo nei commenti 👇',
        }),
      );
      await shoot(2.6, () => {});
    },
  },

  // ---------------------------------------------------------------- 17. le missioni
  missioni: {
    hour: 16,
    async scene({ run, shoot }) {
      await run(async () => {
        kit.finish();
        kit.noHud();
        kit.go('CORTILE', 0, 90, '');
        (await import('/src/game/quests.ts')).openQuests();
        kit.title('📋', 'LE MISSIONI', { top: 40, size: 48 });
      });
      await shoot(2.6, () => {});
      // i capitoli
      await run(() => {
        document.getElementById('quests-modal')?.classList.add('hidden');
        kit.off('fx-title');
      });
      await shoot(4.2, ({ f }) => {
        const chapters = [
          '🏙️ La città',
          '👋 I vicini',
          '💼 Lavoro e soldi',
          '🔐 Rischi e regole',
          '🚀 I grandi progetti',
          '🌙 Sulla Luna',
          '📮 La tua idea',
        ];
        const done = Math.min(chapters.length, Math.floor(f / 16));
        kit.panel(
          'fx-chap',
          `<div style="font:900 28px 'Segoe UI',system-ui;color:#feca57;text-align:center;margin-bottom:10px">📖 7 capitoli da completare</div>` +
            chapters
              .map(
                (c, i) =>
                  `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;margin-top:8px;border-radius:14px;background:${i < done ? 'rgba(46,213,115,.25)' : 'rgba(255,255,255,.07)'};border:2px solid ${i < done ? '#2ed573' : 'transparent'}">` +
                  `<span style="font:800 22px 'Segoe UI',system-ui;color:#fff">${c}</span>` +
                  `<span style="font-size:26px">${i < done ? '✅' : '⬜'}</span></div>`,
              )
              .join(''),
          {
            css: 'left:22px;right:22px;top:120px;padding:16px;border-radius:22px;background:rgba(10,10,20,.88);',
          },
        );
      });
      // le missioni del giorno e la serie
      await run(() => kit.off('fx-chap'));
      await shoot(5.4, ({ f }) => {
        const daily = ['💼 Un turno di lavoro', '🍝 Due pasti', '🚿 Una doccia'];
        const dd = Math.min(3, Math.floor(f / 12));
        const day = Math.min(7, Math.max(0, Math.floor((f - 40) / 15) + 1));
        const streak = [...Array(7)]
          .map(
            (_, i) =>
              `<div style="flex:1;text-align:center;padding:6px 0;border-radius:10px;background:${i < day ? '#feca57' : 'rgba(255,255,255,.08)'};color:${i < day ? '#1e1e2e' : '#aaa'};font:900 15px 'Segoe UI',system-ui">${i === 6 ? '🏅' : `+${20 + i * 10}`}</div>`,
          )
          .join('');
        kit.panel(
          'fx-daily',
          `<div style="font:900 28px 'Segoe UI',system-ui;color:#feca57;text-align:center">☀️ Ogni giorno 3 missioni</div>` +
            daily
              .map(
                (d, i) =>
                  `<div style="display:flex;justify-content:space-between;padding:10px 14px;margin-top:8px;border-radius:14px;background:rgba(255,255,255,.07)"><span style="font:800 22px 'Segoe UI',system-ui;color:#fff">${d}</span><span style="font-size:24px">${i < dd ? '✅' : '⬜'}</span></div>`,
              )
              .join('') +
            `<div style="font:900 22px 'Segoe UI',system-ui;color:#fff;text-align:center;margin:16px 0 8px">🔥 Giorni di fila: ${day}</div>` +
            `<div style="display:flex;gap:5px">${streak}</div>` +
            `<div style="font:700 17px 'Segoe UI',system-ui;color:#dfe6e9;text-align:center;margin-top:8px">${day >= 7 ? '🏅 Medaglia della settimana!' : 'Più giorni di fila, più Đ: da 20 a 80'}</div>`,
          {
            css: 'left:22px;right:22px;top:140px;padding:18px 16px;border-radius:22px;background:rgba(10,10,20,.88);',
          },
        );
      });
      // la mensola dei trofei che si riempie
      await run(() => {
        kit.off('fx-daily');
        kit.go('PLAYER_ROOM', -120, 100, '');
        // le missioni ricalcolano i trofei da quelle fatte davvero: nel video li decide la scena
        window.shown = [];
        Object.defineProperty(kit.game.player, 'trophies', {
          configurable: true,
          get: () => window.shown,
          set: () => {},
        });
        kit.title('🏆', 'LA MENSOLA DEI TROFEI', { top: 110, size: 40 });
      });
      await shoot(4.4, ({ f }) => {
        const all = [
          'trofeo_benvenuto',
          'trofeo_citta',
          'trofeo_vicini',
          'trofeo_lavoro',
          'trofeo_rischi',
          'trofeo_progetti',
          'medaglia_luna',
          'medaglia_idea',
          'medaglia_settimana',
        ];
        window.shown = all.slice(0, Math.min(all.length, Math.floor(f / 13)));
      });
      await run(() =>
        kit.title('🏆', 'RIEMPILA TUTTA', {
          top: 110,
          size: 46,
          sub: 'Casa dolce casa · link in bio',
        }),
      );
      await shoot(2.2, () => {});
    },
  },

  // ---------------------------------------------------------------- 18. un giorno intero
  giornata: {
    hour: 7,
    async scene({ run, shoot, setTime, page }) {
      const day0 = await page.evaluate(() => {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        return d.getTime();
      });
      /** Una scena della giornata: dalle `from` alle `to` (ore, anche con i minuti in decimali). */
      const part = async (from, to, secs, icon, word, setup, each) => {
        await run(() => kit.reset());
        await setTime(day0 + from * HOUR);
        await run(setup);
        await run(([i, w]) => kit.title(i, w, { top: 120, size: 44 }), [icon, word]);
        await shoot(secs, each || (() => {}), {
          onFrame: (f, total) => setTime(day0 + (from + ((to - from) * f) / total) * HOUR),
        });
      };
      await run(() => {
        kit.finish();
        kit.noHud();
      });
      // l'orologio grande, aggiornato a ogni fotogramma dall'ora del gioco
      await run(() => {
        kit.fx['fx-clockTick'] = () => {
          const d = new Date();
          kit.clock(
            `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
          );
        };
      });
      await part(
        7,
        7.5,
        3.5,
        '⏰',
        'SVEGLIA',
        () => {
          kit.go('PLAYER_ROOM', -100, -20, '');
          kit.game.bedSlot = 0;
          kit.game.player.isSleeping = true;
        },
        ({ f }) => {
          if (f === 60) kit.game.player.isSleeping = false;
          if (f === 75) kit.say('Buongiorno ☀️');
        },
      );
      await part(
        7.5,
        8,
        4,
        '🚿',
        'DOCCIA',
        () => kit.go('BATHROOM', 30, 60, ''),
        ({ f }) => {
          kit.walkTo(-50, 0);
          if (f === 40) kit.say('🎶');
        },
      );
      await part(
        8,
        8.5,
        4,
        '🍳',
        'COLAZIONE',
        () => kit.go('KITCHEN', 40, 60, ''),
        ({ f }) => {
          kit.walkTo(-40, 20);
          if (f === 40) kit.say('☕🥐');
        },
      );
      await part(
        9,
        13,
        8,
        '💼',
        'AL LAVORO',
        () => {
          kit.go('lavoro_ufficio', 0, 60, '');
          kit.game.activeShift = {
            jobKey: 'ufficio',
            title: 'Ufficio',
            pay: 40,
            perItem: 5,
            delivered: 0,
            remaining: 300,
          };
          kit.jobs.mgStart('ufficio');
          kit.game.isSprinting = true;
        },
        () => kit.bot(),
      );
      await part(13.5, 14, 4, '📈', 'LA BORSA', async () => {
        kit.go('banca', 0, 40, '');
        (await import('/src/game/business.ts')).openBizSite();
      });
      await part(
        15,
        17,
        8,
        '👋',
        'I VICINI',
        () => {
          kit.go('CORTILE', 0, 80, '');
          kit.addCrowd([
            {
              id: 'g1',
              name: 'Giulia',
              x: 100,
              y: 0,
              path: [
                [-100, 0],
                [100, 0],
              ],
              speed: 1.8,
            },
            {
              id: 'g2',
              name: 'Marco',
              x: -200,
              y: 150,
              path: [
                [200, 150],
                [-200, 150],
              ],
              speed: 2.2,
            },
            { id: 'g3', name: 'Sara', x: 40, y: 85 },
          ]);
        },
        ({ f }) => {
          kit.crowdStep();
          if (f === 30) kit.crowdSay('g3', 'Ciao vicino! 👋');
          if (f === 70) kit.say('Ciao Sara! 😄');
          if (f === 150) kit.crowdSay('g1', 'Stasera sala giochi? 🕹️');
        },
      );
      await part(
        17.5,
        18.5,
        5,
        '🕹️',
        'SALA GIOCHI',
        () => {
          kit.go('sala_giochi', -95, 45, '');
          kit.addCrowd([{ id: 'g4', name: 'Giulia', x: -95, y: -60, env: 'sala_giochi' }]);
        },
        ({ f }) => {
          kit.crowdStep();
          if (f === 30) kit.crowdSay('g4', 'Rivincita! 😤');
          if (f === 90) kit.say('Ho vinto 😎');
        },
      );
      await part(
        19,
        20,
        5,
        '🌅',
        'PASSEGGIATA',
        () => kit.go('passeggiata', -60, 40, ''),
        () => kit.walkTo(80, 40),
      );
      await part(
        20.5,
        21,
        4,
        '🍝',
        'CENA',
        () => kit.go('KITCHEN', 40, 60, ''),
        ({ f }) => {
          kit.walkTo(-40, 20);
          if (f === 40) kit.say('🍝😋');
        },
      );
      await part(
        21.5,
        22.5,
        5,
        '🌙',
        'I LAMPIONI SI ACCENDONO',
        () => {
          kit.go('CORTILE', 0, 90, '');
          kit.addCrowd([
            {
              id: 'g5',
              name: 'Luca',
              x: 120,
              y: 30,
              path: [
                [-120, 30],
                [120, 30],
              ],
              speed: 1.6,
            },
          ]);
        },
        () => {
          kit.crowdStep();
          kit.walkTo(-40, 120);
        },
      );
      await part(
        22.5,
        23,
        5,
        '😴',
        'BUONANOTTE',
        () => kit.go('PLAYER_ROOM', 0, 60, ''),
        ({ f }) => {
          if (kit.walkTo(-60, -10) && f > 40) {
            kit.game.bedSlot = 0;
            kit.game.player.isSleeping = true;
          }
        },
      );
      await run(() =>
        kit.title('🏠', 'CASA DOLCE CASA', {
          top: 120,
          size: 50,
          sub: 'Una vita intera, ogni giorno · link in bio',
        }),
      );
      await shoot(3, () => {});
    },
  },
};
