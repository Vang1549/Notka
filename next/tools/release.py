"""Stage, verify and publish immutable native releases. Never touches legacy updates.

Signing is local; publishing needs only the public certificate and verified artifacts.
Use --stage APK --notes FILE, commit the result, then --publish (or the workflow).
"""
import argparse
import base64
import hashlib
import io
import json
import os
from pathlib import Path
import re
import struct
import subprocess
import urllib.error
import urllib.request
import zipfile

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives.serialization import pkcs12

ROOT = Path(__file__).resolve().parents[1]
REPOSITORY = 'Vang1549/Notka'
CERT = ROOT / 'app/src/main/assets/trust/native.der'
DIST = ROOT / 'dist'
MANIFEST = ROOT / 'publication.json'


def require(condition, message):
    if not condition:
        raise ValueError(message)


def sha(data):
    return hashlib.sha256(data).digest()


def unpack_parts(data):
    position = 0
    while position < len(data):
        size, = struct.unpack_from('<I', data, position)
        position += 4
        require(position + size <= len(data), 'Truncated signing block')
        yield data[position:position + size]
        position += size


def verify_apk(data):
    """Verify APK Signature Scheme v2, certificate, content digest and bundled trust."""
    end = data.rfind(b'PK\x05\x06', max(0, len(data) - 65557))
    require(end >= 0, 'Missing ZIP directory')
    directory, = struct.unpack_from('<I', data, end + 16)
    require(data[directory - 16:directory] == b'APK Sig Block 42', 'Missing APK signing block')
    size, = struct.unpack_from('<Q', data, directory - 24)
    start = directory - size - 8
    require(start >= 0 and struct.unpack_from('<Q', data, start)[0] == size, 'Invalid APK block')
    position = start + 8
    block = None
    while position < directory - 24:
        length, = struct.unpack_from('<Q', data, position)
        require(length >= 4 and position + 8 + length <= directory - 24, 'Invalid APK pair')
        identity, = struct.unpack_from('<I', data, position + 8)
        if identity == 0x7109871a:
            require(block is None, 'Duplicate v2 signature')
            block = data[position + 12:position + 8 + length]
        position += 8 + length
    require(block is not None, 'Missing v2 signature')
    signers, = unpack_parts(block)
    signer, = unpack_parts(signers)
    signed, signatures, public = unpack_parts(signer)
    signed_fields = list(unpack_parts(signed))
    require(len(signed_fields) >= 3 and all(not field for field in signed_fields[3:]), 'Unexpected signed-data extension')
    digests, certificates = signed_fields[:2]
    certificate, = unpack_parts(certificates)
    require(certificate == CERT.read_bytes(), 'Native APK certificate differs')
    key = x509.load_der_x509_certificate(certificate).public_key()
    require(key.public_bytes(serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo) == public, 'APK key mismatch')
    signature, = unpack_parts(signatures)
    digest, = unpack_parts(digests)
    require(struct.unpack_from('<I', signature)[0] == struct.unpack_from('<I', digest)[0] == 0x103, 'Unexpected APK signature algorithm')
    value, = unpack_parts(signature[4:])
    key.verify(value, signed, padding.PKCS1v15(), hashes.SHA256())
    stored, = unpack_parts(digest[4:])
    sections = (data[:start], data[directory:end], data[end:end + 16] + struct.pack('<I', start) + data[end + 20:])
    chunks = [section[i:i + 1048576] for section in sections for i in range(0, len(section), 1048576)]
    expected = sha(b'\x5a' + struct.pack('<I', len(chunks)) + b''.join(sha(b'\xa5' + struct.pack('<I', len(c)) + c) for c in chunks))
    require(stored == expected, 'APK content digest differs')
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        require(archive.read('assets/trust/native.der') == certificate, 'Bundled update trust differs')
        for abi in ('arm64-v8a', 'armeabi-v7a', 'x86_64'):
            require(f'lib/{abi}/libnotka_audio.so' in archive.namelist(), 'Missing audio ABI: ' + abi)


def envelope(record, key):
    text = json.dumps(record, ensure_ascii=False, separators=(',', ':'))
    signature = key.sign(text.encode(), padding.PKCS1v15(), hashes.SHA256())
    return {'record': text, 'signature': base64.b64encode(signature).decode()}


def verify_envelope(raw, certificates):
    data = json.loads(raw)
    for cert in certificates:
        try:
            x509.load_der_x509_certificate(cert.read_bytes()).public_key().verify(
                base64.b64decode(data['signature'], validate=True), data['record'].encode(), padding.PKCS1v15(), hashes.SHA256())
            return json.loads(data['record'])
        except Exception:
            continue
    raise ValueError('Catalog signature does not match trusted certificates')


