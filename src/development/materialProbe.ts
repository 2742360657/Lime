import { ANDROID_DATABASE_PATH } from '@op-engineering/op-sqlite';
import { NativeModules } from 'react-native';
import { PowerSyncDatabase } from '@powersync/react-native';
import { File, Paths } from 'expo-file-system';
import * as Crypto from 'expo-crypto';
import { createDatabaseSchema } from '../storage/databaseSchema';
import { materialNative } from '../materials/native';
import { createMaterialStore } from '../materials/store';
import { createDomain } from '../domain/service';
import { createAgentStore } from '../agent/store';
export async function runMaterialProbe() {
  const filename = `lime-dev-material-${Crypto.randomUUID()}.sqlite`;
  let db = new PowerSyncDatabase({ schema: createDatabaseSchema(), database: { dbFilename: filename } });
  const deps = { id: Crypto.randomUUID, now: Date.now, digest: (text: string) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, text) };
  const ensure = (value: unknown) => { if (!value) throw new Error('Synthetic material check failed'); };
  const { authority } = JSON.parse(await NativeModules.LimeMaterials.createProbeFixtures());
  const copy = (name: string) => materialNative.copy(`content://${authority}/${name}`, name, 'application/octet-stream');
  try {
    await db.init(); let store = createMaterialStore(db, deps), domain = createDomain(db, deps), agent = createAgentStore(db, deps);
    const original = await copy('synthetic-text.txt'), parsed = await materialNative.parse(original.uri, original.name);
    ensure(parsed.status === 'ready' && parsed.body.includes('合成通知') && parsed.body.includes('\r\n'));
    const material = await store.save(original, parsed); ensure((await store.save(original, parsed)).id === material.id);
    const image = await copy('synthetic-image.png'), imageAnalysis = await materialNative.parse(image.uri, image.name);
    ensure(imageAnalysis.kind === 'image' && imageAnalysis.images.length === 1 && new File(imageAnalysis.images[0].uri).size > 0);
    const pdf = await copy('synthetic-text.pdf'), pdfAnalysis = await materialNative.parse(pdf.uri, pdf.name);
    ensure(pdfAnalysis.status === 'ready' && pdfAnalysis.pages === 1 && pdfAnalysis.body.includes('Synthetic PDF notice'));
    const scan = await copy('synthetic-scan.pdf'), scanAnalysis = await materialNative.parse(scan.uri, scan.name);
    ensure(scanAnalysis.status === 'ready' && scanAnalysis.images.length === 1);
    for (const name of ['synthetic-bad.txt', 'synthetic-office.docx', 'synthetic-pages.pdf']) {
      const unsupported = await copy(name); ensure((await materialNative.parse(unsupported.uri, name)).status === 'unsupported');
    }
    let oversized = false; try { await copy('synthetic-large.dat'); } catch { oversized = true; } ensure(oversized);
    let unsafe = false; try { await materialNative.copy('file:///data/data/invalid/secret.txt', 'secret.txt'); } catch { unsafe = true; } ensure(unsafe);
    let unsafeContent = false; try { await materialNative.copy(`content://${authority.replace('.fixtures', '.FileSystemFileProvider')}/private.txt`, 'private.txt'); } catch { unsafeContent = true; } ensure(unsafeContent);
    const ref = { id: material.id, revision: 1, kind: 'attachment' as const }, session = await agent.newSession();
    await store.saveDraft(session, [ref]); await store.stage('synthetic-batch', { refs: [ref], errors: [] });
    const request = await agent.begin(session, '总结合成材料', [ref], []); ensure(!(await agent.grants(request.id)).length);
    const proposal = await domain.propose({ type: 'task.create', title: '合成材料待办' }, { proposalId: Crypto.randomUUID(), requestId: request.id, documentRefs: [ref] });
    const receipt = await domain.acceptProposal(proposal.id, 1, { actor: 'ui', operationId: Crypto.randomUUID() });
    ensure((await domain.acceptProposal(proposal.id, 1, { actor: 'ui', operationId: Crypto.randomUUID() })).entity.id === receipt.entity.id);
    await db.close(); db = new PowerSyncDatabase({ schema: createDatabaseSchema(), database: { dbFilename: filename } }); await db.init();
    store = createMaterialStore(db, deps); domain = createDomain(db, deps); agent = createAgentStore(db, deps);
    ensure((await store.get(material.id))?.body === parsed.body && (await store.inbox()).length === 1 && (await store.receipt('synthetic-batch'))?.refs.length === 1);
    ensure((await domain.listTasks()).length === 1 && (await agent.requests(session)).length === 1);
    const stale = await domain.propose({ type: 'task.create', title: '不应提交' }, { proposalId: Crypto.randomUUID(), requestId: request.id, documentRefs: [ref] });
    await store.archive(material.id, 1); let blocked = false;
    try { await domain.acceptProposal(stale.id, 1, { actor: 'ui', operationId: Crypto.randomUUID() }); } catch { blocked = true; } ensure(blocked);
    const queue = await db.getUploadQueueStats(); ensure(queue.count === 0);
    new File(Paths.document, 'lime-p3-material-probe.json').write(JSON.stringify({ status: 'passed', utf8: true, boundedCopy: true, privateUriRejected: true, privateContentUriRejected: true, image: true, pdfText: true, pdfScan: true, unsupportedRetained: true, dedup: true, reopen: true, sourceGuard: true, acceptedOnce: true, localQueue: queue.count }));
  } finally {
    try { await db.close(); } catch {}
    for (const suffix of ['', '-wal', '-shm']) { try { const file = new File(`file://${ANDROID_DATABASE_PATH}/${filename}${suffix}`); if (file.exists) file.delete(); } catch {} }
  }
}
