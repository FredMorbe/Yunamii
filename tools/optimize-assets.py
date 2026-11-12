"""Builds the optimised images of the site from the lossless sources.

    python tools/optimize-assets.py            # writes site/assets/
    python tools/optimize-assets.py --out DIR  # writes somewhere else (to compare settings)

Sources live in source-assets/ (they are not deployed):
  hero/tree.png        the bare tree, 1254 x 1254, with alpha
  hero/sprites/*.png   blossoms, clusters, leaves and petals, with alpha
  branches/branch-*.webp   the cropped cherry branches at the window edge (colour is lossy already)
  branches/ast*.png    the uncropped originals the branches were cut from (not used by the script)

Output (what the page loads):
  hero/tree.webp       the tree with the colour grade baked in (calmer moss, cooler shadows, a little less
                       saturation), so the browser does not have to grade 1.5 million pixels at start-up
  hero/sprites/*.webp  the sprites as lossy WebP with a lossless alpha channel
  branches/*.webp      the branches with a lossy alpha channel; the colour stream is copied unchanged, so
                       nothing is encoded twice

Needs Pillow only. The colour grade is the former gradeTree() of site/js/hero.js, step for step.
"""
import argparse
import io
import struct
from pathlib import Path

from PIL import Image, ImageChops

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "source-assets"
TARGET = ROOT / "site" / "assets"

# The sprites are small, so their alpha stays lossless (100). The tree is a big picture whose alpha is a
# soft glow around the branches: lossy alpha (70) takes the alpha channel from 172 KB to 50 KB and only
# moves the edge of that glow by a few levels (checked against the lossless source, see README).
SPRITE_QUALITY = 90
SPRITE_ALPHA_QUALITY = 100
TREE_QUALITY = 90
TREE_ALPHA_QUALITY = 70
BRANCH_ALPHA_QUALITY = 70


def grade_tree(img: Image.Image) -> Image.Image:
    """The colour pass the page used to run in the browser (same maths, same order)."""
    rgba = bytearray(img.convert("RGBA").tobytes())
    for i in range(0, len(rgba), 4):
        if rgba[i + 3] == 0:
            continue
        r, g, b = rgba[i], rgba[i + 1], rgba[i + 2]
        lum = 0.3 * r + 0.59 * g + 0.11 * b
        r = lum + (r - lum) * 0.82
        g = lum + (g - lum) * 0.82
        b = lum + (b - lum) * 0.88
        m = min(1.0, max(0.0, (g - max(r, b)) / 70))          # how mossy-green this pixel is
        r *= 1 - 0.3 * m
        g *= 1 - 0.1 * m
        b += (g - b) * 0.2 * m
        dk = 1 - lum / 255                                    # lum is the one of the original pixel
        r *= 1 - 0.1 * dk
        b *= 1 + 0.1 * dk
        # a Uint8ClampedArray rounds to nearest, ties to even: round() does the same
        rgba[i] = min(255, max(0, round(r)))
        rgba[i + 1] = min(255, max(0, round(g)))
        rgba[i + 2] = min(255, max(0, round(b)))
    return Image.frombytes("RGBA", img.size, bytes(rgba))


def save_webp(img: Image.Image, path: Path, quality: int, alpha_quality: int) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    # method 6 is the slowest and smallest
    img.save(path, "WEBP", quality=quality, alpha_quality=alpha_quality, method=6)
    return path.stat().st_size


def riff_chunks(data: bytes) -> list[tuple[bytes, bytes]]:
    if data[:4] != b"RIFF" or data[8:12] != b"WEBP":
        raise ValueError("not a WebP file")
    chunks, i = [], 12
    while i < len(data):
        fourcc, size = data[i:i + 4], struct.unpack("<I", data[i + 4:i + 8])[0]
        chunks.append((fourcc, data[i + 8:i + 8 + size]))
        i += 8 + size + (size & 1)
    return chunks


def riff_build(chunks: list[tuple[bytes, bytes]]) -> bytes:
    body = b"WEBP"
    for fourcc, payload in chunks:
        body += fourcc + struct.pack("<I", len(payload)) + payload + (b"\0" if len(payload) & 1 else b"")
    return b"RIFF" + struct.pack("<I", len(body)) + body


