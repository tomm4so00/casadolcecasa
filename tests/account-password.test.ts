import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import {
  USERNAME_DOMAIN,
  authErrorMessage,
  emailError,
  emailKey,
  isLegacyEmail,
  normalizeUsername,
  passwordError,
  usernameEmail,
  usernameError,
  usernameFromEmail,
} from '../src/game/account-model';

describe('accesso con nome giocatore e password', () => {
  it('nomi validi e non validi', () => {
    for (const ok of ['mario', 'Mario_88', 'anna.b', 'x-y', 'abc', 'a'.repeat(20)])
      expect(usernameError(ok), ok).toBeNull();
    for (const bad of ['', '  ', 'ab', 'a'.repeat(21), 'mario rossi', 'niccolò', 'a@b', 'ciao!'])
      expect(usernameError(bad), bad).not.toBeNull();
  });

  it('maiuscole e spazi ai lati non contano', () => {
    expect(normalizeUsername('  Mario_88 ')).toBe('mario_88');
    expect(usernameEmail('Mario')).toBe(usernameEmail('mario'));
    expect(usernameEmail('Mario')).toBe('mario@' + USERNAME_DOMAIN);
  });

  it('dal indirizzo interno si ritrova il nome; gli account Google non ne hanno', () => {
    expect(usernameFromEmail(usernameEmail('anna.b'))).toBe('anna.b');
    expect(usernameFromEmail('anna@gmail.com')).toBeNull();
    expect(usernameFromEmail(null)).toBeNull();
  });

  it('password: almeno 6 caratteri', () => {
    expect(passwordError('12345')).not.toBeNull();
    expect(passwordError('123456')).toBeNull();
    expect(passwordError('x'.repeat(65))).not.toBeNull();
  });

  it("l'email: valida, senza + e non l'indirizzo interno del gioco", () => {
    for (const ok of ['mario@gmail.com', ' Anna.B@libero.it ', 'x@y.co'])
      expect(emailError(ok), ok).toBeNull();
    for (const bad of [
      '',
      'mario',
      'mario@',
      'mario@gmail',
      'a b@c.it',
      'mario+1@gmail.com',
      'anna@' + USERNAME_DOMAIN,
    ])
      expect(emailError(bad), bad).not.toBeNull();
  });

  it('le varianti della stessa casella contano come una sola email', () => {
    expect(emailKey('M.ario@Gmail.com')).toBe(emailKey('mario@gmail.com'));
    expect(emailKey(' mario@gmail.com ')).toBe('mario@gmailcom');
    expect(emailKey('anna@libero.it')).not.toBe(emailKey('mario@libero.it'));
  });

  it('riconosce gli account di prima, senza email vera', () => {
    expect(isLegacyEmail(usernameEmail('mario'))).toBe(true);
    expect(isLegacyEmail('mario@gmail.com')).toBe(false);
    expect(isLegacyEmail(null)).toBe(false);
  });

  it('errori di Firebase spiegati in italiano', () => {
    expect(authErrorMessage('auth/email-already-in-use')).toContain(
      'già un account con questa email',
    );
    expect(authErrorMessage('auth/invalid-credential')).toContain('sbagliate');
    expect(authErrorMessage('auth/credential-already-in-use')).toContain('Google');
    expect(authErrorMessage('auth/qualcosa')).toContain('auth/qualcosa');
  });

  it("le regole del database accettano Google e la password solo con l'email confermata", () => {
    const text = fs.readFileSync('firebase/database.rules.proposed.json', 'utf8');
    const google = text.split("sign_in_provider === 'google.com'").length - 1;
    const verified =
      text.split("sign_in_provider === 'password' && auth.token.email_verified === true").length -
      1;
    expect(google).toBeGreaterThan(0);
    expect(verified).toBeGreaterThanOrEqual(google);
    // gli indirizzi interni del gioco non bastano più
    expect(text).not.toContain(USERNAME_DOMAIN);
    const rules = JSON.parse(text).rules;
    // ogni casella vale un solo account, calcolata come emailKey
    const claim = rules.sims_emails.$key['.write'];
    expect(claim).toContain("$key === auth.token.email.toLowerCase().replace('.', '')");
    expect(claim).toContain('!data.exists()');
    expect(claim).toContain("!auth.token.email.contains('+')");
    // il personaggio di un account con password nasce solo dopo aver occupato la casella
    expect(rules.sims_accounts.$uid['.write']).toContain("root.child('sims_emails')");
  });
});
