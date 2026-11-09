// Mercato dell'erba: l'azienda Canapa Verde in borsa, le attività che la muovono (erba comprata
// e scambiata, raccolti), il registro degli scambi d'erba e il prezzo pubblicato dal server.
// Ogni modifica è ripetibile: rigenerando le regole non si aggiunge niente due volte.
export function withWeedMarketRules(r, player) {
  const me = "root.child('sims_accounts').child(auth.uid).child('playerId').val()";

  // la quotazione della nuova azienda
  const quote = r.sims_market.quotes.$asset;
  if (!quote['.validate'].includes("'canapa'"))
    quote['.validate'] = quote['.validate'].replace(
      "$asset === 'space'",
      "$asset === 'space' || $asset === 'canapa'",
    );

  // le attività: domanda (canapa) e offerta (raccolto)
  const activity = r.sims_activity.$day.$biz.$pid;
  if (!activity['.validate'].includes('canapa'))
    activity['.validate'] = activity['.validate'].replace('|space)', '|space|canapa|raccolto)');

  // le quote nella cassaforte, come quelle delle altre aziende
  const room = r.sims_rooms_state.$room;
  room.economy.invest.canapa = structuredClone(room.economy.invest.space);
  for (const field of ['units', 'cost']) {
    const anchor = `newData.child('economy/invest/space/${field}').val() === data.child('economy/invest/space/${field}').val()`;
    const guard = anchor.replaceAll('/space/', '/canapa/');
    if (!room['.validate'].includes(guard)) {
      if (!room['.validate'].includes(anchor))
        throw new Error('regola degli investimenti cambiata');
      room['.validate'] = room['.validate'].replace(anchor, `${anchor} && ${guard}`);
    }
  }

  // gli scambi d'erba accettati: li scrive chi compra, una volta sola, con l'ora del server
  r.sims_weed_trades = {
    $day: {
      $offer: {
        '.write': `${player} && !data.exists() && newData.child('buyer').val() === ${me}`,
        '.validate':
          "$day.matches(/^[0-9]{5,6}$/) && newData.hasChildren(['g','price','seller','buyer','t'])",
        g: {
          '.validate':
            'newData.isNumber() && newData.val() >= 1 && newData.val() <= 100000 && newData.val() % 1 === 0',
        },
        price: {
          '.validate':
            'newData.isNumber() && newData.val() >= 0 && newData.val() <= 1000000 && newData.val() % 1 === 0',
        },
        seller: {
          '.validate':
            'newData.isString() && newData.val().length > 0 && newData.val().length <= 128',
        },
        buyer: { '.validate': 'newData.isString()' },
        t: {
          '.validate':
            'newData.isNumber() && newData.val() <= now + 60000 && newData.val() >= now - 600000',
        },
        $other: { '.validate': false },
      },
    },
  };

  // il prezzo calcolato dal server: lo leggono tutti i giocatori
  r.sims_weed_market = { '.read': player };
}
