"""Draws the sample product photos (flat garment illustrations) used by
db/demo/seed_demo.sql. Output: db/demo/photos/<product-slug>.jpg

    python db/demo/make_photos.py

Only for showing the app with sample data - real products get real photos.
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H = 1000, 1250
S = 2  # drawn at 2x, scaled down for smooth edges
OUT = Path(__file__).with_name('photos')

COLOURS = {
    'Black': '#1C1C1C',
    'White': '#F6F6F3',
    'Red': '#D3241C',
    'Off White': '#ECE6D8',
    'Grey': '#8C9096',
    'Sand': '#CDB892',
    'Olive': '#6A7045',
    'Brown': '#6C4A32',
    'Sky Blue': '#A8C4E6',
    'Indigo': '#2D3A5C',
    'Raw Indigo': '#1E2640',
    'Washed Blue': '#7D9BC0',
}


def shade(hex_colour, f):
    r, g, b = (int(hex_colour[i:i + 2], 16) for i in (1, 3, 5))
    if f < 1:
        return tuple(int(c * f) for c in (r, g, b))
    return tuple(int(c + (255 - c) * (f - 1)) for c in (r, g, b))


def p(points):
    return [(x * S, y * S) for x, y in points]


def font(size):
    for name in ('arialbd.ttf', 'Arial Bold.ttf', 'DejaVuSans-Bold.ttf'):
        try:
            return ImageFont.truetype(name, size * S)
        except OSError:
            continue
    return ImageFont.load_default()


def canvas(bg='#EEEEEC'):
    img = Image.new('RGB', (W * S, H * S), bg)
    d = ImageDraw.Draw(img)
    # soft floor shadow
    shadow = Image.new('L', (W * S, H * S), 0)
    ImageDraw.Draw(shadow).ellipse(p([(230, 1090), (770, 1150)]), fill=70)
    shadow = shadow.filter(ImageFilter.GaussianBlur(28 * S))
    img.paste(Image.new('RGB', img.size, '#C9C9C6'), (0, 0), shadow)
    return img, ImageDraw.Draw(img)


def neck_label(d, cx, y):
    d.rectangle(p([(cx - 34, y), (cx + 34, y + 22)]), fill='#000000')
    d.text((cx * S, (y + 11) * S), 'ORIGIN', fill='#FFFFFF', font=font(11), anchor='mm')


def outline_for(colour):
    return shade(colour, 0.78) if colour not in ('#F6F6F3', '#ECE6D8') else (200, 200, 196)


def tee(colour, oversized=False, print_box=False, graphic=False):
    img, d = canvas()
    w = 1.12 if oversized else 1.0
    cx = 500
    sx = lambda x: cx + (x - cx) * w  # noqa: E731
    line = outline_for(colour)
    body = [
        (sx(395), 250), (sx(605), 250), (sx(745), 300), (sx(860), 500), (sx(760), 560), (sx(700), 470),
        (sx(700), 1060), (sx(300), 1060), (sx(300), 470), (sx(240), 560), (sx(140), 500), (sx(255), 300),
    ]
    d.polygon(p(body), fill=colour, outline=line)
    d.line(p(body + [body[0]]), fill=line, width=3 * S)
    # neckline
    d.chord(p([(sx(410), 205), (sx(590), 320)]), 0, 180, fill=shade(colour, 0.82))
    d.arc(p([(sx(410), 205), (sx(590), 320)]), 0, 180, fill=line, width=6 * S)
    # sleeve hems
    d.line(p([(sx(860), 500), (sx(760), 560)]), fill=line, width=8 * S)
    d.line(p([(sx(140), 500), (sx(240), 560)]), fill=line, width=8 * S)
    neck_label(d, cx, 268)
    if print_box:
        box = '#FFFFFF' if colour != '#F6F6F3' else '#D3241C'
        d.rectangle(p([(cx - 150, 470), (cx + 150, 560)]), fill=box)
        d.text((cx * S, 515 * S), 'ORIGIN', fill=colour if colour != '#F6F6F3' else '#FFFFFF', font=font(58), anchor='mm')
    if graphic:
        ink = '#FFFFFF' if colour in ('#1C1C1C', '#8C9096') else '#111111'
        d.text((cx * S, 520 * S), 'STREET', fill=ink, font=font(64), anchor='mm')
        d.text((cx * S, 590 * S), 'CULTURE', fill=ink, font=font(64), anchor='mm')
        d.text((cx * S, 650 * S), 'VISAKHAPATNAM', fill=ink, font=font(22), anchor='mm')
    return img


def skyline_tee(colour):
    img = tee(colour, oversized=True)
    d = ImageDraw.Draw(img)
    ink = '#FFFFFF' if colour == '#1C1C1C' else '#1C1C1C'
    base = 640
    blocks = [(380, 70), (410, 120), (440, 90), (470, 160), (505, 110), (540, 140), (575, 80), (605, 100)]
    for x, h in blocks:
        d.rectangle(p([(x, base - h), (x + 26, base)]), fill=ink)
    d.line(p([(360, base + 8), (640, base + 8)]), fill=ink, width=4 * S)
    d.text((500 * S, (base + 40) * S), 'VIZAG', fill=ink, font=font(34), anchor='mm')
    return img


def shirt(colour, long_sleeve=False, pockets=1, button_down=False):
    img, d = canvas()
    cx = 500
    line = outline_for(colour)
    if long_sleeve:
        body = [(400, 245), (600, 245), (735, 290), (820, 700), (835, 980), (745, 990), (705, 560), (705, 1065),
                (295, 1065), (295, 560), (255, 990), (165, 980), (180, 700), (265, 290)]
    else:
        body = [(400, 245), (600, 245), (745, 295), (845, 520), (755, 575), (705, 480), (705, 1065), (295, 1065),
                (295, 480), (245, 575), (155, 520), (255, 295)]
    d.polygon(p(body), fill=colour)
    d.line(p(body + [body[0]]), fill=line, width=3 * S)
    # collar
    collar = shade(colour, 0.9)
    d.polygon(p([(400, 245), (500, 330), (450, 370), (380, 270)]), fill=collar, outline=line)
    d.polygon(p([(600, 245), (500, 330), (550, 370), (620, 270)]), fill=collar, outline=line)
    # placket and buttons
    d.line(p([(500, 330), (500, 1065)]), fill=line, width=4 * S)
    btn = shade(colour, 0.7) if colour not in ('#F6F6F3',) else (170, 170, 165)
    for y in range(400, 1040, 105):
        d.ellipse(p([(491, y), (509, y + 18)]), fill=btn)
    if button_down:
        for x in (440, 560):
            d.ellipse(p([(x - 6, 352), (x + 6, 364)]), fill=btn)
    # pockets
    spots = [(395,)] if pockets == 1 else [(395,), (605,)]
    for (px,) in spots:
        d.rectangle(p([(px - 55, 470), (px + 55, 590)]), outline=line, width=4 * S)
        d.line(p([(px - 55, 495), (px + 55, 495)]), fill=line, width=3 * S)
    neck_label(d, cx, 262)
    return img


def jeans(colour, baggy=False, carpenter=False):
    img, d = canvas()
    line = outline_for(colour)
    flare = 60 if baggy else 15
    d.rectangle(p([(310, 200), (690, 255)]), fill=shade(colour, 0.92))
    legs = [(310, 255), (690, 255), (705 + flare, 1080), (530, 1080), (500, 520), (470, 1080), (295 - flare, 1080)]
    d.polygon(p(legs), fill=colour)
    d.line(p(legs + [legs[0]]), fill=line, width=3 * S)
    d.line(p([(310, 200), (690, 200), (690, 255), (310, 255), (310, 200)]), fill=line, width=3 * S)
    for x in (340, 420, 580, 660):
        d.rectangle(p([(x, 195), (x + 12, 262)]), fill=shade(colour, 0.85))
    d.ellipse(p([(491, 216), (509, 234)]), fill='#C9A24A')
    # fly and front pockets
    d.arc(p([(430, 255), (530, 470)]), 270, 360, fill=line, width=4 * S)
    d.line(p([(500, 255), (500, 470)]), fill=line, width=4 * S)
    d.arc(p([(310, 200), (440, 380)]), 0, 90, fill=line, width=4 * S)
    d.arc(p([(560, 200), (690, 380)]), 90, 180, fill=line, width=4 * S)
    # contrast stitching
    stitch = '#D9A441'
    d.line(p([(400, 560), (390 - flare // 2, 1060)]), fill=stitch, width=2 * S)
    d.line(p([(600, 560), (610 + flare // 2, 1060)]), fill=stitch, width=2 * S)
    if carpenter:
        d.rectangle(p([(620, 520), (665, 700)]), outline=line, width=4 * S)
        d.line(p([(330, 640), (450, 640)]), fill=line, width=6 * S)
    d.rectangle(p([(470, 262), (530, 282)]), fill='#000000')
    d.text((500 * S, 272 * S), 'ORIGIN', fill='#FFFFFF', font=font(10), anchor='mm')
    return img


PHOTOS = {
    'box-logo-tee': lambda: tee(COLOURS['Black'], print_box=True),
    'vizag-skyline-oversized-tee': lambda: skyline_tee(COLOURS['Black']),
    'street-culture-graphic-tee': lambda: tee(COLOURS['Grey'], graphic=True),
    'linen-resort-shirt': lambda: shirt(COLOURS['Sand']),
    'corduroy-overshirt': lambda: shirt(COLOURS['Brown'], long_sleeve=True, pockets=2),
    'oxford-button-down': lambda: shirt(COLOURS['Sky Blue'], long_sleeve=True, button_down=True),
    'baggy-fit-jeans': lambda: jeans(COLOURS['Indigo'], baggy=True),
    'straight-fit-selvedge': lambda: jeans(COLOURS['Raw Indigo']),
    'carpenter-denim': lambda: jeans(COLOURS['Washed Blue'], carpenter=True),
}

if __name__ == '__main__':
    OUT.mkdir(exist_ok=True)
    for slug, draw in PHOTOS.items():
        draw().resize((W, H), Image.LANCZOS).save(OUT / f'{slug}.jpg', quality=84, optimize=True, progressive=True)
        print('wrote', slug)
