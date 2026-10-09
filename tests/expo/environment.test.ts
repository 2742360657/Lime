import * as Crypto from 'expo-crypto';
import { commandSchema } from '../../src/domain/commands';

// Confirms the fixed Expo preset/transpilation. Does not simulate native SQLite.
test('Expo mocks load alongside the shared runtime validator', () => {
  expect(typeof Crypto.randomUUID).toBe('function');
  expect(commandSchema.safeParse({ type: 'task.create', title: '合成待办' }).success).toBe(true);
});
