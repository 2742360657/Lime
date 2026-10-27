import ts from 'typescript';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const files = directory => readdirSync(directory, { withFileTypes: true }).flatMap(entry =>
  entry.isDirectory() ? files(path.join(directory, entry.name)) : [path.join(directory, entry.name)]);
for (const file of files('src').filter(file => /\.tsx?$/.test(file))) {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const pure = (file.startsWith('src/state/') && !file.endsWith('AppProvider.tsx')) || file.endsWith('snapshotRepository.ts');
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    const target = statement.moduleSpecifier.text;
    if (pure) assert.ok(!/^(?:react|react-native|expo)(?:$|[-/])/.test(target) && !target.includes('/components/'), `${file}: platform/UI import in pure business layer: ${target}`);
    if (file.startsWith('src/screens/')) assert.ok(!/^expo-file-system/.test(target) && !target.includes('snapshotRepository'), `${file}: screen bypasses storage boundary`);
  }
}
console.log('Business, platform and UI import boundaries: OK');
