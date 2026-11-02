interface Snapshot {
  val(): unknown;
}
interface Reference {
  get(): Promise<Snapshot>;
  update(value: Record<string, unknown>): Promise<void>;
  remove(): Promise<void>;
  transaction(
    update: (value: unknown) => unknown,
  ): Promise<{ committed: boolean; snapshot: Snapshot }>;
}
export interface MaintenanceDatabase {
  ref(path: string): Reference;
}
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object';

/** Legacy absence/death handling belongs to the trusted process, not another player. */
export async function maintainGame(database: MaintenanceDatabase, now: number): Promise<void> {
  const accounts = (await database.ref('sims_accounts').get()).val();
  const linkedPlayers = new Set(
    record(accounts)
      ? Object.values(accounts).flatMap((account) =>
          record(account) && typeof account.playerId === 'string' ? [account.playerId] : [],
        )
      : [],
  );
  const rooms = database.ref('sims_rooms_state');
  await rooms.get();
  let expired: { id: string; name: string; lastSeen: number }[] = [];
  const result = await rooms.transaction((value) => {
    expired = [];
    if (!record(value)) return undefined;
    const next = structuredClone(value);
    for (const [key, room] of Object.entries(next)) {
      if (
        !record(room) ||
        room.pendingDeath ||
        typeof room.ownerId !== 'string' ||
        !linkedPlayers.has(room.ownerId) ||
        typeof room.lastSeen !== 'number' ||
        now - room.lastSeen <= 80 * 3600000
      )
        continue;
      expired.push({
        id: room.ownerId,
        name: typeof room.owner === 'string' ? room.owner : 'Sconosciuto',
        lastSeen: room.lastSeen,
      });
      next[key] = { id: room.id, vaultMoney: 0, pendingDeath: expired[expired.length - 1] };
    }
    return expired.length ? next : undefined;
  });
  // Keep a receipt in the room until all private records are updated. A later run can recover after a network failure.
  const pending = result.snapshot.val();
  if (record(pending))
    for (const [roomIndex, room] of Object.entries(pending)) {
      if (!record(room) || !record(room.pendingDeath)) continue;
      const player = room.pendingDeath as { id: string; name: string; lastSeen: number };
      if (typeof player.id !== 'string' || typeof player.lastSeen !== 'number') continue;
      const reference = database.ref('sims_saves/' + player.id);
      const stored = (await reference.get()).val();
      const save = record(stored) ? stored : { savedAt: now, moneyLevel: 0, gameMinutes: 0 };
      const deadAt = player.lastSeen + 72 * 3600000;
      await reference.update({ ...(!record(stored) ? save : {}), dead: true, deadAt });
      const grave: Record<string, unknown> = {
        name: player.name,
        deadAt,
        days: Math.floor((Number(save.gameMinutes) || 0) / 1440) + 1,
      };
      if (typeof save.bornAt === 'number') grave.lived = Math.max(0, deadAt - save.bornAt);
      if (typeof save.epitaph === 'string') grave.epitaph = save.epitaph.slice(0, 60);
      await database.ref('sims_graveyard/' + player.id).update(grave);
      await database.ref('sims_leaderboard/' + player.id).remove();
      await database.ref('sims_online_players/' + player.id).remove();
      await database
        .ref('sims_rooms_state/' + roomIndex + '/pendingDeath')
        .transaction((value) => (record(value) && value.id === player.id ? null : undefined));
    }
  const chat = (await database.ref('sims_chat').get()).val();
  if (record(chat)) {
    const oldKeys = Object.keys(chat).sort().slice(0, -500);
    if (oldKeys.length)
      await database.ref('sims_chat').update(Object.fromEntries(oldKeys.map((key) => [key, null])));
  }
}
