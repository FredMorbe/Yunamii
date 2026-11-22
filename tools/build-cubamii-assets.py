"""Builds site/cubamii/assets/ (phone screens as WebP, the app icon) for the Cubamii product page.

The screens are real captures of the app (Samsung S26, English, dark, 1080 x 2240 with the status bar cut off), made in the
Cubamii project: D:/Workspace/Voxeloku/store/screenshots-2026-11-22/dark/en (README there says how they were made; progress in
them is seeded demo progress, so all motifs read as solved). Pillow only.

    python tools/build-cubamii-assets.py [SCREENS_DIR] [ICON_PNG]
"""
import sys
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "site" / "cubamii" / "assets"
SCREENS = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("D:/Workspace/Voxeloku/store/screenshots-2026-11-22/dark/en")
ICON = Path(sys.argv[2]) if len(sys.argv) > 2 else Path("D:/Workspace/Voxeloku/store/assets/icon-512.png")

# output name -> source file (without .png)
SHOTS = {
    "block": "02-puzzle-block",
    "inspect": "03-puzzle-inspect",
    "peel": "05-puzzle-peel-5of7",
    "carved": "04-puzzle-carved",
    "collection-animals": "collection-animals",
    "collection-landmarks": "collection-landmarks",
    "collection-vehicles": "collection-vehicles",
    "collection-dioramas": "collection-dioramas",
    "model-fox": "model-fox",
    "model-tikal": "model-tikal",
    "model-pirate": "model-pirate",
    "model-garden": "model-japangarden",
    "model-castle": "model-fairycastle",
    "model-lighthouse": "model-lighthouse",
}
WIDTH = 540  # css phone is at most ~270 px wide; 2x for sharp screens


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "screens").mkdir(exist_ok=True)
    for name, src in SHOTS.items():
        path = SCREENS / f"{src}.png"
        if not path.exists():
            raise FileNotFoundError(path)
        im = Image.open(path).convert("RGB")
        h = round(im.height * WIDTH / im.width)
        im = im.resize((WIDTH, h), Image.LANCZOS)
        target = OUT / "screens" / f"{name}.webp"
        im.save(target, "WEBP", quality=82, method=6)
        print(target.name, im.size, target.stat().st_size // 1024, "KB")
    ic = Image.open(ICON).convert("RGBA").resize((192, 192), Image.LANCZOS)
    ic.save(OUT / "icon.webp", "WEBP", quality=90, method=6)
    print("icon.webp", (OUT / "icon.webp").stat().st_size // 1024, "KB")


if __name__ == "__main__":
    main()
