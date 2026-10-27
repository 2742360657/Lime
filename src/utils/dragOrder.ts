/** Drop indices are visual indices. Storage may interleave entries from different groups. */
export function orderByVisibleGroups<T extends { groupId: string }>(items: T[], groups: Array<{ id: string }>): T[] {
  const buckets = new Map(groups.map(group => [group.id, [] as T[]]));
  for (const item of items) buckets.get(item.groupId)?.push(item);
  return groups.flatMap(group => buckets.get(group.id)!);
}
