// Regole della banca (senza dipendenze dal browser, così sono testabili).

/** Importo minimo di ogni deposito. */
export const BANK_MIN_DEPOSIT = 1000;
/** Soldi che devono restare in cassaforte dopo un deposito. */
export const VAULT_MIN_AFTER_DEPOSIT = 1000;

/** Saldo del conto salvato nella stanza; un valore assente o non valido vale 0. */
export function bankBalanceOf(value: unknown): number {
  return Number.isSafeInteger(value) && (value as number) >= 0 ? (value as number) : 0;
}

/** Il massimo depositabile ora (0 se la cassaforte non basta per un deposito). */
export function maxDeposit(vault: number): number {
  const max = vault - VAULT_MIN_AFTER_DEPOSIT;
  return max >= BANK_MIN_DEPOSIT ? max : 0;
}

/** Spiega perché un deposito non è possibile, oppure null se va bene. */
export function depositError(amount: number, vault: number): string | null {
  if (!Number.isSafeInteger(amount) || amount <= 0) return 'Inserisci un importo valido in euro.';
  if (amount < BANK_MIN_DEPOSIT) return `Il deposito minimo è di ${BANK_MIN_DEPOSIT} €.`;
  if (vault - amount < VAULT_MIN_AFTER_DEPOSIT)
    return `In cassaforte devono restare almeno ${VAULT_MIN_AFTER_DEPOSIT} €: puoi depositare al massimo ${Math.max(0, vault - VAULT_MIN_AFTER_DEPOSIT)} €.`;
  return null;
}

/** Spiega perché un prelievo non è possibile, oppure null se va bene. */
export function withdrawError(amount: number, bank: number): string | null {
  if (!Number.isSafeInteger(amount) || amount <= 0) return 'Inserisci un importo valido in euro.';
  if (amount > bank) return `Sul conto hai solo ${bank} €.`;
  return null;
}

/** Variazione da applicare all'economia della stanza per un deposito (null = rifiutato). */
export function depositChange(amount: number) {
  return (economy: { bank?: number }, vault: number): number | null => {
    if (depositError(amount, vault)) return null;
    economy.bank = bankBalanceOf(economy.bank) + amount;
    return -amount;
  };
}

/** Variazione da applicare all'economia della stanza per un prelievo (null = rifiutato). */
export function withdrawChange(amount: number) {
  return (economy: { bank?: number }): number | null => {
    const bank = bankBalanceOf(economy.bank);
    if (withdrawError(amount, bank)) return null;
    economy.bank = bank - amount;
    return amount;
  };
}
