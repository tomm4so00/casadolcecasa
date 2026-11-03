import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import {
  USERNAME_DOMAIN,
  authErrorMessage,
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

  it('errori di Firebase spiegati in italiano', () => {
    expect(authErrorMessage('auth/email-already-in-use')).toContain('già preso');
    expect(authErrorMessage('auth/invalid-credential')).toContain('sbagliati');
    expect(authErrorMessage('auth/credential-already-in-use')).toContain('Google');
    expect(authErrorMessage('auth/qualcosa')).toContain('auth/qualcosa');
  });

  it('le regole del database accettano Google e, solo per gli indirizzi del gioco, la password', () => {
    const rules = fs.readFileSync('firebase/database.rules.proposed.json', 'utf8');
    const google = rules.split("sign_in_provider === 'google.com'").length - 1;
    const password =
      rules.split(
        `sign_in_provider === 'password' && auth.token.email.endsWith('@${USERNAME_DOMAIN}')`,
      ).length - 1;
    expect(google).toBeGreaterThan(0);
    expect(password).toBe(google);
    // nessuna password senza il controllo dell'indirizzo
    expect(rules.split("sign_in_provider === 'password'").length - 1).toBe(password);
  });
});
