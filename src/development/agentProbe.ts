import { PowerSyncDatabase } from '@powersync/react-native';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { fetch as expoFetch } from 'expo/fetch';
import { File, Paths } from 'expo-file-system';
import { createDatabaseSchema } from '../storage/databaseSchema';
import { createDomain } from '../domain/service';
import { createAgentStore } from '../agent/store';
import { createAgentRuntime } from '../agent/runtime';

// Manual debug-only fixture. Isolated DB and Key; no ordinary records or account API.
// Run scripts/agent-fixture-server.py and reverse device port 8092 before this probe.
export async function runAgentProbe() {
  const filename = `lime-dev-agent-${Crypto.randomUUID()}.sqlite`, keyName = `lime.probe.${Crypto.randomUUID()}`;
  let db = new PowerSyncDatabase({ schema: createDatabaseSchema(), database: { dbFilename: filename } });
  const deps = { id: Crypto.randomUUID, now: Date.now, digest: (text: string) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, text) };
  const ensure = (value: unknown) => { if (!value) throw new Error('Synthetic agent check failed'); };
  const services = () => {
    const domain = createDomain(db, deps), store = createAgentStore(db, deps);
    const runtime = createAgentRuntime({ domain, store, ...deps, key: () => SecureStore.getItemAsync(keyName),
      fetch: ((_url, init) => expoFetch('http://127.0.0.1:8092/chat', { ...init, headers: { 'Content-Type': 'application/json' } })) as typeof globalThis.fetch });
    return { domain, store, runtime };
  };
  try {
    await SecureStore.setItemAsync(keyName, 'synthetic-not-a-real-credential');
    await db.init();
    let { domain, store, runtime } = services();
    const persona = { filename: 'synthetic.md', body: '# 合成人格\n说话简洁。\r\n', enabled: 1 };
    await store.saveSettings('deepseek-flash', persona);
    ensure((await store.settings()).persona?.body === persona.body);
    await db.execute("INSERT INTO habits(id,name,cadence,target_count,sort_order,archived_at,revision,deleted) VALUES('synthetic-habit','合成训练','weekly',3,0,NULL,1,0)");
    const first = await store.newSession();
    await runtime.start(first, '新建待办：合成待办');
    ensure((await domain.listTasks()).length === 1 && (await store.requests(first))[0].status === 'complete');
    await runtime.start(first, '今天练什么');
    ensure((await domain.listActivities()).length === 1);
    const second = await store.newSession(), request = await store.begin(second, '练完了', [], await domain.listActivities());
    const activity = (await domain.listActivities())[0], grant = (await store.grants(request.id))[0];
    const completed = { type: 'activity.complete', id: activity.id, expectedRevision: activity.revision, note: '合成完成感受' };
    await domain.executeGranted(completed, { actor: 'agent', requestId: request.id, grantId: grant.id });
    await store.progress(request.id, '重启前部分回答');
    await db.close();
    db = new PowerSyncDatabase({ schema: createDatabaseSchema(), database: { dbFilename: filename } });
    await db.init(); ({ domain, store, runtime } = services());
    await store.recover();
    ensure((await store.request(request.id))?.status === 'interrupted');
    ensure((await store.settings()).persona?.body === persona.body);
    // Fixture repeats the original tool command with a new toolCallId after a crash.
    await runtime.start(second, '', [], request.id);
    ensure((await store.requests(second))[0].status === 'complete');
    ensure((await db.get<{ n: number }>('SELECT count(*) AS n FROM checkins')).n === 1);
    ensure((await store.results(request.id))[0].receipt?.disposition === 'replayed');
    await store.saveSettings('deepseek-flash', { ...persona, enabled: 0 });
    ensure((await store.settings()).persona?.enabled === 0);
    ensure((await db.getUploadQueueStats()).count === 0);
    const result = { status: 'passed', sdkStream: true, toolLoop: true, secureStore: true, personaReopen: true,
      neutralOptional: true, interruptedRecovery: true, receiptReplay: true, crossSessionActivity: true, checkins: 1, localQueue: 0 };
    new File(Paths.document, 'lime-p2-agent-probe.json').write(JSON.stringify(result));
    console.info('[LimeP2AgentProbe]', JSON.stringify(result));
    return result;
  } finally { await db.close(); await SecureStore.deleteItemAsync(keyName); }
}
