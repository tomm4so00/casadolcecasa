import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  RULES_LIMIT,
  compactExpression,
  compactRules,
  sameMeaning,
  // @ts-expect-error lo script è JavaScript, senza tipi
} from '../firebase/compact-rules.mjs';

describe('regole compattate', () => {
  it('toglie gli spazi intorno agli operatori, non dentro stringhe ed espressioni regolari', () => {
    expect(compactExpression("auth != null && data.val() === 'a && b' || newData.val() >= 3")).toBe(
      "auth!=null&&data.val()==='a && b'||newData.val()>=3",
    );
    expect(compactExpression('newData.val().matches(/^a, b < c$/) && ( x > 1 )')).toBe(
      'newData.val().matches(/^a, b < c$/)&&(x>1)',
    );
  });

  it('conserva gli array, come .indexOn', () => {
    const rules = JSON.stringify({ rules: { x: { '.indexOn': ['t', 'n'], '.read': 'true' } } });
    expect(JSON.parse(compactRules(rules)).rules.x['.indexOn']).toEqual(['t', 'n']);
  });

  it('le regole vere restano le stesse e stanno nel limite di Firebase', () => {
    const text = readFileSync(
      new URL('../firebase/database.rules.proposed.json', import.meta.url),
      'utf8',
    );
    const small = compactRules(text);
    expect(sameMeaning(text, small)).toBe(true);
    expect(Buffer.byteLength(small)).toBeLessThan(RULES_LIMIT);
  });
});
