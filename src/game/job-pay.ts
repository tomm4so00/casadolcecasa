// Regole della paga dei turni di lavoro (senza dipendenze dal browser, così sono testabili).

// Livelli di carriera: paga base del turno ed euro extra per ogni oggetto consegnato.
// `from` è il numero del turno (1 = primo turno) da cui vale il livello.
export const JOB_PAY_TIERS = [
  { from: 1, base: 50, perItem: 1 },
  { from: 31, base: 80, perItem: 2 },
  { from: 61, base: 120, perItem: 3 },
] as const;

export function jobPayTier(turn: number) {
  return [...JOB_PAY_TIERS].reverse().find((tier) => turn >= tier.from) ?? JOB_PAY_TIERS[0];
}

// Spiega quanti turni mancano al prossimo aumento, dopo averne completati `done`.
export function nextPayMessage(done: number): string {
  const nextTurn = done + 1;
  const next = JOB_PAY_TIERS.find((tier) => tier.from > nextTurn);
  const current = jobPayTier(nextTurn);
  const now =
    current.from === nextTurn && nextTurn > 1
      ? `🎉 Dal prossimo turno guadagni ${current.base} € + ${current.perItem} € per oggetto!\n\n`
      : '';
  if (!next) {
    return (
      now +
      `🏆 Hai raggiunto la paga massima: ${current.base} € a turno + ${current.perItem} € per ogni oggetto consegnato.`
    );
  }
  const missing = next.from - nextTurn;
  return (
    now +
    `📈 Ancora ${missing} ${missing === 1 ? 'turno' : 'turni'} in questo lavoro e passi a ` +
    `${next.base} € a turno + ${next.perItem} € per ogni oggetto consegnato ` +
    `(ora: ${current.base} € + ${current.perItem} € per oggetto).`
  );
}
