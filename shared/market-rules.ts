type RulesNode = Record<string, unknown>;
const object = (value: unknown): value is RulesNode =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const grant = (value: unknown) =>
  value === true ? 'true' : typeof value === 'string' ? value : 'false';

/** Prepare a copy of existing rules. This function never deploys or touches a database. */
export function prepareMarketRules(input: unknown): { rules: RulesNode } {
  if (!object(input) || !object(input.rules))
    throw new Error('Expected an exported { rules: ... } document');
  const rules = structuredClone(input.rules);
  const inherited = grant(rules['.write']);
  if (inherited !== 'false') {
    // A grant on the root cannot be revoked by setting .write:false on a child.
    // Conditions involving data/newData have different meaning after moving them: stop for review.
    if (/\b(?:data|newData)\b/.test(inherited))
      throw new Error(
        'Root write condition uses data/newData: merge manually without granting writes to sims_market',
      );
    const entries = Object.entries(rules).filter(
      ([key]) => !key.startsWith('.') && key !== 'sims_market',
    );
    for (const [key, node] of entries) {
      if (!object(node)) throw new Error('Invalid rule node: ' + key);
      node['.write'] = `(${inherited}) || (${grant(node['.write'])})`;
    }
    const wildcards = entries.filter(([key]) => key.startsWith('$'));
    if (wildcards.length > 1) throw new Error('Ambiguous wildcard rules');
    if (!wildcards.length)
      rules.$other = { '.write': `(${inherited}) && $other !== 'sims_market'` };
    rules['.write'] = false;
  }
  rules.sims_market = {
    '.read': true,
    '.write': "auth != null && auth.uid === 'market-publisher'",
  };
  return { rules };
}
