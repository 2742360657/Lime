export type Placement = { id: string; groupId: string | null };

/** Counts are not ranks after deletion, archiving or filtering. Append after the largest stored rank. */
export function nextOrderValue(items: ReadonlyArray<{ order: number }>) {
  let largest = -1;
  for (const item of items) if (Number.isFinite(item.order)) largest = Math.max(largest, item.order);
  return largest + 1;
}

/** Reorder a visible subset without losing hidden entries or changing their relative positions. */
export function reorderSubset<T extends { id: string; order: number }>(items: T[], ids: string[]): T[] {
  const byId = new Map(items.map(item => [item.id, item]));
  const unique = [...new Set(ids)].filter(id => byId.has(id));
  const selected = new Set(unique);
  const ordered = [...items].sort((a, b) => a.order - b.order);
  let cursor = 0;
  const sequence = ordered.map(item => selected.has(item.id) ? byId.get(unique[cursor++])! : item);
  const rank = new Map(sequence.map((item, index) => [item.id, index]));
  const next = items.map(item => item.order === rank.get(item.id) ? item : { ...item, order: rank.get(item.id)! });
  return next.every((item, index) => item === items[index]) ? items : next;
}

export function organizeGroups<T extends { id: string; groupId: string | null; order: number }>(
  items: T[], placements: Placement[], validGroups: Set<string>, eligible: (item: T) => boolean,
): T[] {
  const byId = new Map(items.filter(eligible).map(item => [item.id, item]));
  const targets = new Map<string, string | null>();
  for (const placement of placements) {
    if (byId.has(placement.id) && !targets.has(placement.id) && (placement.groupId === null || validGroups.has(placement.groupId))) {
      targets.set(placement.id, placement.groupId);
    }
  }
  if (!targets.size) return items;
  let next = items.map(item => targets.has(item.id) && targets.get(item.id) !== item.groupId ? { ...item, groupId: targets.get(item.id)!, order: Number.MAX_SAFE_INTEGER } : item);
  for (const groupId of new Set(targets.values())) {
    const members = next.filter(item => item.groupId === groupId);
    const ids = [...targets].filter(([, group]) => group === groupId).map(([id]) => id);
    const ranked = new Map(reorderSubset(members, ids).map(item => [item.id, item]));
    next = next.map(item => ranked.get(item.id) ?? item);
  }
  return next.every((item, index) => item === items[index]) ? items : next;
}
