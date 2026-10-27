"""Install verified official test tools locally; no host SDK/AVD changes."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import xml.etree.ElementTree as ET
import zipfile

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--sdk', type=Path, default=Path.cwd() / '.local/android-test-sdk')
root = parser.parse_args().sdk.resolve()
host_sdk = Path(os.environ['ANDROID_HOME']).resolve()
if root == host_sdk or root.is_relative_to(host_sdk):
    parser.error('Use a separate project test SDK, not the host SDK')
root.mkdir(parents=True, exist_ok=True)
repo = 'https://dl.google.com/android/repository/'
packages = [('repository2-3.xml', 'emulator', root),
    ('sys-img/android/sys-img2-3.xml', 'system-images;android-36;default;x86_64', root / 'system-images/android-36/default')]
for index, (manifest, package, destination) in enumerate(packages):
    installed = root / ('emulator/emulator' if index == 0 else 'system-images/android-36/default/x86_64/system.img')
    marker = root / f'verified-{index}.json'
    if installed.is_file() and marker.is_file():
        print(f'Reusing verified {package}', flush=True)
        continue
    xml = root / f'manifest-{index}.xml'
    subprocess.run(['curl', '--fail', '--silent', '--show-error', '--retry', '2', '-L', repo+manifest, '-o', str(xml)], check=True)
    document = ET.parse(xml)
    remote = next(node for node in document.iter('remotePackage') if node.attrib['path'] == package)
    archive = next(node for node in remote.findall('./archives/archive') if node.findtext('host-os') in (None, 'linux'))
    url = archive.findtext('./complete/url')
    checksum = archive.find('./complete/checksum')
    algorithm = checksum.attrib.get('type', 'sha1').replace('-', '').lower()
    package_url = url if url.startswith('https://') else repo + (manifest.rsplit('/', 1)[0]+'/' if '/' in manifest else '') + url
    zip_path = root / f'package-{index}.zip'
    subprocess.run(['curl', '--fail', '--silent', '--show-error', '--retry', '2', '--connect-timeout', '20', '--max-time', '600', '--continue-at', '-', '-L', package_url, '-o', str(zip_path)], check=True)
    digest = hashlib.new(algorithm)
    with zip_path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024*1024), b''): digest.update(chunk)
    assert digest.hexdigest() == checksum.text.strip(), f'Checksum mismatch: {package}'
    destination.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(zip_path) as bundle:
        for info in bundle.infolist():
            target = (destination / info.filename).resolve()
            assert target.is_relative_to(destination.resolve()), 'Unsafe archive path'
            bundle.extract(info, destination)
            if info.external_attr >> 16: target.chmod(info.external_attr >> 16)
    marker.write_text(json.dumps(dict(package=package,url=package_url,algorithm=algorithm,checksum=digest.hexdigest()),indent=2)+'\n')
    zip_path.unlink()
    print(f'Installed verified {package}', flush=True)

for name in ['platform-tools', 'platforms', 'licenses']:
    link = root / name
    if not link.exists(): link.symlink_to(host_sdk / name, target_is_directory=True)
