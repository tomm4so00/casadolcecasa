// Lo scambio modifica insieme lo zaino e la cassaforte di entrambi i giocatori.
export function withInventoryRules(room) {
  const me = "root.child('sims_accounts').child(auth.uid).child('playerId').val()";
  const owner = `data.parent().child('ownerId').val() === ${me}`;
  const offerFields = ['id', 'item', 'quantity', 'price', 'buyer', 'buyerRoom', 'expiresAt'];
  const same = (path) => `newData.child('${path}').val() === data.child('${path}').val()`;
  const unchanged = [
    'items/weed',
    'items/drug',
    'harvestedAt',
    'offer/status',
    ...offerFields.map((k) => `offer/${k}`),
  ]
    .map(same)
    .join(' && ');
  const immutable = ['harvestedAt', ...offerFields.map((k) => `offer/${k}`)].map(same).join(' && ');
  const offer = (k) => `data.child('offer/${k}').val()`;
  const buyer = (fresh, path) =>
    `${fresh ? 'newData' : 'data'}.parent().parent().child(${offer('buyerRoom')} + '').child('${path}').val()`;
  const accepted = [
    "newData.child('offer/status').val() === 'accepted'",
    same('items/weed'),
    same('items/drug'),
    `newData.parent().child('vaultMoney').val() === data.parent().child('vaultMoney').val() + ${offer('price')}`,
    `${buyer(true, 'ownerId')} === ${me}`,
    `${buyer(true, 'vaultMoney')} === ${buyer(false, 'vaultMoney')} - ${offer('price')}`,
    `newData.parent().parent().child(${offer('buyerRoom')} + '').child('inventory/items').child(${offer('item')}).val() === data.parent().parent().child(${offer('buyerRoom')} + '').child('inventory/items').child(${offer('item')}).val() + ${offer('quantity')}`,
  ].join(' && ');
  const refused = [
    "newData.child('offer/status').val() === 'refused'",
    ...['weed', 'drug'].map(
      (id) =>
        `newData.child('items/${id}').val() === data.child('items/${id}').val() + (${offer('item')} === '${id}' ? ${offer('quantity')} : 0)`,
    ),
    "newData.parent().child('vaultMoney').val() === data.parent().child('vaultMoney').val()",
  ].join(' && ');
  const reply = `data.child('offer/status').val() === 'pending' && ${offer('buyer')} === ${me} && ${offer('expiresAt')} > now && ${immutable} && ((${accepted}) || (${refused}))`;
  const count =
    'newData.isNumber() && newData.val() >= 0 && newData.val() <= 100000 && newData.val() % 1 === 0';
  room.inventory = {
    '.validate': `newData.hasChildren(['items']) && (${owner} || (${unchanged}) || (${reply}))`,
    items: {
      '.validate': "newData.hasChildren(['weed','drug'])",
      weed: { '.validate': count },
      drug: { '.validate': count },
      $other: { '.validate': false },
    },
    harvestedAt: { '.validate': 'newData.isNumber() && newData.val() > 0' },
    offer: {
      '.validate':
        "newData.hasChildren(['id','item','quantity','price','buyer','buyerRoom','expiresAt','status'])",
      id: {
        '.validate': 'newData.isString() && newData.val().length > 0 && newData.val().length <= 80',
      },
      item: { '.validate': "newData.val() === 'weed' || newData.val() === 'drug'" },
      quantity: { '.validate': count + ' && newData.val() > 0' },
      price: {
        '.validate':
          'newData.isNumber() && newData.val() >= 0 && newData.val() <= 1000000 && newData.val() % 1 === 0',
      },
      buyer: {
        '.validate':
          'newData.isString() && newData.val().length > 0 && newData.val().length <= 128',
      },
      buyerRoom: {
        '.validate':
          'newData.isNumber() && newData.val() >= 0 && newData.val() < 64 && newData.val() % 1 === 0',
      },
      expiresAt: { '.validate': 'newData.isNumber() && newData.val() > 0' },
      status: {
        '.validate':
          "newData.val() === 'pending' || newData.val() === 'accepted' || newData.val() === 'refused' || newData.val() === 'cancelled'",
      },
      $other: { '.validate': false },
    },
    $other: { '.validate': false },
  };
  // La validazione dei figli non vede le cancellazioni: protegge lo zaino anche sul padre.
  const guard = `((auth != null && auth.uid === 'market-publisher') || data.child('ownerId').val() === ${me} || !data.child('inventory').exists() || newData.child('inventory').exists())`;
  if (!room['.validate'].includes(guard)) room['.validate'] += ` && ${guard}`;
}