def lossy_alpha_branch(source: Path, target: Path, alpha_quality: int) -> tuple[int, float, int]:
    """Swaps the lossless alpha chunk of a lossy WebP for a lossy one and copies everything else byte for byte.

    Returns (size, mean alpha error, largest alpha error)."""
    original = source.read_bytes()
    chunks = riff_chunks(original)
    if [c[0] for c in chunks] != [b"VP8X", b"ALPH", b"VP8 "]:
        raise ValueError(f"{source.name}: expected a lossy WebP with alpha (VP8X, ALPH, VP8), found {[c[0] for c in chunks]}")
    decoded = Image.open(io.BytesIO(original)).convert("RGBA")
    # a dummy picture with the same alpha, encoded only to get a lossy ALPH chunk
    dummy = Image.new("RGBA", decoded.size, (0, 0, 0, 0))
    dummy.putalpha(decoded.getchannel("A"))
    buffer = io.BytesIO()
    dummy.save(buffer, "WEBP", quality=1, alpha_quality=alpha_quality, method=6)
    new_alpha = next(payload for fourcc, payload in riff_chunks(buffer.getvalue()) if fourcc == b"ALPH")
    result = riff_build([chunks[0], (b"ALPH", new_alpha), chunks[2]])
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(result)

    # checks: same size, colour untouched, alpha close
    check = Image.open(io.BytesIO(result)).convert("RGBA")
    if check.size != decoded.size:
        raise ValueError(f"{source.name}: size changed")
    if ImageChops.difference(check.convert("RGB"), decoded.convert("RGB")).getbbox() is not None:
        raise ValueError(f"{source.name}: the colour changed, which must not happen")
    diff = ImageChops.difference(check.getchannel("A"), decoded.getchannel("A"))
    histogram = diff.histogram()
    mean = sum(v * n for v, n in enumerate(histogram)) / sum(histogram)
    return len(result), mean, max(v for v, n in enumerate(histogram) if n)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--out", type=Path, default=TARGET, help="output directory (default: site/assets)")
    parser.add_argument("--tree-quality", type=int, default=TREE_QUALITY)
    parser.add_argument("--tree-alpha-quality", type=int, default=TREE_ALPHA_QUALITY)
    parser.add_argument("--sprite-quality", type=int, default=SPRITE_QUALITY)
    parser.add_argument("--branch-alpha-quality", type=int, default=BRANCH_ALPHA_QUALITY)
    args = parser.parse_args()

    tree_source = SOURCE / "hero" / "tree.png"
    if not tree_source.is_file():
        raise SystemExit(f"Missing source: {tree_source}")
    size = save_webp(grade_tree(Image.open(tree_source)), args.out / "hero" / "tree.webp", args.tree_quality, args.tree_alpha_quality)
    print(f"hero/tree.webp            {size // 1024:5d} KB")

    total_in = total_out = 0
    sources = sorted((SOURCE / "hero" / "sprites").glob("*.png"))
    if not sources:
        raise SystemExit(f"No sprites found in {SOURCE / 'hero' / 'sprites'}")
    for source in sources:
        size = save_webp(Image.open(source).convert("RGBA"), args.out / "hero" / "sprites" / f"{source.stem}.webp", args.sprite_quality, SPRITE_ALPHA_QUALITY)
        total_in += source.stat().st_size
        total_out += size
    print(f"hero/sprites ({len(sources)} files)   {total_in // 1024:5d} KB -> {total_out // 1024:4d} KB")

    total_in = total_out = 0
    branches = sorted((SOURCE / "branches").glob("branch-*.webp"))
    if not branches:
        raise SystemExit(f"No branches found in {SOURCE / 'branches'}")
    for source in branches:
        size, mean, worst = lossy_alpha_branch(source, args.out / "branches" / source.name, args.branch_alpha_quality)
        total_in += source.stat().st_size
        total_out += size
        print(f"branches/{source.name:<15s} {source.stat().st_size // 1024:5d} KB -> {size // 1024:4d} KB   alpha error: mean {mean:.2f}, worst {worst}")
    print(f"branches total            {total_in // 1024:5d} KB -> {total_out // 1024:4d} KB")


if __name__ == "__main__":
    main()
