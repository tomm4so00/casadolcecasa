import { describe, expect, it } from 'vitest';
import {
  exitMenuButton,
  pickAction,
  plainLabel,
  quotedActions,
  wantsBackpack,
} from '../src/game/guide-rules';

describe('la freccetta sui pulsanti delle missioni', () => {
  it('prende le azioni tra «…» dal passo', () => {
    expect(quotedActions('🧊 Apri il frigorifero, poi premi «Prendi Cibo» (5 Đ).')).toEqual([
      'Prendi Cibo',
    ]);
    expect(
      quotedActions('Avvicinati all’uscita (il tappetino «ESCI DI CASA») e scegli «Lavoro».'),
    ).toEqual(['ESCI DI CASA', 'Lavoro']);
    expect(quotedActions('niente da toccare')).toEqual([]);
  });

  it('trova il pulsante giusto, prima per nome intero', () => {
    expect(plainLabel('💼 Lavoro')).toBe('lavoro');
    const exitMenu = [
      '🎉 Attività ricreative',
      '🏬 Centro Commerciale',
      '💼 Lavoro',
      '⚰️ Cimitero',
    ];
    expect(pickAction(exitMenu, ['ESCI DI CASA', 'Lavoro'])).toBe(2);
    expect(pickAction(['▶️ Continua Lavoro', '🔄 Cambia Lavoro', 'Chiudi'], ['Lavoro'])).toBe(0);
    expect(pickAction(['🎁 Regala', '🍝 Mangia'], ['Regala'])).toBe(0);
    // "Lavoro" non deve accendere "Lavoratore"
    expect(pickAction(['Lavoratore'], ['Lavoro'])).toBe(-1);
  });

  it('lo zaino: quando il passo dice di aprirlo', () => {
    expect(
      wantsBackpack(
        '🍝 Sei nella stanza di Ada: apri lo zaino 🎒, tocca «Regala» e lascia l’assaggio qui.',
      ),
    ).toBe(true);
    expect(wantsBackpack('🙂 Avvicinati a Gino, apri lo zaino 🎒 e tocca «Regala».')).toBe(true);
    // ancora per strada: niente freccetta sullo zaino
    expect(
      wantsBackpack(
        '🧑 Porta l’assaggio a Ada: è nel cortile. Vicino a lui apri lo zaino 🎒 e tocca «Regala».',
      ),
    ).toBe(false);
    expect(wantsBackpack('🔥 Ora vai al fornello e premi «Cucina»')).toBe(false);
  });

  it('nel menu dell’uscita: il pulsante verso il posto della missione', () => {
    expect(exitMenuButton('negozio_mobili', '')).toBe('btn-act-mall');
    expect(exitMenuButton('banca', '')).toBe('btn-act-bank');
    expect(exitMenuButton('bar', '')).toBe('btn-act-fun');
    expect(exitMenuButton('bar', 'fun')).toBe('btn-act-bar');
    expect(exitMenuButton('banca', 'fun')).toBe('btn-act-back');
    expect(exitMenuButton('lavoro_ufficio', '')).toBe('btn-act-work');
    expect(exitMenuButton('SALOON', '')).toBeNull();
  });
});
