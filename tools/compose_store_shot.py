from PIL import Image, ImageDraw, ImageFont

W, H = 1280, 800
BAR = 54                      # label strip above each panel
PANEL_W, PANEL_H = 636, H - BAR
GUTTER = W - PANEL_W * 2      # 8px seam between the two panels

FONT = ImageFont.truetype("C:/Windows/Fonts/arialbd.ttf", 22)
FONT_SM = ImageFont.truetype("C:/Windows/Fonts/arial.ttf", 17)


def panel(path, skip_top, crop_x=None):
    """Scale a full-page capture to the panel width, then take the top of it.

    skip_top drops rows of the source from the top. crop_x picks a column range
    out of it, which zooms the panel in; both captures are search results, so
    cropping off the left-hand guide and the right margin leaves the results
    themselves at a readable size.
    """
    im = Image.open(path).convert("RGB")
    if crop_x:
        im = im.crop((crop_x[0], 0, crop_x[1], im.height))
    scale = PANEL_W / im.width
    im = im.resize((PANEL_W, round(im.height * scale)), Image.LANCZOS)
    top = round(skip_top * scale)
    return im.crop((0, top, PANEL_W, min(top + PANEL_H, im.height)))


# Both captures come from tools/screenshots.js at 1280px wide. The results
# column runs from the end of the guide rail to the right margin.
CROP_X = (88, 1264)

canvas = Image.new("RGB", (W, H), "#ffffff")
d = ImageDraw.Draw(canvas)

shots = [
    (0, "store/source-capture-feed-before.png", 0, CROP_X, "Before", 'Search "Paris food", unfiltered', "#606060"),
    (PANEL_W + GUTTER, "store/source-capture-feed-after.png", 0, CROP_X, "After", "Only mode: France + French", "#c00000"),
]

for x, path, skip, crop, label, sub, colour in shots:
    canvas.paste(panel(path, skip, crop), (x, BAR))
    d.text((x + 2, 10), label, font=FONT, fill=colour)
    w = d.textlength(label, font=FONT)
    d.text((x + 12 + w, 16), sub, font=FONT_SM, fill="#606060")

d.line([(PANEL_W + GUTTER // 2, 0), (PANEL_W + GUTTER // 2, H)], fill="#e0e0e0", width=1)
canvas.save("store/screenshot-5-feed-before-after.png")
print("store/screenshot-5-feed-before-after.png", canvas.size)
