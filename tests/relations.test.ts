import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import {
  ENEMY_AT,
  FRIEND_AT,
  RELATION_LIMIT,
  RELATION_MAX,
  type RelationBook,
  decodeRelations,
  noteRelation,
  relationKind,
} from '../src/game/relations-rules';

describe('memoria delle relazioni', () => {
  it('insulti, pugni e furti fanno diventare nemico', () => {
    const book: RelationBook = {};
    expect(noteRelation(book, 'player_lupo', 'Lupo', 'insult', 1)).toBeUndefined();
    expect(noteRelation(book, 'player_lupo', 'Lupo', 'insult', 2)).toBeUndefined();
    // 2 insulti e un pugno: nemico
    expect(noteRelation(book, 'player_lupo', 'Lupo', 'punch', 3)).toBe('enemy');
    expect(relationKind(book.player_lupo.score)).toBe('enemy');
    // un furto basta da solo
    const b2: RelationBook = {};
    expect(noteRelation(b2, 'player_x', 'X', 'theft', 1)).toBe('enemy');
  });

  it('chiacchiere, complimenti, cibo e regali fanno diventare amico', () => {
    const book: RelationBook = {};
    for (const act of ['talk', 'talk', 'praise'] as const)
      expect(noteRelation(book, 'player_anna', 'Anna', act, 1)).toBeUndefined();
    expect(noteRelation(book, 'player_anna', 'Anna', 'praise', 2)).toBe('friend');
    const b2: RelationBook = {};
    noteRelation(b2, 'player_b', 'B', 'food', 1);
    expect(noteRelation(b2, 'player_b', 'B', 'gift', 2)).toBe('friend');
  });

  it('si può fare pace: un nemico gentile smette di esserlo', () => {
    const book: RelationBook = {};
    for (let i = 0; i < 20; i++) noteRelation(book, 'player_l', 'L', 'punch', i);
    expect(book.player_l.score).toBe(-RELATION_LIMIT); // non va oltre il limite
    let change: ReturnType<typeof noteRelation>;
    do change = noteRelation(book, 'player_l', 'L', 'food', 100);
    while (change === undefined);
    expect(change).toBeNull(); // non più nemico
    expect(book.player_l.score).toBeGreaterThan(ENEMY_AT);
    expect(book.player_l.score).toBeLessThan(FRIEND_AT);
  });

  it('si ricordano solo le persone più recenti; il salvataggio scarta i valori non validi', () => {
    const book: RelationBook = {};
    for (let i = 0; i < RELATION_MAX + 5; i++)
      noteRelation(book, `player_p${i}`, `P${i}`, 'talk', i);
    expect(Object.keys(book)).toHaveLength(RELATION_MAX);
    expect(book.player_p0).toBeUndefined();
    expect(
      decodeRelations({
        player_ok: { name: 'Ok', score: -7, t: 5 },
        hacker: { name: 'X', score: 3, t: 1 },
        player_big: { name: 'Big', score: 999, t: 1 },
        player_bad: { name: 4, score: 1 },
      }),
    ).toEqual({
      player_ok: { name: 'Ok', score: -7, t: 5 },
      player_big: { name: 'Big', score: RELATION_LIMIT, t: 1 },
    });
  });

  it('il database accetta il messaggio del furto per avvisare la vittima', () => {
    const rules = JSON.parse(
      fs.readFileSync('firebase/database.rules.proposed.json', 'utf8'),
    ).rules;
    expect(rules.sims_interactions.$pid.$key['.validate']).toContain('|theft');
  });
});
