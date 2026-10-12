import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
const pkg=JSON.parse(readFileSync('package.json','utf8'));
const app=JSON.parse(readFileSync('app.json','utf8')).expo;
const lock=JSON.parse(readFileSync('package-lock.json','utf8'));
assert.equal(pkg.version,app.version,'npm and Expo versions differ');
assert.equal(pkg.version,lock.packages[''].version,'lock version differs');
assert.equal(app.android.package,'com.androidsoftwaredaily.habitcheckin','Changing the application ID breaks in-place upgrades');
assert.equal(pkg.license,'MIT');
assert.ok(existsSync('LICENSE'));
const gradle=readFileSync('android/app/build.gradle','utf8');
assert.ok(gradle.includes('applicationId appConfig.android.package'));
assert.ok(gradle.includes('versionName appConfig.version'));
const tracked=execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
for(const file of tracked){
  if(!existsSync(file)) continue; // staged deletion
  assert.ok(!file.endsWith('.apk') && !file.endsWith('.aab'),`Build artifact tracked: ${file}`);
  assert.ok(!file.startsWith('.local/'),`Private file tracked: ${file}`);
  if(file.endsWith('.md')) {
    const text=readFileSync(file,'utf8');
    for(const [,target] of text.matchAll(/\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g)){
      if(/^(?:https?:|mailto:|#)/.test(target)) continue;
      const destination=path.resolve(path.dirname(file),decodeURIComponent(target.split('#')[0]));
      assert.ok(existsSync(destination),`Broken link in ${file}: ${target}`);
    }
  }
}
console.log('Repository metadata, tracked files and local documentation links: OK');
