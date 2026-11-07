// Cimitero: tombe, lapide commemorativa ed epitaffi dei giocatori scomparsi.
import { spendMoney } from '../economy.js';
import { type GameValue, game } from '../context.js';
import { isoProject, isoScale } from './primitives.js';
import { saveGame } from '../saves.js';
import { nameHash } from './scenes.js';
import { fmtDuration, toast } from '../missions.js';
import { openDialog } from '../interface.js';
import { box, onFace } from './objects.js';
import { worldNode } from '../world-db.js';

// ---- Cimitero: lapidi dei giocatori deceduti
export function drawGraveProp(it?: GameValue): GameValue {
  const ctx = game.view.ctx;
  const flowers: GameValue = isoScale();
  box(it.x, it.y + 9, 18, 14, 3, '#6b4f3a', { edge: 'rgba(0,0,0,0.2)' });
  const FL: GameValue = ['#ff6b81', '#feca57', '#ffffff', '#a29bfe', '#ff9ff3']; // un fiore per ogni persona che l'ha visitata
  for (let i: GameValue = 0, n: GameValue = Math.min(10, it.visitors || 0); i < n; i++) {
    const q: GameValue = isoProject(it.x - 7 + (i % 5) * 3.5, it.y + 9 + (i < 5 ? 3 : 8), 6);
    ctx.fillStyle = '#2e7d32';
    ctx.fillRect(q.x - 0.5, q.y, 1, 3 * flowers);
    ctx.fillStyle = FL[i % FL.length];
    ctx.beginPath();
    ctx.arc(q.x, q.y, 2 * flowers, 0, 6.3);
    ctx.fill();
  }
  box(it.x, it.y, 22, 6, 4, '#7f8c8d');
  if (it.style === 1) {
    // croce
    box(it.x, it.y, 5, 4, 34, '#b2bec3', { z0: 4 });
    box(it.x, it.y, 18, 4, 5, '#b2bec3', { z0: 20 });
  } else {
    const wide: GameValue = it.style === 2;
    const st: GameValue = box(it.x, it.y, wide ? 20 : 16, 5, wide ? 22 : 28, '#b2bec3', { z0: 4 });
    box(it.x, it.y, wide ? 18 : 14, 5, 3, '#cfd8dc', { z0: wide ? 26 : 32 });
    onFace(st, 'left', (W?: GameValue, H?: GameValue): GameValue => {
      ctx.fillStyle = '#4b5558';
      ctx.textAlign = 'center';
      ctx.font = 'bold 5px serif';
      ctx.fillText('R.I.P', W / 2, H * 0.34);
      ctx.fillRect(W / 2 - 0.6, H * 0.5, 1.2, H * 0.3);
      ctx.fillRect(W / 2 - 2, H * 0.58, 4, 1.1);
    });
  }
}

export function drawMemorialProp(it?: GameValue): GameValue {
  const ctx = game.view.ctx;
  box(it.x, it.y, 46, 16, 5, '#636e72');
  const st: GameValue = box(it.x, it.y, 38, 12, 44, '#2d3436', { z0: 5, top: '#4b5558' });
  onFace(st, 'left', (W?: GameValue, H?: GameValue): GameValue => {
    ctx.fillStyle = '#dfe6e9';
    ctx.textAlign = 'center';
    ctx.font = 'bold 6px serif';
    ctx.fillText('IN MEMORIA', W / 2, H * 0.3);
    ctx.font = '5px serif';
    ctx.fillText("di chi non ce l'ha fatta", W / 2, H * 0.48);
    ctx.fillRect(W / 2 - 0.7, H * 0.58, 1.4, H * 0.28);
    ctx.fillRect(W / 2 - 3, H * 0.66, 6, 1.3);
  });
}

