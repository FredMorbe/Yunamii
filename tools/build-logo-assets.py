"""Builds the Yunamii logo files of the site from the source picture of the logo (Pillow only):

    site/assets/brand/yunamii-y.webp   the Y alone, cropped, without its baked-in soft shadow (header and footer of every page)
    site/favicon.svg                   the Y on a dark rounded square (the picture is embedded, so the links to it stay as they are)
    site/favicon.ico                   the same at 16, 32 and 48 px (browsers ask for it at the root)
    site/apple-touch-icon.png          180 px, the Y on the page colour (iOS rounds the corners itself)

The source (source-assets/brand/yunamii-logo.webp) is the finished logo: a rounded 3D "Y" in light blue with a soft shadow, on a
transparent ground, 1254 x 1254 px.

    python tools/build-logo-assets.py [SOURCE]
"""
import base64
import io
import sys
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SOURCE = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "source-assets" / "brand" / "yunamii-logo.webp"
SITE = ROOT / "site"
PAGE = (10, 59, 82)  # --page, #0a3b52
ICON_BG = (10, 48, 69)  # #0a3045, the ground of the old favicon


def cutout(src: Image.Image) -> Image.Image:
    """The Y without its shadow: the shadow is the part of the alpha channel below ~120, the Y itself is opaque."""
    im = src.convert("RGBA")
    alpha = im.getchannel("A").point(lambda a: 0 if a < 120 else min(255, round((a - 120) * 255 / 135)))
    im.putalpha(alpha)
    box = alpha.point(lambda a: 255 if a > 128 else 0).getbbox()
    if not box:
        raise ValueError("the logo has no opaque pixels")
    im = im.crop(box)
    side = max(im.size)
    pad = round(side * 0.04)
    canvas = Image.new("RGBA", (side + 2 * pad, side + 2 * pad), (0, 0, 0, 0))
    canvas.paste(im, ((canvas.width - im.width) // 2, (canvas.height - im.height) // 2), im)
    return canvas


def on_ground(y: Image.Image, size: int, ground, share: float, radius: float = 0.0) -> Image.Image:
    """The Y centred on a square ground (share = its part of the side); radius > 0 rounds the corners (fraction of the side)."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    tile = Image.new("RGBA", (size, size), ground + (255,))
    mask = Image.new("L", (size, size), 255)
    if radius:
        mask = Image.new("L", (size * 4, size * 4), 0)
        ImageDraw.Draw(mask).rounded_rectangle((0, 0, size * 4 - 1, size * 4 - 1), radius=round(size * 4 * radius), fill=255)
        mask = mask.resize((size, size), Image.LANCZOS)
    img.paste(tile, (0, 0), mask)
    d = round(size * share)
    small = y.resize((d, d), Image.LANCZOS)
    img.alpha_composite(small, ((size - d) // 2, (size - d) // 2 + round(size * 0.01)))
    return img


def main():
    y = cutout(Image.open(SOURCE))
    (SITE / "assets" / "brand").mkdir(parents=True, exist_ok=True)

    logo = y.resize((192, 192), Image.LANCZOS)
    logo.save(SITE / "assets" / "brand" / "yunamii-y.webp", "WEBP", quality=92, alpha_quality=100, method=6)

    # favicon.svg: the Y as a picture inside an svg, on the dark rounded square of the old one
    png = io.BytesIO()
    y.resize((96, 96), Image.LANCZOS).save(png, "PNG", optimize=True)
    data = base64.b64encode(png.getvalue()).decode("ascii")
    (SITE / "favicon.svg").write_text(
        '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 64 64">\n'
        f'  <rect width="64" height="64" rx="14" fill="#{ICON_BG[0]:02x}{ICON_BG[1]:02x}{ICON_BG[2]:02x}"/>\n'
        f'  <image x="10" y="10.5" width="44" height="44" xlink:href="data:image/png;base64,{data}"/>\n'
        "</svg>\n",
        encoding="utf-8",
    )

    ico_source = on_ground(y, 256, ICON_BG, 0.70, radius=0.22)
    ico_source.save(SITE / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])

    touch = on_ground(y, 180, PAGE, 0.70)
    touch.convert("RGB").save(SITE / "apple-touch-icon.png", "PNG", optimize=True)
    print("done:", ", ".join(str(p.relative_to(ROOT)) for p in [
        SITE / "assets" / "brand" / "yunamii-y.webp", SITE / "favicon.svg", SITE / "favicon.ico", SITE / "apple-touch-icon.png"]))


if __name__ == "__main__":
    main()
