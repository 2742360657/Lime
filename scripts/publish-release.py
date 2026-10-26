"""Use the existing Git credential helper; never print or persist credentials."""
import json
import hashlib
import os
from pathlib import Path
import subprocess
import sys
import urllib.error
import urllib.request
import urllib.parse

REPO = '2742360657/Lime'
API = 'https://api.github.com/repos/' + REPO

def credential():
    result = subprocess.run(['git','credential','fill'], input='protocol=https\nhost=github.com\n\n',
        text=True, capture_output=True, env=dict(os.environ, GIT_TERMINAL_PROMPT='0'), timeout=20)
    if result.returncode:
        raise RuntimeError('Existing GitHub credential helper could not authenticate')
    fields = dict(line.split('=',1) for line in result.stdout.splitlines() if '=' in line)
    if not fields.get('password'): raise RuntimeError('GitHub credential helper did not provide authentication')
    return fields['password']

TOKEN = credential()

def request(path, method='GET', data=None, binary=False):
    url = path if path.startswith('https://') else API+path
    headers = {'Authorization':'Bearer '+TOKEN, 'Accept':'application/vnd.github+json',
        'X-GitHub-Api-Version':'2022-11-28', 'User-Agent':'Lime-release-maintenance'}
    if data is not None:
        if binary:
            headers['Content-Type']='application/vnd.android.package-archive' if url.endswith('.apk') else 'application/octet-stream'
        else:
            data=json.dumps(data).encode(); headers['Content-Type']='application/json'
    try:
        with urllib.request.urlopen(urllib.request.Request(url,data=data,headers=headers,method=method),timeout=180) as response:
            body=response.read()
            return json.loads(body) if body else None
    except urllib.error.HTTPError as error:
        # Status only: avoid reflecting headers or authentication into logs.
        raise RuntimeError(f'GitHub API returned HTTP {error.code}') from None

def publish(directory, notes_file):
    directory=Path(directory).resolve()
    manifest=json.loads((directory/'release-manifest.json').read_text())
    tag=manifest['tag']
    assert tag=='v'+manifest['version']
    assert subprocess.check_output(['git','status','--porcelain'],text=True).strip()==''
    assert subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()==manifest['sourceCommit']
    remote=subprocess.check_output(['git','ls-remote','origin',f'refs/tags/{tag}',f'refs/tags/{tag}^{{}}'],text=True)
    assert any(line.split()[0]==manifest['sourceCommit'] for line in remote.splitlines()), 'Push the exact release tag first'
    assets=[]
    for asset in manifest['assets']:
        assert asset['abi'] in ('arm64-v8a','x86_64')
        assert asset['name']==f"lime-{manifest['version']}-{asset['abi']}.apk"
        payload=(directory/asset['name']).read_bytes()
        assert hashlib.sha256(payload).hexdigest()==asset['sha256']
        assert len(payload)==asset['size']
        assets.append(asset['name'])
    assets+=['release-manifest.json','SHA256SUMS']
    try:
        release=request('/releases/tags/'+tag)
    except RuntimeError as error:
        if 'HTTP 404' not in str(error): raise
        release=request('/releases','POST',dict(tag_name=tag,target_commitish=manifest['sourceCommit'],
            name=f"酸橙 Lime {manifest['version']}",body=Path(notes_file).read_text(),draft=True,prerelease=False))
    for name in assets:
        payload=(directory/name).read_bytes()
        digest='sha256:'+hashlib.sha256(payload).hexdigest()
        previous=next((asset for asset in release['assets'] if asset['name']==name),None)
        if previous:
            assert previous.get('digest')==digest, 'Refusing to replace an existing release asset'
            continue
        assert release['draft'], 'Published releases are immutable in this workflow'
        upload=release['upload_url'].split('{')[0]+'?'+urllib.parse.urlencode({'name':name})
        uploaded=request(upload,'POST',payload,binary=True)
        assert uploaded['size']==len(payload)
        assert uploaded.get('digest')==digest, 'GitHub asset digest differs'
    if release['draft']:
        release=request('/releases/'+str(release['id']),'PATCH',dict(draft=False,prerelease=False,make_latest='true'))
    fresh=request('/releases/'+str(release['id']))
    assert not fresh['draft'] and not fresh['prerelease']
    assert set(assets)=={asset['name'] for asset in fresh['assets']}
    for asset in fresh['assets']:
        assert asset['digest']=='sha256:'+hashlib.sha256((directory/asset['name']).read_bytes()).hexdigest()
    print(json.dumps(dict(url=fresh['html_url'],tag=tag,assets=[dict(name=a['name'],size=a['size'],digest=a['digest']) for a in fresh['assets']]),ensure_ascii=False,indent=2))

if __name__=='__main__':
    if sys.argv[1]=='inspect':
        releases=request('/releases?per_page=10')
        print(json.dumps([dict(tag=r['tag_name'],name=r['name'],draft=r['draft'],prerelease=r['prerelease'],url=r['html_url'],assets=[a['name'] for a in r['assets']]) for r in releases],ensure_ascii=False,indent=2))
    elif sys.argv[1]=='publish':
        publish(sys.argv[2],sys.argv[3])
    else:
        raise SystemExit('Unsupported action')
