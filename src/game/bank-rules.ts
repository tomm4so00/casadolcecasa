// Regole della banca (senza dipendenze dal browser, così sono testabili).

/** Importo minimo di ogni deposito. */
export const BANK_MIN_DEPOSIT = 1000;

/** Saldo del conto salvato nella stanza; un valore assente o non valido vale 0. */
export function bankBalanceOf(value: unknown): number {
  return Number.isSafeInteger(value) && (value as number) >= 0 ? (value as number) : 0;
}

/** Il massimo depositabile ora (0 se la cassaforte non basta per un deposito). */
export function maxDeposit(vault: number): number {
  return vault >= BANK_MIN_DEPOSIT ? vault : 0;
}

/** Spiega perché un deposito non è possibile, oppure null se va bene. */
export function depositError(amount: number, vault: number): string | null {
  if (!Number.isSafeInteger(amount) || amount <= 0)
    return 'Inserisci un importo valido in dindini.';
  if (amount < BANK_MIN_DEPOSIT) return `Il deposito minimo è di ${BANK_MIN_DEPOSIT} Đ.`;
  if (amount > vault) return `In cassaforte hai solo ${vault} Đ.`;
  return null;
}

/** Spiega perché un prelievo non è possibile, oppure null se va bene. */
export function withdrawError(amount: number, bank: number): string | null {
  if (!Number.isSafeInteger(amount) || amount <= 0)
    return 'Inserisci un importo valido in dindini.';
  if (amount > bank) return `Sul conto hai solo ${bank} Đ.`;
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
