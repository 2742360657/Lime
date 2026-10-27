import ts from 'typescript';
import { readFileSync, writeFileSync } from 'node:fs';

// Use the project's own TypeScript version and tsconfig; no global editor or formatter required.
const config = ts.readConfigFile('tsconfig.json', ts.sys.readFile);
if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
const project = ts.parseJsonConfigFileContent(config.config, ts.sys, process.cwd());
const versions = new Map();
const host = {
  ...ts.sys,
  useCaseSensitiveFileNames: () => ts.sys.useCaseSensitiveFileNames,
  getCompilationSettings: () => project.options,
  getScriptFileNames: () => project.fileNames,
  getScriptVersion: name => String(versions.get(name) ?? 0),
  getScriptSnapshot: name => ts.sys.fileExists(name) ? ts.ScriptSnapshot.fromString(ts.sys.readFile(name)) : undefined,
  getDefaultLibFileName: ts.getDefaultLibFilePath,
};
const service = ts.createLanguageService(host);
for (const fileName of project.fileNames) {
  if (!fileName.endsWith('.ts') && !fileName.endsWith('.tsx')) continue;
  for (const edit of service.organizeImports({ type: 'file', fileName }, { indentSize: 2, tabSize: 2, convertTabsToSpaces: true, insertSpaceAfterCommaDelimiter: true, insertSpaceAfterOpeningAndBeforeClosingNonemptyBraces: true }, {})) {
    let source = readFileSync(edit.fileName, 'utf8');
    for (const change of [...edit.textChanges].sort((a, b) => b.span.start - a.span.start)) {
      source = source.slice(0, change.span.start) + change.newText + source.slice(change.span.start + change.span.length);
    }
    writeFileSync(edit.fileName, source);
    versions.set(edit.fileName, (versions.get(edit.fileName) ?? 0) + 1);
  }
}
service.dispose();