export function rebuildGraveyard(val?: GameValue): GameValue {
  game.graveList = Object.keys(val || {})
    .map((id?: GameValue): GameValue => Object.assign({ id }, val[id]))
    .filter((g?: GameValue): GameValue => g && g.name)
    .sort((a?: GameValue, b?: GameValue): GameValue => (b.deadAt || 0) - (a.deadAt || 0));
  const cols: GameValue = [-150, -110, -70, 70, 110, 150],
    rows: GameValue = [40, 0, -40, -80, -120];
  const props: GameValue = [
    {
      kind: 'memorial',
      x: 0,
      y: -138,
      w: 46,
      h: 16,
      z: 62,
      label: '📜 Registro dei defunti',
      who: 'registro',
      name: 'Registro',
    },
    { kind: 'tree', x: -168, y: -146, w: 16, h: 16, size: 1.1, z: 90 },
    { kind: 'tree', x: 168, y: -146, w: 16, h: 16, size: 1, z: 85 },
    { kind: 'streetlamp', x: -35, y: 105, w: 8, h: 8 },
    { kind: 'streetlamp', x: 35, y: 105, w: 8, h: 8 },
    { kind: 'bench', x: -110, y: 108, w: 50, h: 16 },
    { kind: 'bench', x: 110, y: 108, w: 50, h: 16 },
  ];
  game.graveMap = { memorial: props[0] };
  game.graveList
    .slice(0, cols.length * rows.length)
    .forEach((g?: GameValue, i?: GameValue): GameValue => {
      const d: GameValue = g.deadAt ? new Date(g.deadAt).toLocaleDateString('it-IT') : '';
      const o: GameValue = {
        kind: 'grave',
        x: cols[i % cols.length],
        y: rows[Math.floor(i / cols.length)],
        w: 22,
        h: 8,
        z: 40,
        style: nameHash(g.id || g.name) % 3,
        label: '⚰️ ' + g.name,
        who: g.name,
        name: g.name,
        days: g.days,
        deadAt: g.deadAt,
        date: d,
        id: g.id,
        lived: g.lived,
        epitaph: g.epitaph || '',
        visitors: Object.keys(g.visitors || {}).length,
        hasVisited: !!(g.visitors && g.visitors[game.session.myPlayerId]),
      };
      props.push(o);
      game.graveMap['grave_' + i] = o;
    });
  game.ENV_PROPS.CIMITERO = props;
  if (game.view.activeEnvironment === 'CIMITERO')
    game.view.currentRoomTitle = `Cimitero ⚰️ (${game.graveList.length} ${game.graveList.length === 1 ? 'lapide' : 'lapidi'})`;
}

export async function showGraveInfo(item?: GameValue): Promise<GameValue> {
  if (item.kind === 'memorial') {
    const lines: GameValue = game.graveList
      .slice(0, 40)
      .map(
        (g?: GameValue): GameValue =>
          `⚰️ ${g.name} — ${typeof g.lived === 'number' ? fmtDuration(g.lived) : 'giorno ' + (g.days || '?')}${g.deadAt ? ' · ' + new Date(g.deadAt).toLocaleDateString('it-IT') : ''}`,
      );
    openDialog({
      title: `📜 Registro dei defunti (${game.graveList.length})`,
      text: lines.join('\n') || 'Nessuno è ancora morto. Prenditi cura del tuo personaggio!',
      buttons: [{ label: 'Chiudi', value: null, color: '#57606f' }],
    });
    return;
  }
  const lived: GameValue =
    typeof item.lived === 'number'
      ? `Ha vissuto ${fmtDuration(item.lived)}.`
      : `Ha vissuto fino al giorno ${item.days || '?'}.`;
  const text: GameValue =
    (item.epitaph ? `« ${item.epitaph} »\n\n` : 'Riposa in pace.\n\n') +
    lived +
    (item.date ? `\nÈ morto il ${item.date}.` : '') +
    (item.visitors
      ? `\n\n💐 ${item.visitors} ${item.visitors === 1 ? 'persona ha lasciato' : 'persone hanno lasciato'} dei fiori.`
      : '');
  const buttons: GameValue = [{ label: 'Chiudi', value: null, color: '#57606f' }];
  if (!item.hasVisited)
    buttons.push({ label: '💐 Lascia dei fiori (5 €)', value: 'flowers', color: '#e84393' });
  const res: GameValue = await openDialog({ title: `⚰️ ${item.who}`, text, buttons });
  if (res.action === 'flowers') {
    if (game.moneyLevel < 5) {
      toast('Non hai abbastanza soldi: servono 5 € in cassaforte.');
      return;
    }
    if (!(await spendMoney(5))) return;
    try {
      game.session.db
        .ref(`${worldNode('graveyard')}/${item.id}/visitors/${game.session.myPlayerId}`)
        .set(game.player.myData.nick);
    } catch (e: GameValue) {}
    toast(`💐 Hai lasciato dei fiori per ${item.who}`);
  }
}

export async function openEpitaph(..._args: GameValue[]): Promise<GameValue> {
  const res: GameValue = await openDialog({
    title: '⚰️ Il tuo epitaffio',
    text:
      'Cosa vuoi che sia scritto sulla tua lapide, quando morirai? Gli altri giocatori potranno leggerlo.' +
      (game.player.epitaph ? `\n\nAttuale: « ${game.player.epitaph} »` : ''),
    input: { placeholder: 'Es. «Ho sempre avuto fame»', maxLength: 60 },
    buttons: [
      { label: 'Annulla', value: null, color: '#57606f' },
      { label: 'Salva', value: 'ok', color: '#2ed573' },
    ],
  });
  if (res.action === 'ok') {
    game.player.epitaph = res.value.slice(0, 60);
    saveGame(true);
    toast(game.player.epitaph ? '⚰️ Epitaffio salvato' : '⚰️ Epitaffio rimosso');
  }
}
