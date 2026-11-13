// Gli attrezzi delle scene dei video (scripts/video.mjs), dentro la pagina del gioco: window.kit.
// Si usano dalle scene di scripts/videos.mjs con run(() => kit…) e shoot(secondi, () => kit…).
// Tutto succede nella modalità prova (?offline=1): i "vicini" e le lapidi stanno nel database
// finto del dispositivo, e il gioco li disegna come quelli veri.
const { game } = await import('/src/game/context.ts');
const { applyRoomBounds } = await import('/src/game/room-size.ts');
const { worldNode } = await import('/src/game/world-db.ts');
const arrival = await import('/src/game/arrival.ts');
const jobs = await import('/src/game/jobs.ts');
const character = await import('/src/game/character.ts');
const { PLAYER_ROOM_FURNITURE } = await import('/src/game/data/catalogues.ts');

/** Il posto della presenza (vicini simulati) e del cimitero, nel mondo in cui si gioca. */
const presence = (id) => game.session.db.ref(worldNode('online_players') + '/' + id);

const kit = {
  game,
  arrival,
  jobs,
  character,
  /** Chiude l'arrivo del giocatore nuovo e spegne le proposte delle missioni di benvenuto. */
  finish() {
    arrival.finishArrival();
    game.player.welcome = { ...(game.player.welcome || {}), status: 'off' };
    // la cassaforte ha già la sua combinazione: niente finestra che la chiede a metà scena
    game.hasSetSafePin = true;
  },
  /** Porta il personaggio in un ambiente (e in un punto), con la telecamera centrata. */
  go(env, x, y, title = '') {
    game.view.activeEnvironment = env;
    game.view.currentRoomTitle = title;
    if (env === 'PLAYER_ROOM') game.currentRoomIdx = game.myAssignedRoomIdx;
    applyRoomBounds(env);
    if (x !== undefined) game.playerPos = { x, y };
    game.cam = null;
  },
  /** Tasti premuti: x -1 sinistra / 1 destra, y -1 su / 1 giù (verso lo schermo). */
  keys(x = 0, y = 0) {
    game.keysPressed.a = x < 0;
    game.keysPressed.d = x > 0;
    game.keysPressed.w = y < 0;
    game.keysPressed.s = y > 0;
    // il gioco legge i tasti solo quando arriva un evento della tastiera: la direzione si dà qui
    game.moveRight = Math.sign(x);
    game.moveForward = -Math.sign(y);
  },
  stop() {
    kit.keys(0, 0);
  },
  /**
   * Un passo verso (x, y): vero quando ci è arrivato. Se un mobile blocca la strada (il personaggio
   * non si muove) lo si fa scivolare oltre, così la scena non si pianta.
   */
  walkTo(x, y, tol = 6) {
    const dx = x - game.playerPos.x;
    const dy = y - game.playerPos.y;
    if (Math.hypot(dx, dy) < tol) {
      kit.stop();
      kit._last = null;
      return true;
    }
    kit.keys(
      Math.abs(dx) > tol / 2 ? Math.sign(dx) : 0,
      Math.abs(dy) > tol / 2 ? Math.sign(dy) : 0,
    );
    const p = game.playerPos;
    if (kit._last && Math.hypot(p.x - kit._last.x, p.y - kit._last.y) < 0.3) {
      const d = Math.hypot(dx, dy);
      game.playerPos = { x: p.x + (dx / d) * 3, y: p.y + (dy / d) * 3 };
    }
    kit._last = { ...game.playerPos };
    return false;
  },
  /** Il fumetto del proprio personaggio. */
  say(text) {
    game.mySay = text;
    game.mySayT = Date.now();
  },
  /** Vestiti diversi per ogni vicino (dal catalogo del negozio), sempre gli stessi per `i`. */
  look(i) {
    const slots = [
      'top',
      'pants',
      'shoes',
      ...(i % 3 === 0 ? ['hat'] : []),
      ...(i % 4 === 1 ? ['glasses'] : []),
    ];
    return slots
      .map((slot, s) => {
        const list = game.shopCatalog.filter((it) => it.slot === slot);
        return list.length ? list[(i * 7 + s * 5 + 3) % list.length].id : null;
      })
      .filter(Boolean)
      .join(',');
  },
  /** Un vicino simulato: si scrive nella presenza del database di prova, come un giocatore vero. */
  neighbor(id, data) {
    return presence(id).set({
      env: game.view.activeEnvironment,
      t: Date.now(),
      vx: 0,
      vy: 0,
      ...data,
    });
  },
  /** Muove un vicino simulato verso (x, y) di `step` unità a fotogramma; vero se è arrivato. */
  neighborStep(id, data, x, y, step) {
    const dx = x - data.x;
    const dy = y - data.y;
    const d = Math.hypot(dx, dy);
    const k = d <= step ? 1 : step / d;
    data.x += dx * k;
    data.y += dy * k;
    const moving = d > 0.5;
    kit.neighbor(id, {
      ...data,
      vx: moving ? Math.round((dx / d) * step * 30) : 0,
      vy: moving ? Math.round((dy / d) * step * 30) : 0,
    });
    return !moving || d <= step;
  },
  removeNeighbor(id) {
    return presence(id).remove();
  },
  // ------------------------------------------------------------ la folla
  /** I vicini simulati della scena: { id, name, x, y, env, path: [[x, y]…], speed, pause }. */
  crowd: [],
  addCrowd(list) {
    for (const [i, n] of list.entries())
      kit.crowd.push({
        look: kit.look(kit.crowd.length + i + 1),
        speed: 2.2,
        pause: 0,
        i: 0,
        wait: 0,
        say: '',
        sayT: 0,
        env: game.view.activeEnvironment,
        ...n,
      });
  },
  /** Un fotogramma della folla: ognuno avanza lungo il suo giro (con le soste, se ne ha). */
  crowdStep() {
    for (const n of kit.crowd) {
      let vx = 0,
        vy = 0;
      if (n.wait > 0) n.wait--;
      else if (n.path?.length) {
        const [tx, ty] = n.path[n.i % n.path.length];
        const dx = tx - n.x,
          dy = ty - n.y;
        const d = Math.hypot(dx, dy);
        if (d <= n.speed) {
          n.x = tx;
          n.y = ty;
          n.i++;
          n.wait = n.pause;
          if (n.once && n.i >= n.path.length) n.path = null;
        } else {
          n.x += (dx / d) * n.speed;
          n.y += (dy / d) * n.speed;
          vx = Math.round((dx / d) * n.speed * 30);
          vy = Math.round((dy / d) * n.speed * 30);
        }
      }
      const extra = {};
      if (n.env === 'PLAYER_ROOM') extra.roomIdx = game.currentRoomIdx;
      if (game.APT_ENVS.includes(n.env)) extra.apt = game.currentApt;
      kit.neighbor(n.id, {
        name: n.name,
        x: Math.round(n.x),
        y: Math.round(n.y),
        env: n.env,
        look: n.look,
        say: n.say,
        sayT: n.sayT,
        vx,
        vy,
        ...extra,
        ...(n.crack !== undefined ? { crack: n.crack, crackT: n.crackT } : {}),
      });
    }
  },
  /** Il fumetto di un vicino della folla. */
  crowdSay(id, text) {
    const n = kit.crowd.find((c) => c.id === id);
    if (!n) return;
    n.say = text;
    n.sayT = Date.now();
  },
  /** Toglie la folla (dalla scena e dalla presenza). */
  clearCrowd() {
    for (const n of kit.crowd) kit.removeNeighbor(n.id);
    kit.crowd = [];
  },
  /** Una lapide nel cimitero (come quelle vere: nome, data, epitaffio). */
  grave(id, data) {
    return game.session.db
      .ref(worldNode('graveyard') + '/' + id)
      .set({ deadAt: Date.now(), ...data });
  },
  // ------------------------------------------------------------ mobili della stanza
  /** I mobili di partenza della stanza, per tornarci. */
  roomDefaults: structuredClone(PLAYER_ROOM_FURNITURE),
  /** Svuota la stanza: niente mobili posseduti, e dei mobili fissi restano solo quelli dati. */
  emptyRoom(keep = ['doorExit']) {
    game.player.ownedFurniture = {};
    for (const k of Object.keys(game.playerRoomFurniture))
      if (!keep.includes(k)) delete game.playerRoomFurniture[k];
  },
  /** Rimette un mobile fisso della stanza com'era all'inizio. */
  restore(key) {
    game.playerRoomFurniture[key] = structuredClone(kit.roomDefaults[key]);
  },
  /** Un mobile del negozio (lamp_lux, bed_pre…) posseduto: si vede al suo posto. */
  own(id) {
    game.player.ownedFurniture = { ...game.player.ownedFurniture, [id]: true };
  },
  /** Un mobile in più nella stanza, disegnato come `kind` (letto, divano…), con un nome suo. */
  addFurniture(key, kind, data) {
    game.FURNITURE_DRAW[key] = game.FURNITURE_DRAW[kind];
    game.playerRoomFurniture[key] = { moveable: false, ...data };
  },
  /** I dati di un mobile del catalogo (bed_lux…), da mettere dove si vuole. */
  catalog(id) {
    return structuredClone(game.furnitureCatalog.find((c) => c.id === id));
  },
  // ------------------------------------------------------------ il lavoro
  /**
   * Un fotogramma del lavoratore automatico (lavori con oggetti da portare: cantiere, ufficio):
   * prende l'oggetto giusto e lo porta al posto giusto, senza mai sbagliare (la paga del turno sale
   * nella barra in basso). Vero quando consegna.
   */
  bot() {
    const MG = game.MG;
    if (!MG.active || jobs.mgStarting()) return false;
    const step = MG.task?.steps[MG.stepIdx];
    if (!step) return false;
    const entry = Object.entries(MG.map).find(([, o]) =>
      MG.carry
        ? o.kind === 'target' && o.id === step.target
        : o.kind === 'pickup' && o.item.id === step.item,
    );
    if (!entry) return false;
    const [key, o] = entry;
    // davanti al bersaglio (dal lato dello schermo), sopra l'oggetto da prendere
    const tx = o.x;
    const ty = o.kind === 'target' ? o.y + o.h / 2 + 16 : o.y;
    if (!kit.walkTo(tx, ty, 12)) return false;
    const before = MG.score;
    jobs.mgInteract(o, key);
    return MG.score > before;
  },
  // ------------------------------------------------------------ sopra il video
  /** Una scritta grande sopra il gioco (o la toglie, con testo vuoto). */
  badge(text, { top = 150, size = 46, color = '#fff', bg = 'rgba(0,0,0,0.55)' } = {}) {
    let el = document.getElementById('video-badge');
    if (!el) {
      el = document.createElement('div');
      el.id = 'video-badge';
      el.style.cssText =
        'position:fixed;left:50%;transform:translateX(-50%);z-index:5000;padding:10px 22px;' +
        'border-radius:16px;font:900 46px system-ui,sans-serif;letter-spacing:1px;white-space:nowrap;' +
        'text-shadow:0 3px 10px rgba(0,0,0,0.6);pointer-events:none';
      document.body.append(el);
    }
    el.textContent = text;
    el.style.display = text ? 'block' : 'none';
    el.style.top = top + 'px';
    el.style.fontSize = size + 'px';
    el.style.color = color;
    el.style.background = bg;
  },
  /** Nasconde i pulsanti e i riquadri che non servono alla scena (o li rimette). */
  clean(on = true) {
    let st = document.getElementById('video-clean');
    if (!st) {
      st = document.createElement('style');
      st.id = 'video-clean';
      document.head.append(st);
    }
    st.textContent = on
      ? '.hud-controls, #mission-text, #pop-interaction, #coach, #welcome-hud { display: none !important; }'
      : '';
  },
  ready: true,
};
window.kit = kit;

