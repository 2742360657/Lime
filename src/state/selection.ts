export function shallowEqual<T>(a: T, b: T): boolean {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every(key =>
    Object.prototype.hasOwnProperty.call(b, key) && Object.is((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]));
}

/** Cache a slice by snapshot, preserving the last committed selection across selector changes. */
export function createSelectionReader<S, T>(getSnapshot: () => S, select: (snapshot: S) => T, previous?: { value: T }) {
  let cached: { snapshot: S; value: T } | undefined;
  return () => {
    const snapshot = getSnapshot();
    if (cached && Object.is(cached.snapshot, snapshot)) return cached.value;
    const value = select(snapshot);
    const last = cached ?? previous;
    const selected = last && shallowEqual(last.value, value) ? last.value : value;
    cached = { snapshot, value: selected };
    return selected;
  };
}
