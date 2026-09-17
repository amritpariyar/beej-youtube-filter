"""Generate the extension icon set.

Design: dark rounded square, white globe ring, red bar through it.
Drawn supersampled and downsampled. The 16 and 32px versions drop the globe's
inner lines and thicken everything -- detail that reads fine at 128 turns to
mud at 16, so the small sizes get their own simplified draw.
"""
import os
from PIL import Image, ImageDraw

OUT = 'E:/beej-extension/src/icons'
os.makedirs(OUT, exist_ok=True)
os.makedirs('E:/beej-extension/store', exist_ok=True)

BG = (15, 15, 15, 255)
RING = (250, 250, 250, 255)
BAR = (230, 30, 30, 255)

S = 1024
R = int(S * 0.22)


def rounded_mask(size, radius):
    m = Image.new('L', (size, size), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    return m


def draw(detailed):
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, S - 1, S - 1], radius=R, fill=BG)

    cx = cy = S // 2
    rad = int(S * (0.29 if detailed else 0.33))
    w = int(S * 0.055)
    if detailed:
        d.ellipse([cx - rad, cy - rad, cx + rad, cy + rad], outline=RING, width=w)
    else:
        # At 16px a ring collapses into a smudge; a filled disc keeps its shape.
        d.ellipse([cx - rad, cy - rad, cx + rad, cy + rad], fill=RING)

    if detailed:
        mer = int(rad * 0.46)
        d.ellipse([cx - mer, cy - rad, cx + mer, cy + rad], outline=RING, width=int(w * 0.8))
        d.line([cx - rad, cy, cx + rad, cy], fill=RING, width=int(w * 0.8))

    bw = int(S * (0.085 if detailed else 0.115))
    half = int(S * (0.30 if detailed else 0.29))

    halo = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    hw = bw + int(S * 0.045)
    pad = int(S * 0.014)
    ImageDraw.Draw(halo).rounded_rectangle(
        [cx - half - pad, cy - hw // 2, cx + half + pad, cy + hw // 2],
        radius=hw // 2, fill=BG)

    bar = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(bar).rounded_rectangle(
        [cx - half, cy - bw // 2, cx + half, cy + bw // 2],
        radius=bw // 2, fill=BAR)

    halo = halo.rotate(-45, resample=Image.BICUBIC, center=(cx, cy))
    bar = bar.rotate(-45, resample=Image.BICUBIC, center=(cx, cy))

    img = Image.alpha_composite(img, halo)
    img = Image.alpha_composite(img, bar)
    img.putalpha(rounded_mask(S, R))
    return img


big = draw(True)
small = draw(False)

for size in (16, 32):
    small.resize((size, size), Image.LANCZOS).save('%s/icon%d.png' % (OUT, size))
    print('wrote icon%d.png (simplified)' % size)
for size in (48, 128):
    big.resize((size, size), Image.LANCZOS).save('%s/icon%d.png' % (OUT, size))
    print('wrote icon%d.png (detailed)' % size)

# Store small promo tile.
promo = Image.new('RGBA', (440, 280), BG)
promo.alpha_composite(big.resize((160, 160), Image.LANCZOS), (40, 60))
promo.convert('RGB').save('E:/beej-extension/store/promo-440x280.png')
print('wrote store/promo-440x280.png')