def immutable(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        require(path.read_bytes() == data, 'Existing release differs; increment version code: ' + path.name)
    else:
        path.write_bytes(data)


def stage(apk, notes):
    version = dict(line.split('=', 1) for line in (ROOT / 'version.properties').read_text().splitlines() if '=' in line)
    code = int(version['code'])
    name = version['name']
    require(code > 0 and re.fullmatch(r'[0-9A-Za-z.-]+', name), 'Invalid version')
    sdk = Path(os.environ['ANDROID_HOME']) / 'build-tools/35.0.0'
    java = str(Path(os.environ['JAVA_HOME']) / 'bin/java')
    subprocess.run([java, '-jar', str(sdk / 'lib/apksigner.jar'), 'verify', '--verbose', str(apk)], check=True)
    subprocess.run([str(sdk / 'zipalign'), '-c', '-P', '16', '4', str(apk)], check=True)
    badging = subprocess.check_output([str(sdk / 'aapt2'), 'dump', 'badging', str(apk)], text=True)
    require(f"package: name='studio.notka.next' versionCode='{code}' versionName='{name}'" in badging, 'APK version/package mismatch')
    require("application-debuggable" not in badging, 'Refusing debug APK')
    raw = apk.read_bytes()
    verify_apk(raw)
    keyfile = Path(os.environ['NOTKA_NEXT_KEYSTORE'])
    password = os.environ['NOTKA_NEXT_KEY_PASSWORD'].encode()
    key, certificate, _ = pkcs12.load_key_and_certificates(keyfile.read_bytes(), password)
    require(certificate.public_bytes(serialization.Encoding.DER) == CERT.read_bytes(), 'Signing identity differs')
    filename = f'Notka2-{code}.apk'
    tag = f'native-{code}'
    immutable(DIST / filename, raw)
    channel = {'kind': 'notka.native.channel.1', 'package': 'studio.notka.next', 'versionCode': code,
               'versionName': name, 'bytes': len(raw), 'sha256': base64.b64encode(sha(raw)).decode(),
               'url': f'https://github.com/{REPOSITORY}/releases/download/{tag}/{filename}'}
    (DIST / 'channel.json').write_text(json.dumps(envelope(channel, key), ensure_ascii=False) + '\n', encoding='utf-8')
    catalog = DIST / 'soundbank/catalog.json'
    catalog.parent.mkdir(exist_ok=True)
    if not catalog.exists():
        catalog.write_bytes((ROOT / 'app/src/main/assets/catalog.json').read_bytes())
    manifest = {'repository': REPOSITORY, 'update_branch': 'native-updates', 'tag': tag,
                'title': f'Нотка 2 · {name}', 'notes': notes.read_text(encoding='utf-8'),
                'asset': {'name': filename, 'path': 'dist/' + filename, 'bytes': len(raw), 'sha256': sha(raw).hex()}}
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    verify()


def verify():
    manifest = json.loads(MANIFEST.read_text(encoding='utf-8'))
    require(manifest['repository'] == REPOSITORY and manifest['update_branch'] == 'native-updates', 'Wrong repository/channel')
    channel = verify_envelope((DIST / 'channel.json').read_bytes(), [CERT])
    code = channel['versionCode']
    asset = manifest['asset']
    require(channel['kind'] == 'notka.native.channel.1' and channel['package'] == 'studio.notka.next' and type(code) is int and code > 0, 'Wrong channel identity')
    require(asset['name'] == f'Notka2-{code}.apk' and asset['path'] == 'dist/' + asset['name'] and manifest['tag'] == f'native-{code}', 'Wrong artifact name')
    raw = (ROOT / asset['path']).read_bytes()
    require(len(raw) == asset['bytes'] == channel['bytes'] and sha(raw).hex() == asset['sha256'] and base64.b64encode(sha(raw)).decode() == channel['sha256'], 'Artifact checksum differs')
    require(channel['url'] == f'https://github.com/{REPOSITORY}/releases/download/{manifest["tag"]}/{asset["name"]}', 'Wrong artifact URL')
    verify_apk(raw)
    trust = list((ROOT / 'app/src/main/assets/trust').glob('*.der'))
    catalog = verify_envelope((DIST / 'soundbank/catalog.json').read_bytes(), trust)
    require(catalog['kind'] == 'notka.instruments.1', 'Wrong instrument catalog')
    for item in catalog['instruments']:
        if item.get('origin', 'legacy') != 'native':
            require(item.get('origin', 'legacy') == 'legacy', 'Unknown bank origin')
            continue
        for metadata in [item, *([item['preview']] if item.get('preview') else [])]:
            require(re.fullmatch(r'(?:bank|preview)-[a-z0-9-]+', metadata['asset']), 'Unsafe asset name')
            payload = (DIST / 'soundbank' / (metadata['asset'] + '.json')).read_bytes()
            require(len(payload) == metadata['bytes'] and base64.b64encode(sha(payload)).decode() == metadata['sha256'], 'Bank checksum differs')
            verify_envelope(payload, trust)
    print('Verified native APK signature, certificate, ABIs, signed channel and asset hashes.', flush=True)
    return manifest, channel


class SafeRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, msg, headers, url):
        redirected = super().redirect_request(request, fp, code, msg, headers, url)
        if redirected is not None:
            redirected.remove_header('Authorization')
        return redirected


