import { NativeModules } from 'react-native';
import * as Crypto from 'expo-crypto';
import { materialStore } from '../materials/service';
import { materialNative } from '../materials/native';
import { agentStore } from '../agent/AgentProvider';
import { domain } from '../domain';
// Deterministic UI fixture, no model/Key. Never writes a physical phone's ordinary DB.
export async function prepareMaterialUiFixture() {
  const { authority, emulator } = JSON.parse(await NativeModules.LimeMaterials.createProbeFixtures());
  if (!emulator) throw new Error('Emulator-only fixture');
  const copy = await materialNative.copy(`content://${authority}/synthetic-text.txt`, 'synthetic-text.txt');
  const material = await materialStore.save(copy, await materialNative.parse(copy.uri, copy.name));
  const session = await agentStore.newSession();
  const refs = [{ id: material.id, revision: material.revision, kind: 'attachment' as const }];
  const request = await agentStore.begin(session, '合成材料建议验收', refs, []);
  const command = { type: 'task.create' as const, title: 'Synthetic material task-' + Crypto.randomUUID().slice(0, 8), note: 'Synthetic fixture only' };
  const proposal = await domain.propose(command, { proposalId: Crypto.randomUUID(), requestId: request.id, documentRefs: refs });
  await agentStore.putResult(Crypto.randomUUID(), request.id, { command: { ...command, dueDateKey: null, dueTime: null }, status: 'proposal', proposalId: proposal.id });
  await agentStore.finish(request.id, '这是未调用模型的合成界面样本，请修改建议并确认保存。', 'complete', null);
}
