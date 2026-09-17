import io, json, os, sys, unicodedata

ROOT = 'E:/beej-extension'
problems = []


def check_text(rel, must_be_ascii):
    p = os.path.join(ROOT, rel)
    if not os.path.exists(p):
        problems.append('MISSING FILE referenced by manifest: ' + rel)
        return
    b = open(p, 'rb').read()
    if b[:3] == b'\xef\xbb\xbf':
        problems.append('BOM present (Chrome rejects): ' + rel)
    try:
        s = b.decode('utf-8')
    except UnicodeDecodeError as e:
        problems.append('NOT VALID UTF-8: %s (%s)' % (rel, e))
        return
    # Noncharacters and C1 controls are what tripped Chrome's validator before.
    for i, c in enumerate(s):
        o = ord(c)
        if 0x80 <= o <= 0x9F:
            problems.append('C1 control U+%04X in %s' % (o, rel))
        if unicodedata.category(c) == 'Cn' or (0xFDD0 <= o <= 0xFDEF) or (o & 0xFFFE) == 0xFFFE:
            problems.append('noncharacter/unassigned U+%04X in %s' % (o, rel))
    if must_be_ascii:
        n = [c for c in s if ord(c) > 127]
        if n:
            problems.append('non-ASCII in %s: %r' % (rel, n[:5]))


mp = os.path.join(ROOT, 'manifest.json')
raw = open(mp, 'rb').read()
try:
    m = json.loads(raw.decode('utf-8'))
except Exception as e:
    print('manifest.json unparseable:', e)
    sys.exit(1)

check_text('manifest.json', True)

refs = []
for cs in m.get('content_scripts', []):
    refs += cs.get('js', []) + cs.get('css', [])
bg = m.get('background', {}).get('service_worker')
if bg:
    refs.append(bg)
opt = m.get('options_ui', {}).get('page')
if opt:
    refs.append(opt)

# Store-required icon set. A missing 128 blocks submission outright.
icons = m.get('icons', {})
for need in ('16', '48', '128'):
    if need not in icons:
        problems.append('manifest.icons is missing the %sx%s entry' % (need, need))
for v in list(icons.values()) + list(m.get('action', {}).get('default_icon', {}).values()):
    if not os.path.exists(os.path.join(ROOT, v)):
        problems.append('MISSING ICON: ' + v)

for r in refs:
    check_text(r, r.endswith(('.js', '.css')))

# Files the worker pulls in via importScripts, and the options page's own assets.
for extra in ['src/shared/data.js', 'src/shared/util.js',
              'src/options/options.js', 'src/options/options.css']:
    check_text(extra, True)

print('manifest permissions :', m.get('permissions'))
print('host_permissions     :', m.get('host_permissions'))
print('content script files :', len(refs), 'referenced, all present' if not any(
    'MISSING' in x for x in problems) else 'SOME MISSING')

if problems:
    print('\nPROBLEMS:')
    for x in sorted(set(problems)):
        print('  -', x)
    sys.exit(1)
print('\nPREFLIGHT CLEAN')
