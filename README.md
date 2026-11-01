# Casa Dolce Casa

Gioco isometrico in stile Sims, multiplayer in tempo reale tramite Firebase. HTML + Canvas 2D + JavaScript (moduli ES), nessuna fase di build.

## Avvio

Il gioco usa i moduli ES (`<script type="module">`), quindi **non funziona aprendo `index.html` con doppio clic** (`file://`). Serve un piccolo server locale, ad esempio:

- VS Code: estensione **Live Server** → "Open with Live Server" su `index.html`
- oppure `npx serve .` / `python -m http.server`

Su GitHub Pages funziona così com'è.

Per il multiplayer inserisci i dati del tuo progetto in [js/firebase-config.js](js/firebase-config.js). Finché ci sono i valori segnaposto il gioco parte in modalità offline.

## Struttura

```
index.html              markup: canvas, HUD, popup, modali
css/style.css           tutti gli stili
js/
  main.js               punto d'ingresso + game loop (update → render)
  config.js             costanti di bilanciamento (velocità, limiti, distanze)
  firebase-config.js    credenziali Firebase
  state.js              UNICO stato mutabile del gioco
  data/                 contenuti (solo dati, nessuna logica)
    environments.js     stanze e oggetti con posizione, colori, tipo
    activities.js       attività fuori casa ed effetti sui bisogni
    needs.js            bisogni mostrati nell'HUD
  game/                 regole del gioco
    interactions.js     cosa fa ogni tipo di oggetto (registro HANDLERS)
    world.js            movimento, cambio stanza, attività
    furniture.js        modalità "sposta mobile"
  engine/               infrastruttura generica
    canvas.js, loop.js, input.js (tastiera + joystick), iso.js (disegno isometrico)
  render/               disegno della scena e dell'avatar
  ui/                   HUD, popup azioni, modali, schermata iniziale, notifiche
  net/multiplayer.js    sincronizzazione Firebase
```

Regola generale: **i dati stanno in `data/`, la logica in `game/`, il DOM in `ui/`, il disegno in `render/`**. Lo stato vive solo in `state.js`; UI e rendering lo leggono a ogni frame.

## Modifiche comuni

**Aggiungere un mobile a una stanza** → aggiungi un oggetto in `objects` dell'ambiente in [js/data/environments.js](js/data/environments.js). Con `moveable: true` diventa spostabile.

**Farlo diventare interattivo** → dagli un `type` (es. `'tv'`) e aggiungi un handler con lo stesso nome in `HANDLERS` di [js/game/interactions.js](js/game/interactions.js):

```js
tv: (obj) => [
  action(`📺 Guarda ${obj.name}`, () => {
    changeNeed('happiness', 10);
    notify('Che bel film!');
  }),
],
```

**Aggiungere una stanza** → nuova voce in `ENVIRONMENTS` + una porta `door('Nome', 'NUOVO_ID', x, y, w, h)` nel salone.

**Aggiungere un'attività fuori casa** → una riga in [js/data/activities.js](js/data/activities.js); pulsante, etichetta ed effetti vengono generati in automatico.

**Aggiungere un bisogno** → una riga in [js/data/needs.js](js/data/needs.js); la barra nell'HUD compare da sola.

**Cambiare velocità, distanze, ecc.** → [js/config.js](js/config.js).

## Da fare

- Consumo dei bisogni nel tempo (le velocità sono già in `NEEDS_DEPLETION_SEC` in `config.js`)
- Mobili separati per ognuna delle 8 stanze (ora le stanze condividono gli stessi mobili; `state.roomIdx` indica già in quale ci si trova)
- Assegnazione delle stanze ai giocatori (`state.rooms`)
