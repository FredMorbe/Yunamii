"""Builds the images of the product page site/lingo/ from source-assets/lingo/.

    python tools/build-lingo-assets.py            # writes site/lingo/assets/
    python tools/build-lingo-assets.py --out DIR  # writes somewhere else (to compare settings)

Sources live in source-assets/lingo/ (they are not deployed). They come from the Linguii app
(D:\\Workspace\\Linguii, the app behind Yunamii Lingo):
  screens/*.png   renders of the app's own screens on a 375 x 812 phone, English, dark ("sakura dusk") or
                  light ("aqua morning"); build/preview/ of the app, made by its tool/*_preview_test.dart
  art/card_*.webp the painted portrait of each country (Taiwan, Japan, Korea): assets/ui/card_*.webp
  icon-512.png    the app icon (the fox on a sky): docs/store/icon-512.png

Output (what the page loads):
  screens/*.webp  the screens as lossy WebP, same size as the renders (a screen is never shown larger than
                  about 300 css px, so 375 px is enough for a normal display)
  art/*.webp      the portraits, copied unchanged (they are lossy WebP already: nothing is encoded twice)
  icon.webp       the app icon at 192 x 192 (shown at 56 px)

Needs Pillow only.
"""
import argparse
import shutil
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "source-assets" / "lingo"
TARGET = ROOT / "site" / "lingo" / "assets"

SCREEN_QUALITY = 88
ICON_SIZE = 192


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--out", type=Path, default=TARGET)
    parser.add_argument("--screen-quality", type=int, default=SCREEN_QUALITY)
    args = parser.parse_args()

    screens = sorted((SOURCE / "screens").glob("*.png"))
    if not screens:
        raise SystemExit(f"no screens in {SOURCE / 'screens'}")
    (args.out / "screens").mkdir(parents=True, exist_ok=True)
    total = 0
    for source in screens:
        target = args.out / "screens" / f"{source.stem}.webp"
        Image.open(source).convert("RGB").save(target, "WEBP", quality=args.screen_quality, method=6)
        size = target.stat().st_size
        total += size
        print(f"screens/{target.name:22s} {size // 1024:4d} KB")

    (args.out / "art").mkdir(parents=True, exist_ok=True)
    for source in sorted((SOURCE / "art").glob("*.webp")):
        shutil.copyfile(source, args.out / "art" / source.name)
        size = source.stat().st_size
        total += size
        print(f"art/{source.name:25s} {size // 1024:4d} KB")

    icon = Image.open(SOURCE / "icon-512.png").convert("RGB").resize((ICON_SIZE, ICON_SIZE), Image.LANCZOS)
    icon.save(args.out / "icon.webp", "WEBP", quality=90, method=6)
    size = (args.out / "icon.webp").stat().st_size
    total += size
    print(f"icon.webp                    {size // 1024:4d} KB")
    print(f"total {total // 1024} KB")


if __name__ == "__main__":
    main()