def publish():
    manifest, channel = verify()
    commit = os.environ.get('GITHUB_SHA') or subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
    require(re.fullmatch(r'[a-f0-9]{40}', commit), 'Invalid release commit')
    # Never activate a channel that is absent from the selected, committed source snapshot.
    for path in ['next/publication.json', 'next/dist/channel.json', 'next/dist/soundbank/catalog.json']:
        committed = subprocess.check_output(['git', 'show', commit + ':' + path], cwd=ROOT)
        require(committed == (ROOT.parent / path).read_bytes(), 'Commit release files first: ' + path)
    token = os.environ.get('GH_TOKEN') or os.environ.get('GITHUB_TOKEN')
    if not token:
        result = subprocess.run(['git', 'credential', 'fill'], input='protocol=https\nhost=github.com\n\n', text=True,
                                capture_output=True, check=True, env={**os.environ, 'GIT_TERMINAL_PROMPT': '0'})
        token = dict(line.split('=', 1) for line in result.stdout.splitlines() if '=' in line).get('password')
    require(token, 'GitHub credentials unavailable')
    opener = urllib.request.build_opener(SafeRedirect())
    base = 'https://api.github.com/repos/' + REPOSITORY

    def api(path, method='GET', body=None, binary=False):
        url = path if path.startswith('https://uploads.github.com/') else base + path
        raw = body if binary else (json.dumps(body).encode() if body is not None else None)
        request = urllib.request.Request(url, data=raw, method=method, headers={
            'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github+json',
            'User-Agent': 'Notka-native-release', 'Content-Type': 'application/vnd.android.package-archive' if binary else 'application/json'})
        with opener.open(request, timeout=300) as response:
            return json.load(response)

    tag = manifest['tag']
    try:
        release = api('/releases/tags/' + tag)
    except urllib.error.HTTPError as error:
        if error.code != 404:
            raise
        release = api('/releases', 'POST', {'tag_name': tag, 'target_commitish': commit, 'name': manifest['title'], 'body': manifest['notes'], 'draft': True})
    asset = manifest['asset']
    known = next((a for a in release['assets'] if a['name'] == asset['name']), None)
    if known is None:
        known = api(release['upload_url'].split('{')[0] + '?name=' + asset['name'], 'POST', (ROOT / asset['path']).read_bytes(), True)
    require(known['size'] == asset['bytes'] and known.get('digest') == 'sha256:' + asset['sha256'], 'Existing GitHub asset differs; never overwrite it')
    api('/releases/' + str(release['id']), 'PATCH', {'draft': False, 'make_latest': 'true', 'name': manifest['title'], 'body': manifest['notes']})
    with urllib.request.urlopen(channel['url'], timeout=300) as response:
        downloaded = response.read(asset['bytes'] + 1)
    require(len(downloaded) == asset['bytes'] and sha(downloaded).hex() == asset['sha256'], 'Published download verification failed; channel remains unchanged')
    try:
        api('/git/ref/heads/native-updates')
    except urllib.error.HTTPError as error:
        if error.code != 404:
            raise
        api('/git/refs', 'POST', {'ref': 'refs/heads/native-updates', 'sha': commit})
    else:
        api('/git/refs/heads/native-updates', 'PATCH', {'sha': commit, 'force': False})
    print('Published and activated ' + channel['url'], flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    actions = parser.add_mutually_exclusive_group(required=True)
    actions.add_argument('--stage', type=Path)
    actions.add_argument('--verify-only', action='store_true')
    actions.add_argument('--publish', action='store_true')
    parser.add_argument('--notes', type=Path)
    args = parser.parse_args()
    if args.stage:
        require(args.notes is not None, '--notes is required when staging')
        stage(args.stage, args.notes)
    elif args.publish:
        publish()
    else:
        verify()
