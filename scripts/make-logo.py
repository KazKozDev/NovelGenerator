FONT = {
 'N': ["10001","11001","11001","10101","10011","10011","10001"],
 'O': ["01110","10001","10001","10001","10001","10001","01110"],
 'V': ["10001","10001","10001","10001","10001","01010","00100"],
 'E': ["11111","10000","10000","11110","10000","10000","11111"],
 'L': ["10000","10000","10000","10000","10000","10000","11111"],
 'G': ["01110","10001","10000","10111","10001","10001","01111"],
 'R': ["11110","10001","10001","11110","10100","10010","10001"],
 'A': ["01110","10001","10001","11111","10001","10001","10001"],
 'T': ["11111","00100","00100","00100","00100","00100","00100"],
}
CELL, GAP, LETTER_GAP, LINE_GAP, PAD = 16, 0.9, 1, 1, 26
SHADOW_DX, SHADOW_DY = -7, 7
INK, BG = "#FAFAFA", "#09090B"
LINES = ["NOVEL", "GENERATOR"]

blocks = []
for line_index, word in enumerate(LINES):
    for letter_index, ch in enumerate(word):
        gx = letter_index * (5 + LETTER_GAP)
        gy = line_index * (7 + LINE_GAP)
        for row, bits in enumerate(FONT[ch]):
            for col, bit in enumerate(bits):
                if bit == "1":
                    blocks.append(((gx + col) * CELL, (gy + row) * CELL))

cols = max(len(w) for w in LINES) * (5 + LETTER_GAP) - LETTER_GAP
rows = len(LINES) * (7 + LINE_GAP) - LINE_GAP
W, H = cols * CELL + PAD * 2, rows * CELL + PAD * 2
side = CELL - GAP

def layer(dx, dy, paint):
    return "\n    ".join(
        '<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" %s/>' % (x + PAD + dx, y + PAD + dy, side, side, paint)
        for x, y in blocks)

svg = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" width="%d" height="%d" role="img" aria-label="NovelGenerator">
  <rect width="%d" height="%d" fill="%s"/>
  <g opacity="1">
    %s
  </g>
  <g>
    %s
  </g>
</svg>
""" % (W, H, W, H, W, H, BG,
       layer(SHADOW_DX, SHADOW_DY, 'fill="none" stroke="%s" stroke-width="1.6"' % INK),
       layer(0, 0, 'fill="%s"' % INK))
open('public/logo.svg', 'w').write(svg)

# The PNG is drawn from the same blocks rather than rasterised by a previewer,
# which scales and pads the artwork before you ever see it.
SCALE = 2
try:
    from PIL import Image, ImageDraw
except ImportError:
    Image = None
if Image is not None:
    img = Image.new("RGB", (W * SCALE, H * SCALE), BG)
    draw = ImageDraw.Draw(img)
    for x, y in blocks:
        left, top = (x + PAD + SHADOW_DX) * SCALE, (y + PAD + SHADOW_DY) * SCALE
        draw.rectangle([left, top, left + side * SCALE, top + side * SCALE], outline=INK, width=2)
    for x, y in blocks:
        left, top = (x + PAD) * SCALE, (y + PAD) * SCALE
        draw.rectangle([left, top, left + side * SCALE, top + side * SCALE], fill=INK)
    img.save('public/logo.png')

print("%dx%d, блоков %d" % (W, H, len(blocks)))
