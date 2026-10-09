#!/usr/bin/env python3
"""Check publication structure and identity; this does not test app behavior."""
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
files = subprocess.check_output(
    ['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    cwd=ROOT,
).decode().split('\0')
files = sorted(set(name for name in files if name))
errors = []
for name in files:
    path = ROOT / name
    if not path.exists():
        errors.append(f'Missing tracked file: {name}')
        continue
    if path.is_symlink():
        errors.append(f'Publication symlink needs review: {name}')
    if name.startswith(('.local/', 'artifacts/', 'node_modules/', 'services/', 'infra/')):
        errors.append(f'Out-of-scope publication file: {name}')
    if path.suffix.lower() in {'.keystore', '.jks', '.pem', '.key', '.apk', '.aab', '.sqlite', '.db', '.log'}:
        errors.append(f'Private/generated file: {name}')
    if path.name.startswith('.env') and path.name != '.env.example':
        errors.append(f'Private environment file: {name}')
    if path.stat().st_size > 5 * 1024 * 1024:
        errors.append(f'Large publication file needs review: {name}')
    if path.suffix == '.md':
        text = path.read_text()
        if text.count('```') % 2:
            errors.append(f'Unclosed code fence: {name}')
        for link in re.findall(r'\]\(([^\s)]+)\)', text):
            if link.startswith(('https://', 'http://', '#')):
                continue
            local = link.split('#', 1)[0]
            if local and not (path.parent / local).exists():
                errors.append(f'Broken documentation link: {name} -> {local}')

package = json.loads((ROOT / 'package.json').read_text())
lock = json.loads((ROOT / 'package-lock.json').read_text())
app = json.loads((ROOT / 'app.json').read_text())['expo']
toolchain = json.loads((ROOT / 'toolchain.json').read_text())
if not (package['name'] == lock['name'] == lock['packages']['']['name'] == app['slug'] == 'lime'):
    errors.append('Project/lock/Expo names disagree')
identity = 'app.lime.personalassistant'
if app['name'] != '酸橙' or app['android']['package'] != identity or toolchain['package_id'] != identity:
    errors.append('Application branding/identity disagree')
gradle = (ROOT / 'android/app/build.gradle').read_text()
for expected in [f"namespace '{identity}'", f"applicationId '{identity}'", "LIME_KEYSTORE_DIR", '../.local/signing/debug.keystore']:
    if expected not in gradle:
        errors.append(f'Missing Android identity/signing setting: {expected}')
for name in ['MainActivity.kt', 'MainApplication.kt']:
    path = ROOT / 'android/app/src/main/java/app/lime/personalassistant' / name
    if not path.exists() or not path.read_text().startswith('package ' + identity):
        errors.append(f'Kotlin package mismatch: {name}')
for name in ['scripts/apply-signing.mjs', 'android/app/build.gradle']:
    if '/Ciallo/' in (ROOT / name).read_text():
        errors.append(f'Old signing path remains: {name}')
if errors:
    for error in errors:
        print(error)
    raise SystemExit(1)
print(f'Repository structure, JSON, branding, identity and local links: OK ({len(files)} files)')
