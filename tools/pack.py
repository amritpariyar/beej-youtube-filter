"""Build the Chrome Web Store upload zip.

Ships only what the extension needs: the manifest and src/. Docs, store assets
and anything version-control-ish are left out -- a reviewer should not have to
wonder what store/LISTING.md is doing inside the package.
"""
import io, json, os, zipfile

ROOT = 'E:/beej-extension'
INCLUDE_DIRS = ['src']
INCLUDE_FILES = ['manifest.json']
SKIP_EXT = {'.md', '.py', '.zip', '.log'}
SKIP_NAMES = {'.DS_Store', 'Thumbs.db'}

m = json.load(io.open(os.path.join(ROOT, 'manifest.json'), encoding='utf-8'))
out = os.path.join(ROOT, 'beej-%s.zip' % m['version'])

files = []
for f in INCLUDE_FILES:
    files.append(f)
for d in INCLUDE_DIRS:
    for base, _dirs, names in os.walk(os.path.join(ROOT, d)):
        for n in sorted(names):
            ext = os.path.splitext(n)[1].lower()
            if ext in SKIP_EXT or n in SKIP_NAMES:
                continue
            full = os.path.join(base, n)
            files.append(os.path.relpath(full, ROOT).replace('\\', '/'))

if os.path.exists(out):
    os.remove(out)

with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    for rel in sorted(files):
        z.write(os.path.join(ROOT, rel), rel)

size = os.path.getsize(out)
print('%s  (%d files, %.1f KB)' % (os.path.basename(out), len(files), size / 1024.0))
for rel in sorted(files):
    print('   ', rel)