// ------------------------------------------------------------------ effetti sopra il gioco
// Tutto si anima a fotogrammi (kit.tick, chiamato da video.mjs dopo ogni fotogramma): con
// l'orologio finto le animazioni CSS non andrebbero a tempo.
const { drawWheel } = await import('/src/game/roulette.ts');
const { BET_MS, SPIN_MS } = await import('/src/game/roulette-rules.ts');

const FONT = "900 {s}px 'Segoe UI', system-ui, sans-serif";
const el = (id, css) => {
  let e = document.getElementById(id);
  if (!e) {
    e = document.createElement('div');
    e.id = id;
    e.style.cssText = 'position:fixed;z-index:5000;pointer-events:none;' + css;
    document.body.append(e);
  }
  return e;
};
/** Un rimbalzo da 0 a 1 in `n` fotogrammi (va un po' oltre e torna). */
const pop = (k, n = 7) => {
  const x = Math.min(1, Math.max(0, k / n)) - 1;
  return 1 + 2.7 * x ** 3 + 1.7 * x ** 2;
};
const ease = (k, n) => {
  const x = Math.min(1, Math.max(0, k / n));
  return 1 - (1 - x) ** 3;
};

Object.assign(kit, {
  /** Nasconde anche i parametri in alto a sinistra e la riga dei vicini. */
  noHud() {
    kit.clean();
    document.getElementById('video-clean').textContent +=
      ' #hud-top-left, #app-version, #btn-return-home, #minigame, #work-start { display: none !important; }';
  },
  /** Rimette la scena in ordine prima della prossima (montaggio a raffica). */
  async reset() {
    kit.stop();
    kit.say('');
    if (game.isMovingFurnitureMode) character.placeFurniture();
    jobs.mgStop();
    game.activeShift = null;
    game.fainted = false;
    game.player.isSleeping = false;
    game.isSprinting = false;
    document.getElementById('biz-modal')?.classList.add('hidden');
    document.getElementById('no-air-overlay')?.classList.add('hidden');
    document.body.classList.remove('hacker-glitch');
    kit.clearCrowd();
    const keep = ['fx-piggy', 'fx-clock', 'fx-clockTick'];
    for (const id of Object.keys(kit.fx)) if (!keep.includes(id)) kit.off(id);
    // e tutti i riquadri disegnati sopra, tranne salvadanaio e orologio
    for (const e of document.querySelectorAll('[id^="fx-"]'))
      if (e.id !== 'fx-piggy' && e.id !== 'fx-clock') kit.off(e.id);
  },
  frame: 0,
  fx: {},
  /** Dopo ogni fotogramma: le animazioni avanzano. */
  tick() {
    kit.frame++;
    for (const f of Object.values(kit.fx)) f();
  },
  /** Toglie un effetto (e il suo riquadro). */
  off(id) {
    delete kit.fx[id];
    document.getElementById(id)?.remove();
  },
  /** Il titolo grande: icona e parola che entrano con un rimbalzo; `sub` è la riga sotto. */
  title(icon, word, { top = 330, sub = '', color = '#fff', size = 64, bg = true } = {}) {
    const e = el(
      'fx-title',
      'left:0;right:0;display:flex;flex-direction:column;align-items:center;text-align:center;',
    );
    e.innerHTML =
      `<div style="font-size:${size * 1.5}px;line-height:1;filter:drop-shadow(0 6px 10px rgba(0,0,0,.55))">${icon}</div>` +
      `<div style="font:${FONT.replace('{s}', size)};color:${color};letter-spacing:2px;line-height:1.05;` +
      `padding:6px 22px;border-radius:18px;margin-top:6px;${bg ? 'background:rgba(10,10,20,.62);' : ''}` +
      `text-shadow:0 4px 14px rgba(0,0,0,.7)">${word}</div>` +
      (sub
        ? `<div style="font:${FONT.replace('{s}', 24)};color:#feca57;margin-top:8px;text-shadow:0 3px 10px rgba(0,0,0,.8)">${sub}</div>`
        : '');
    e.style.top = top + 'px';
    const start = kit.frame;
    kit.fx['fx-title'] = () => {
      const s = pop(kit.frame - start);
      e.style.transform = `scale(${Math.max(0, s)})`;
      e.style.opacity = String(Math.min(1, (kit.frame - start) / 3));
    };
    kit.fx['fx-title']();
  },
  /** Una riga di testo fissa (in alto o in basso), senza animazioni. */
  caption(text, { top = 90, size = 30, color = '#fff' } = {}) {
    if (!text) return kit.off('fx-caption');
    const e = el(
      'fx-caption',
      'left:20px;right:20px;text-align:center;padding:8px 14px;border-radius:14px;background:rgba(10,10,20,.62);',
    );
    e.style.top = top + 'px';
    e.style.font = FONT.replace('{s}', size);
    e.style.color = color;
    e.textContent = text;
  },
  /** Un velo colorato su tutto (rosso per il pericolo, azzurro per il ghiaccio), da 0 a 1. */
  veil(color, alpha) {
    if (!alpha) return kit.off('fx-veil');
    const e = el('fx-veil', 'inset:0;z-index:4900;');
    e.style.background = `radial-gradient(ellipse at center, transparent 35%, ${color})`;
    e.style.opacity = String(alpha);
  },
  /** Barre dei parametri disegnate grandi: [{ icon, label, value (0-100) }]. */
  bars(list, { top = 14, left = 14, width = 230, size = 20 } = {}) {
    const e = el(
      'fx-bars',
      `left:${left}px;top:${top}px;width:${width}px;padding:10px 12px;border-radius:14px;background:rgba(10,10,20,.72);`,
    );
    e.innerHTML = list
      .map((b) => {
        const v = Math.max(0, Math.min(100, b.value));
        const col = v > 50 ? '#2ed573' : v > 20 ? '#feca57' : '#ff4757';
        return (
          `<div style="display:flex;align-items:center;gap:8px;margin:4px 0;font:${FONT.replace('{s}', size)};color:#fff">` +
          `<span style="width:${size * 1.4}px;text-align:center">${b.icon}</span>` +
          (b.label
            ? `<span style="width:${size * 4.6}px;font-size:${size * 0.8}px">${b.label}</span>`
            : '') +
          `<span style="flex:1;height:${size * 0.7}px;border-radius:99px;background:rgba(255,255,255,.18);overflow:hidden">` +
          `<span style="display:block;height:100%;width:${v}%;background:${col};border-radius:99px"></span></span>` +
          `<span style="width:${size * 2.4}px;text-align:right;font-size:${size * 0.8}px">${Math.round(v)}%</span></div>`
        );
      })
      .join('');
  },
  // ---------------------------------------------------------------- soldi
  money: 0,
  /** Il salvadanaio in basso, con i Dindini raccolti; ogni aumento lo fa saltare. */
  piggy(on = true) {
    if (!on) return kit.off('fx-piggy');
    const e = el(
      'fx-piggy',
      'left:50%;bottom:120px;display:flex;align-items:center;gap:10px;padding:8px 20px 8px 12px;border-radius:999px;background:rgba(10,10,20,.78);border:2px solid #feca57;',
    );
    let shown = kit.money,
      bumpAt = -99;
    kit.fx['fx-piggy'] = () => {
      if (shown < kit.money) {
        shown = Math.min(kit.money, shown + Math.max(1, Math.ceil((kit.money - shown) / 6)));
        bumpAt = kit.frame;
      } else if (shown > kit.money) shown = kit.money;
      const b = Math.max(0, 1 - (kit.frame - bumpAt) / 8);
      e.style.transform = `translateX(-50%) scale(${1 + 0.12 * b})`;
      e.innerHTML =
        `<span style="font-size:52px;line-height:1">🐷</span>` +
        `<span style="font:${FONT.replace('{s}', 42)};color:#feca57;text-shadow:0 3px 10px rgba(0,0,0,.6)">${shown.toLocaleString('it-IT')} Đ</span>`;
    };
    kit.fx['fx-piggy']();
  },
  /** Una moneta con "+N Đ" che vola dal centro al salvadanaio e si aggiunge ai soldi. */
  coin(amount, { from = [270, 420] } = {}) {
    const id = 'fx-coin-' + kit.frame + '-' + Math.random().toString(36).slice(2, 6);
    const e = el(
      id,
      'font:' +
        FONT.replace('{s}', 40) +
        ';color:#feca57;white-space:nowrap;text-shadow:0 3px 12px rgba(0,0,0,.8);',
    );
    e.textContent = `🪙 +${amount} Đ`;
    const start = kit.frame;
    const to = [270, 960 - 150];
    kit.fx[id] = () => {
      const k = (kit.frame - start) / 22;
      if (k >= 1) {
        kit.money += amount;
        return kit.off(id);
      }
      const x = from[0] + (to[0] - from[0]) * ease(k * 22, 22);
      const y = from[1] + (to[1] - from[1]) * k * k - Math.sin(k * Math.PI) * 120;
      e.style.left = x + 'px';
      e.style.top = y + 'px';
      e.style.transform = `translate(-50%,-50%) scale(${1.3 - 0.5 * k})`;
    };
    kit.fx[id]();
  },
  // ---------------------------------------------------------------- la mappa della città
  /** La città vista dall'alto: la casa al centro e le linee che crescono verso i posti. */
  cityMap(places) {
    const e = el('fx-map', 'inset:0;z-index:4950;background:rgba(8,12,24,.72);');
    const start = kit.frame;
    const home = [270, 470];
    kit.fx['fx-map'] = () => {
      const t = kit.frame - start;
      const lines = places
        .map((p, i) => {
          const k = ease(t - 8 - i * 6, 14);
          const x = home[0] + (p.x - home[0]) * k;
          const y = home[1] + (p.y - home[1]) * k;
          return `<line x1="${home[0]}" y1="${home[1]}" x2="${x}" y2="${y}" stroke="#feca57" stroke-width="5" stroke-dasharray="14 10" stroke-linecap="round"/>`;
        })
        .join('');
      const pins = places
        .map((p, i) => {
          const s = Math.max(0, pop(t - 18 - i * 6));
          return `<g transform="translate(${p.x} ${p.y}) scale(${s})"><circle r="44" fill="#1e2a44" stroke="#feca57" stroke-width="4"/><text y="16" text-anchor="middle" font-size="44">${p.icon}</text><text y="78" text-anchor="middle" font-size="26" font-weight="900" fill="#fff" font-family="Segoe UI, system-ui">${p.label}</text></g>`;
        })
        .join('');
      const hs = Math.max(0, pop(t));
      e.innerHTML =
        `<svg width="540" height="960" viewBox="0 0 540 960">${lines}` +
        `<g transform="translate(${home[0]} ${home[1]}) scale(${hs})"><circle r="56" fill="#2ed573" stroke="#fff" stroke-width="5"/><text y="20" text-anchor="middle" font-size="56">🏠</text></g>${pins}</svg>`;
    };
    kit.fx['fx-map']();
  },
  // ---------------------------------------------------------------- la roulette
  /** La ruota della roulette grande al centro; gira e si ferma sul numero `n`. */
  wheel(n = 7, { frames = 75 } = {}) {
    const e = el('fx-wheel', 'left:50%;top:300px;transform:translateX(-50%);');
    const cv = document.createElement('canvas');
    cv.width = cv.height = 760;
    cv.style.cssText = 'width:380px;height:380px;filter:drop-shadow(0 10px 24px rgba(0,0,0,.6))';
    e.replaceChildren(cv);
    const c = cv.getContext('2d');
    const start = kit.frame;
    kit.fx['fx-wheel'] = () => {
      const k = Math.min(1, (kit.frame - start) / frames);
      c.clearRect(0, 0, 760, 760);
      drawWheel(
        c,
        380,
        380,
        370,
        { phase: 'spin', since: BET_MS + k * SPIN_MS, n },
        (kit.frame - start) / 30,
      );
    };
    kit.fx['fx-wheel']();
  },
});

