"""Read the app's legacy or verified-snapshot storage in isolated emulator tests."""
import json


def read_state(adb, legacy_path):
    candidates = []
    for index in (0, 1):
        path = legacy_path.replace('data.json', f'data.{index}.json')
        raw = adb('exec-out', 'cat', path, check=False)
        try:
            envelope = json.loads(raw)
            payload = envelope['payload']
            generation = envelope['generation']
            if type(generation) is not int or generation < 1 or generation > 9007199254740991:
                continue
            checksum = 0x811c9dc5
            encoded = (str(generation) + '\n' + payload).encode('utf-16-le', errors='surrogatepass')
            for offset in range(0, len(encoded), 2):
                checksum = ((checksum ^ int.from_bytes(encoded[offset:offset + 2], 'little')) * 0x01000193) & 0xffffffff
            if envelope['format'] == 1 and envelope['checksum'] == f'{checksum:08x}':
                candidates.append((envelope['generation'], json.loads(payload)))
        except (ValueError, KeyError, TypeError):
            pass
    if candidates:
        return max(candidates, key=lambda item: item[0])[1]
    return json.loads(adb('exec-out', 'cat', legacy_path))


def clear_snapshot_slots(adb, legacy_path):
    # Call only while this test's explicitly addressed emulator app is stopped.
    adb('shell', 'rm', '-f', legacy_path.replace('data.json', 'data.0.json'), legacy_path.replace('data.json', 'data.1.json'))
