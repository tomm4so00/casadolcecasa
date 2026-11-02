// Protegge anche il salvataggio locale da due schede dello stesso browser.
export async function lockCharacter(owner: string): Promise<() => void> {
  if (!navigator.locks)
    throw new Error(
      'Questo browser non supporta il blocco tra schede. Usa un browser aggiornato su HTTPS o localhost.',
    );
  return new Promise((resolve, reject) => {
    void navigator.locks
      .request(`casadolcecasa.${owner}`, { ifAvailable: true }, async (lock) => {
        if (!lock) {
          reject(new Error('Il personaggio è già aperto in un’altra scheda di questo browser.'));
          return;
        }
        await new Promise<void>((release) => resolve(release));
      })
      .catch(reject);
  });
}