// ------------------------------------------------------------------ riquadri liberi
const { isoProject } = await import('/src/game/render/primitives.ts');
Object.assign(kit, {
  /**
   * Un riquadro con il suo HTML (infografiche, carte, linee del tempo). `css` lo posiziona (solo
   * la prima volta o quando cambia); `pop` lo fa entrare con un rimbalzo; `base` è la
   * trasformazione di partenza (per esempio translateX(-50%)).
   */
  panel(id, html, { css, pop = false, base = '' } = {}) {
    const e = el(id, '');
    if (css !== undefined && e.dataset.css !== css) {
      e.dataset.css = css;
      e.style.cssText = 'position:fixed;z-index:5000;pointer-events:none;' + css;
    }
    if (e.dataset.html !== html) {
      e.dataset.html = html;
      e.innerHTML = html;
    }
    if (pop) {
      const start = kit.frame;
      kit.fx[id] = () => {
        e.style.transform = `${base} scale(${Math.max(0, kit.popAt(kit.frame - start))})`;
      };
      kit.fx[id]();
    } else if (base) e.style.transform = base;
    return e;
  },
  /** L'orologio grande in un angolo. */
  clock(text, { top = 16, right = 16, size = 46 } = {}) {
    kit.panel(
      'fx-clock',
      `<span style="font:${FONT.replace('{s}', size)};color:#fff;letter-spacing:2px">${text}</span>`,
      {
        css: `top:${top}px;right:${right}px;padding:6px 16px;border-radius:16px;background:rgba(10,10,20,.75);border:2px solid #feca57;`,
      },
    );
  },
  /** Dove si vede sullo schermo (in pixel della finestra) un punto del gioco. */
  screenOf(x, y, z = 0) {
    const p = isoProject(x, y, z);
    const r = game.view.canvas.getBoundingClientRect();
    return {
      x: r.left + (p.x * r.width) / game.view.canvas.width,
      y: r.top + (p.y * r.height) / game.view.canvas.height,
    };
  },
  /** Un dito (o un'altra emoji) sopra un punto del gioco: segue il mobile che si sposta. */
  pointAt(x, y, emoji = '👆', z = 30) {
    const s = kit.screenOf(x, y, z);
    kit.panel(
      'fx-finger',
      `<span style="font-size:58px;filter:drop-shadow(0 4px 8px rgba(0,0,0,.6))">${emoji}</span>`,
      {
        css: '',
      },
    ).style.cssText =
      `position:fixed;z-index:5000;pointer-events:none;left:${s.x - 20}px;top:${s.y + 10}px;`;
  },
});
const popFn = pop;
kit.popAt = popFn;

// la mappa dei mobili della stanza (per seguire con il dito quello che si sposta)
const world = await import('/src/game/world.ts');
kit.map = () => world.getCurrentFurnitureMap();
