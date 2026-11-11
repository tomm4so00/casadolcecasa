import { describe, expect, it } from 'vitest';
import { filterNotice, filterText, maskText } from '../shared/text-filter-rules';

describe('filtro dei testi', () => {
  it('lascia passare parolacce, bestemmie e chiacchiere normali', () => {
    for (const ok of [
      'che cazzo fai, vaffanculo',
      'porca miseria, mannaggia',
      'ti do 1.000.000 Đ per il quadro',
      'offro 250000',
      'un negroni al bar?',
      'sono stato in Mongolia',
      'scusate, sono in ritardo',
      'l’ho visto su instagram',
      'ciao a tutti! come va?',
      'Nemo',
      'Tramonto sul mare',
      'la sbornia di ieri',
      'il canale del porto',
    ])
      expect(filterText(ok)).toEqual({ text: ok, problems: [] });
  });

  it('copre gli insulti d’odio', () => {
    expect(maskText('sei un negro')).toBe('sei un ***');
    expect(maskText('Frocio!')).toBe('***!');
    expect(maskText('che ritardata')).toBe('che ***');
    expect(maskText('mongolo')).toBe('***');
    expect(filterText('zingari').problems).toEqual(['odio']);
  });

  it('copre il sessuale esplicito', () => {
    expect(maskText('fammi un pompino')).toBe('fammi un ***');
    expect(filterText('guardo porno').problems).toEqual(['sessuale']);
  });

  it('non si fa ingannare dai trucchi più comuni', () => {
    expect(maskText('n3gr0')).toBe('***');
    expect(maskText('neeeegro')).toBe('***');
    expect(maskText('FRÒCIO')).toBe('***');
    expect(maskText('sei un f r o c i o')).toBe('sei un ***');
    expect(maskText('n.e.g.r.o')).toBe('***');
  });

  it('copre link, telefoni, email e @nome', () => {
    expect(maskText('vieni su https://esempio.it/x')).toBe('vieni su ***');
    expect(maskText('www.esempio.com')).toBe('***');
    expect(maskText('scrivimi: t.me/mario')).toBe('scrivimi: ***');
    expect(maskText('chiamami 333 123 4567')).toBe('chiamami ***');
    expect(maskText('+39 3331234567')).toBe('***');
    expect(maskText('mario.rossi@gmail.com')).toBe('***');
    expect(maskText('seguimi @mario_99')).toBe('seguimi ***');
    expect(filterText('tel 3331234567').problems).toEqual(['contatto']);
  });

  it('spiega a chi scrive cosa ha coperto', () => {
    expect(filterNotice([])).toBeNull();
    expect(filterNotice(['contatto', 'odio'])).toMatch(/link, telefoni ed @, insulti d’odio/);
  });
});
