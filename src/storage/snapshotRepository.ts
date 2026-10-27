/** Two alternating, verified snapshots. The last good slot is never overwritten by the next save. */
export interface SnapshotFiles {
  exists(path: string): Promise<boolean>;
  read(path: string): Promise<string>;
  write(path: string, contents: string): Promise<void>;
  mkdir(path: string): Promise<void>;
}

export interface DataRepository<T> {
  load(): Promise<{ data: T; recovered: boolean }>;
  save(data: T): Promise<void>;
  preserveForRecovery(): Promise<void>;
}

// Accidental-corruption detection only. This is not an authentication/signature boundary.
function checksum(text: string) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193);
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function createSnapshotRepository<T>(
  files: SnapshotFiles,
  directory: string,
  decode: (value: unknown) => T,
  defaults: () => T,
): DataRepository<T> {
  const slots = [directory + 'data.0.json', directory + 'data.1.json'];
  const legacy = directory + 'data.json';
  let active: number | null = null;
  let generation = 0;
  let ready = false;

  function parse(contents: string) {
    const envelope = JSON.parse(contents);
    if (envelope?.format !== 1 || !Number.isSafeInteger(envelope.generation) || envelope.generation < 1 ||
      typeof envelope.payload !== 'string' || checksum(`${envelope.generation}\n${envelope.payload}`) !== envelope.checksum) {
      throw new Error('本地保存文件校验失败。');
    }
    return { data: decode(JSON.parse(envelope.payload)), generation: envelope.generation as number };
  }

  return {
    async load() {
      ready = false;
      active = null;
      generation = 0;
      await files.mkdir(directory);
      let present = 0;
      let invalid = 0;
      const candidates: Array<{ index: number; data: T; generation: number }> = [];
      for (const [index, path] of slots.entries()) {
        if (!await files.exists(path)) continue;
        present++;
        try { candidates.push({ index, ...parse(await files.read(path)) }); }
        catch { invalid++; }
      }
      candidates.sort((a, b) => b.generation - a.generation);
      if (candidates.length) {
        const latest = candidates[0];
        active = latest.index;
        generation = latest.generation;
        ready = true;
        return { data: latest.data, recovered: invalid > 0 };
      }
      // Never quietly fall back to a potentially much older pre-upgrade file.
      if (present) throw new Error('本地保存文件无法读取。原文件已保留，请重试或从备份恢复。');
      const data = await files.exists(legacy) ? decode(JSON.parse(await files.read(legacy))) : defaults();
      active = null;
      generation = 0;
      ready = true;
      return { data, recovered: false };
    },
    async save(data) {
      if (!ready) throw new Error('本地数据尚未成功读取，已阻止覆盖保存。');
      if (generation >= Number.MAX_SAFE_INTEGER) throw new Error('本地保存序号异常，原文件已保留。');
      const target = active === 0 ? 1 : 0;
      const payload = JSON.stringify(data);
      const contents = JSON.stringify({ format: 1, generation: generation + 1, checksum: checksum(`${generation + 1}\n${payload}`), payload });
      await files.write(slots[target], contents);
      const readBack = await files.read(slots[target]);
      if (readBack !== contents) throw new Error('保存后校验失败，请重试；上一份完整数据仍保留。');
      parse(readBack);
      active = target;
      generation++;
    },
    async preserveForRecovery() {
      // Explicit recovery keeps byte-for-byte originals before permitting new writes.
      const archive = directory + `recovery-${Date.now()}-${Math.random().toString(36).slice(2, 8)}/`;
      await files.mkdir(archive);
      const valid: Array<{ index: number; generation: number }> = [];
      for (const path of [legacy, ...slots]) {
        if (!await files.exists(path)) continue;
        const original = await files.read(path);
        const destination = archive + path.slice(directory.length);
        await files.write(destination, original);
        if (await files.read(destination) !== original) throw new Error('无法保留恢复前的数据，已取消覆盖。');
        if (slots.includes(path)) {
          try { valid.push({ index: slots.indexOf(path), generation: parse(original).generation }); }
          catch { /* Corrupt originals are still preserved verbatim. */ }
        }
      }
      valid.sort((a, b) => b.generation - a.generation);
      active = valid[0]?.index ?? null;
      generation = valid[0]?.generation ?? 0;
      ready = true;
    },
  };
}
