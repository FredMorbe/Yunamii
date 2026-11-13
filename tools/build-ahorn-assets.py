"""Builds the images and data of the concept "Ahorn Bonsai" from source-assets/ahorn/.

    python tools/build-ahorn-assets.py                  # writes concepts/ahorn-bonsai/assets/
    python tools/build-ahorn-assets.py --screen FILE    # puts another screenshot into the display
    python tools/build-ahorn-assets.py --spacing 13     # denser twig anchors (leaves sit on them)

Sources (source-assets/ahorn/, not deployed):
  bonsai_sanctuary_full_platform.png       the bare maple on its stone slab, 1536 x 1024, with alpha
  ChatGPT Image Nov 13, 2026, 01_23_29 AM.png   a laptop with a transparent display, standing on a slab
  screen-hokiicleaner.webp                 the screenshot that is shown in the display
  maple_leaf_{sanctuary,zen}_0*.png        six leaves seen from the front, 1254 x 1254, with alpha
  ChatGPT Image Nov 13, 2026, 11_5*.png    six more leaves seen from the front, 1536 x 1024, with alpha
  maple_leaf_side_0*.png                   four leaves seen from the side, 1536 x 1024, with alpha
  maple_left_upper.png, maple_right_upper.png   the two branches at the top corners of the page

Output (what the page loads), all under concepts/ahorn-bonsai/assets/:
  scene/platform.webp   the slab and the bare tree, cropped to its pixels
  scene/laptop.webp     the laptop without its own slab; the screenshot is warped into the display
  scene/leaves/*.webp   the leaf sprites (lossy colour, lossless alpha)
  scene/scene.json      where the cropped pictures sit, the sprite pivots and the twig anchors
  branches/*.webp       the corner branches

The anchors are points on the thin twigs of the crown (the trunk and the main limbs are told apart by
erosion), each with the direction the twig grows in and whether it is the end of a twig. The page puts the
leaves on them (a pair on an anchor, as on the nodes of a maple twig), the way the main page puts blossoms on
its cherry tree.

World coordinates are the pixels of bonsai_sanctuary_full_platform.png, so everything in scene.json
(offsets, anchors, root) refers to that picture.

Needs Pillow only.
"""
import argparse
import json
import math
import random
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "source-assets" / "ahorn"
TARGET = ROOT / "concepts" / "ahorn-bonsai" / "assets"

PLATFORM = "bonsai_sanctuary_full_platform.png"
LAPTOP = "ChatGPT Image Nov 13, 2026, 01_23_29 AM.png"
SCREEN = "screen-hokiicleaner.webp"

QUALITY = 90
ALPHA_QUALITY = 100

# ---- leaves ---------------------------------------------------------------------------------------------
# name in the page -> (source file, the end of the stem in source pixels). The stem ends were found by eye
# on a contact sheet and snapped to the outermost opaque pixel nearby; the leaf grows from there.
LEAVES = {
    "leaf1": ("maple_leaf_sanctuary_01_front.png", (589, 1219)),
    "leaf2": ("maple_leaf_zen_01_front.png", (611, 1192)),
    "leaf3": ("maple_leaf_sanctuary_02_tilted.png", (212, 1152)),
    "leaf4": ("maple_leaf_zen_02_tilted.png", (226, 1151)),
    "leaf5": ("maple_leaf_sanctuary_03_curled.png", (940, 1057)),
    "leaf6": ("maple_leaf_zen_03_curled.png", (940, 984)),
    "leaf7": ("ChatGPT Image Nov 13, 2026, 11_53_52 AM.png", (581, 1001)),
    "leaf8": ("ChatGPT Image Nov 13, 2026, 11_54_13 AM.png", (1072, 79)),
    "leaf9": ("ChatGPT Image Nov 13, 2026, 11_54_24 AM.png", (228, 45)),
    "leaf10": ("ChatGPT Image Nov 13, 2026, 11_54_36 AM.png", (1042, 914)),
    "leaf11": ("ChatGPT Image Nov 13, 2026, 11_54_48 AM.png", (402, 889)),
    "leaf12": ("ChatGPT Image Nov 13, 2026, 11_55_02 AM.png", (691, 1002)),
    "side1": ("maple_leaf_side_01.png", (1420, 699)),
    "side2": ("maple_leaf_side_02.png", (169, 725)),
    "side3": ("maple_leaf_side_03.png", (1460, 323)),
    "side4": ("maple_leaf_side_04.png", (163, 724)),
}
LEAF_SCALE = 0.3          # sprite pixels per source pixel (the page draws them at 0.2 to 0.3 of that again)
ALPHA_CUT = 10            # alpha below this is dust around the leaf
DUST_GRID = 4             # px: the grid on which a leaf is told from the dust beside it

# ---- laptop ---------------------------------------------------------------------------------------------
LAPTOP_BASE_Y = 824       # the lower edge of the laptop's base; everything below it is the laptop's own slab
LAPTOP_FOOT_Y = 809       # from this row on the laptop's slab shows beside the base...
LAPTOP_FOOT_X = (272, 1280)  # ...so only these columns belong to the laptop
LAPTOP_FEATHER = 3        # rows over which the cut fades out, so that it is no hard line
SCREEN_BLEED = 4          # px the screenshot reaches under the bezel, so that no gap is left at the edge

# ---- twig anchors ---------------------------------------------------------------------------------------
CROWN_Y = 560             # the crown is the part of the tree above this row
TRUNK_ROOT = (1158, 782)  # where the trunk leaves the moss, the origin of "outwards"
THICK = 11                # twigs are thinner than this; the trunk and the main limbs are not
WINDOW = 13               # radius of the window that gives the direction of a twig
TIP_REACH = 17            # how far ahead of an anchor the twig must go on for it not to be a tip


def save_webp(img: Image.Image, path: Path, quality: int = QUALITY, alpha_quality: int = ALPHA_QUALITY) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, "WEBP", quality=quality, alpha_quality=alpha_quality, method=6)
    return path.stat().st_size


def solid(alpha: Image.Image, cut: int) -> Image.Image:
    return alpha.point(lambda v: 0 if v < cut else v)


def cleaned(path: Path, cut: int = ALPHA_CUT) -> Image.Image:
    img = Image.open(path).convert("RGBA")
    img.putalpha(solid(img.getchannel("A"), cut))
    return img


def leaf_only(img: Image.Image, stem: tuple[int, int]) -> Image.Image:
    """Keeps what hangs together with the stem: a speck of dust beside the leaf would be a dot in the sprite."""
    # on a quarter of the size: the flood fill is slow, and dust is never that near to the leaf
    mask = img.getchannel("A").reduce(DUST_GRID).point(lambda v: 255 if v else 0)
    seed = (stem[0] // DUST_GRID, stem[1] // DUST_GRID)
    if not mask.getpixel(seed):
        raise ValueError(f"the end of the stem {stem} is not on the leaf")
    ImageDraw.floodfill(mask, seed, 128)
    keep = mask.point(lambda v: 255 if v == 128 else 0).resize((mask.width * DUST_GRID, mask.height * DUST_GRID), Image.NEAREST)
    alpha = img.getchannel("A")
    img.putalpha(ImageChops.multiply(alpha, keep.crop((0, 0, alpha.width, alpha.height))))
    return img


def solve(a: list[list[float]], b: list[float]) -> list[float]:
    """Gaussian elimination with pivoting (the perspective needs an 8 x 8 system, Pillow has no solver)."""
    n = len(b)
    m = [row[:] + [b[i]] for i, row in enumerate(a)]
    for col in range(n):
        piv = max(range(col, n), key=lambda r: abs(m[r][col]))
        if abs(m[piv][col]) < 1e-12:
            raise ValueError("the four corners of the display do not give a perspective")
        m[col], m[piv] = m[piv], m[col]
        for r in range(n):
            if r != col:
                f = m[r][col] / m[col][col]
                m[r] = [x - f * y for x, y in zip(m[r], m[col])]
    return [m[i][n] / m[i][i] for i in range(n)]


def perspective_coeffs(out_quad, src_quad):
    """Pillow's PERSPECTIVE wants, for every output pixel, where to read in the input."""
    a, b = [], []
    for (x, y), (u, v) in zip(out_quad, src_quad):
        a.append([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.append(u)
        a.append([0, 0, 0, x, y, 1, -v * x, -v * y]); b.append(v)
    return solve(a, b)


def fit_line(points):
    n = len(points)
    su, sv = sum(p[0] for p in points), sum(p[1] for p in points)
    suu, suv = sum(p[0] * p[0] for p in points), sum(p[0] * p[1] for p in points)
    slope = (n * suv - su * sv) / (n * suu - su * su)
    return slope, (sv - slope * su) / n


def display_quad(frame: Image.Image):
    """The four corners of the transparent display: its edges are fitted as straight lines, because the
    corners themselves are rounded."""
    mask = frame.getchannel("A").point(lambda v: 255 if v > 128 else 0)
    centre = (frame.width // 2, frame.height // 2 - 90)
    if mask.getpixel(centre) != 0:
        raise ValueError("the middle of the laptop is not transparent: is this the right laptop picture?")
    ImageDraw.floodfill(mask, centre, 128)
    hole = mask.point(lambda v: 255 if v == 128 else 0)
    x0, y0, x1, y1 = hole.getbbox()
    px = hole.load()
    left, right, top, bottom = [], [], [], []
    for y in range(y0, y1):
        xs = [x for x in range(x0, x1) if px[x, y]]
        if xs:
            left.append((y, xs[0])); right.append((y, xs[-1]))
    for x in range(x0, x1):
        ys = [y for y in range(y0, y1) if px[x, y]]
        if ys:
            top.append((x, ys[0])); bottom.append((x, ys[-1]))
    mid = lambda pts: pts[len(pts) // 4: len(pts) - len(pts) // 4]  # the straight middle half of an edge
    (al, bl), (ar, br), (at, bt), (ab, bb) = fit_line(mid(left)), fit_line(mid(right)), fit_line(mid(top)), fit_line(mid(bottom))

    def corner(xa, xb, ya, yb):  # x = xa*y + xb meets y = ya*x + yb
        x = (xa * yb + xb) / (1 - xa * ya)
        return x, ya * x + yb

    return [corner(al, bl, at, bt), corner(ar, br, at, bt), corner(ar, br, ab, bb), corner(al, bl, ab, bb)]


def build_laptop(source: Path, screen: Path, out: Path) -> dict:
    frame = Image.open(source).convert("RGBA")
    quad = display_quad(frame)
    cx = sum(p[0] for p in quad) / 4
    cy = sum(p[1] for p in quad) / 4
    # the screenshot goes a little beyond the glass, under the bezel
    grown = [(cx + (x - cx) * (1 + 2 * SCREEN_BLEED / 900), cy + (y - cy) * (1 + 2 * SCREEN_BLEED / 600)) for x, y in quad]
    shot = Image.open(screen).convert("RGB")
    sw, sh = shot.size
    coeffs = perspective_coeffs(grown, [(0, 0), (sw, 0), (sw, sh), (0, sh)])
    warped = shot.transform(frame.size, Image.PERSPECTIVE, coeffs, Image.BICUBIC).convert("RGBA")
    area = Image.new("L", frame.size, 0)
    ImageDraw.Draw(area).polygon(grown, fill=255)
    base = Image.new("RGBA", frame.size, (0, 0, 0, 0))
    base.paste(warped, mask=area)
    base.alpha_composite(frame)

    # without the laptop's own slab: above FOOT_Y the picture holds the laptop only, from there the slab reaches
    # out on both sides of the base, so only the width of the base is kept down to the lower edge of the base
    alpha = base.getchannel("A")
    keep = Image.new("L", frame.size, 0)
    kd = ImageDraw.Draw(keep)
    kd.rectangle([0, 0, frame.width, LAPTOP_FOOT_Y - 1], fill=255)
    kd.rectangle([LAPTOP_FOOT_X[0], LAPTOP_FOOT_Y, LAPTOP_FOOT_X[1], LAPTOP_BASE_Y - LAPTOP_FEATHER], fill=255)
    for i in range(LAPTOP_FEATHER):
        y = LAPTOP_BASE_Y - LAPTOP_FEATHER + 1 + i
        kd.line([(LAPTOP_FOOT_X[0], y), (LAPTOP_FOOT_X[1], y)], fill=int(255 * (1 - (i + 1) / (LAPTOP_FEATHER + 1))))
    base.putalpha(ImageChops.multiply(alpha, keep))
    box = base.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()
    laptop = base.crop(box)
    size = save_webp(laptop, out)
    shifted = [[round(x - box[0], 1), round(y - box[1], 1)] for x, y in quad]
    return {"file": "laptop.webp", "w": laptop.width, "h": laptop.height, "screen": shifted, "kb": size // 1024}


def find_anchors(platform: Image.Image, spacing: int, seed: int = 11) -> list[list[float]]:
    w, h = platform.size
    crown = platform.getchannel("A").point(lambda v: 255 if v > 110 else 0)
    above = Image.new("L", (w, h), 0)
    ImageDraw.Draw(above).rectangle([0, 0, w, CROWN_Y], fill=255)
    mask = ImageChops.multiply(crown, above)
    # what survives an erosion by THICK is the trunk and the main limbs; the rest is twig
    thick = mask.filter(ImageFilter.MinFilter(THICK)).filter(ImageFilter.MaxFilter(THICK)).filter(ImageFilter.MaxFilter(THICK - 2))
    twig = ImageChops.subtract(mask, thick)
    data = twig.tobytes()
    points = [(i % w, i // w) for i, v in enumerate(data) if v]
    if not points:
        raise ValueError("no twig pixels found: did the crown move?")

    # which twig pixels are near a point: a hash grid
    cell = WINDOW
    grid: dict[tuple[int, int], list[tuple[int, int]]] = {}
    for p in points:
        grid.setdefault((p[0] // cell, p[1] // cell), []).append(p)

    def near(x, y, r):
        for gx in range(int((x - r) // cell), int((x + r) // cell) + 1):
            for gy in range(int((y - r) // cell), int((y + r) // cell) + 1):
                for q in grid.get((gx, gy), ()):
                    if (q[0] - x) ** 2 + (q[1] - y) ** 2 <= r * r:
                        yield q

    # blue-noise sample of the twig pixels: no two anchors closer than `spacing`
    rng = random.Random(seed)
    order = points[:]
    rng.shuffle(order)
    taken: dict[tuple[int, int], list[tuple[int, int]]] = {}
    chosen = []
    for p in order:
        gx, gy = p[0] // spacing, p[1] // spacing
        if any((q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2 < spacing * spacing for dx in (-1, 0, 1) for dy in (-1, 0, 1) for q in taken.get((gx + dx, gy + dy), ())):
            continue
        taken.setdefault((gx, gy), []).append(p)
        chosen.append(p)

    rx, ry = TRUNK_ROOT
    anchors = []
    for x, y in chosen:
        pts = list(near(x, y, WINDOW))
        mx = sum(q[0] for q in pts) / len(pts)
        my = sum(q[1] for q in pts) / len(pts)
        sxx = sum((q[0] - mx) ** 2 for q in pts)
        syy = sum((q[1] - my) ** 2 for q in pts)
        sxy = sum((q[0] - mx) * (q[1] - my) for q in pts)
        ang = 0.5 * math.atan2(2 * sxy, sxx - syy)            # the axis of the twig, without a sense
        if math.cos(ang) * (x - rx) + math.sin(ang) * (y - ry) < 0:
            ang += math.pi                                    # the sense that leads away from the trunk
        dx, dy = math.cos(ang), math.sin(ang)
        front = back = 0
        for q in near(x, y, TIP_REACH):
            along = (q[0] - x) * dx + (q[1] - y) * dy
            if along > 3:
                front += 1
            elif along < -3:
                back += 1
        tip = front < max(6, 0.22 * back)
        anchors.append([x, y, round(math.atan2(math.sin(ang), math.cos(ang)), 3), math.hypot(x - rx, y - ry), int(tip)])
    reach = max(a[3] for a in anchors)
    for a in anchors:
        a[3] = round(a[3] / reach, 3)
    anchors.sort(key=lambda a: (a[1], a[0]))
    return anchors


def build_leaves(out: Path) -> dict:
    sprites = {}
    total = 0
    for name, (file, stem) in LEAVES.items():
        img = leaf_only(cleaned(SOURCE / file), stem)
        box = img.getchannel("A").point(lambda v: 255 if v > 100 else 0).getbbox()
        img = img.crop(box)
        small = img.resize((round(img.width * LEAF_SCALE), round(img.height * LEAF_SCALE)), Image.LANCZOS)
        total += save_webp(small, out / "leaves" / f"{name}.webp")
        # the centre of mass of the leaf (alpha as weight), in sprite pixels
        a = small.getchannel("A").tobytes()
        sw, sh = small.size
        weight = sx = sy = 0
        for i, v in enumerate(a):
            if v:
                weight += v; sx += v * (i % sw); sy += v * (i // sw)
        sprites[name] = {
            "w": sw, "h": sh,
            "pivot": [round((stem[0] - box[0]) * LEAF_SCALE, 1), round((stem[1] - box[1]) * LEAF_SCALE, 1)],
            "centroid": [round(sx / weight, 1), round(sy / weight, 1)],
        }
    print(f"scene/leaves ({len(sprites)} files)   {total // 1024:5d} KB")
    return sprites


def build_branch(source: Path, target: Path) -> None:
    img = Image.open(source).convert("RGBA")
    img.putalpha(solid(img.getchannel("A"), ALPHA_CUT))
    box = img.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()
    img = img.crop(box)
    size = save_webp(img, target, quality=86, alpha_quality=90)
    print(f"branches/{target.name:<10s} {img.width} x {img.height}  {size // 1024:4d} KB")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--out", type=Path, default=TARGET, help="output directory (default: concepts/ahorn-bonsai/assets)")
    parser.add_argument("--screen", type=Path, default=SOURCE / SCREEN, help="the screenshot that goes into the display")
    parser.add_argument("--spacing", type=int, default=16, help="smallest distance of two anchors in world px")
    args = parser.parse_args()

    for needed in (SOURCE / PLATFORM, SOURCE / LAPTOP, args.screen, SOURCE / "maple_left_upper.png", SOURCE / "maple_right_upper.png"):
        if not needed.is_file():
            raise SystemExit(f"Missing source: {needed}")

    # the slab and the tree
    platform = cleaned(SOURCE / PLATFORM, 12)
    box = platform.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()
    cropped = platform.crop(box)
    size = save_webp(cropped, args.out / "scene" / "platform.webp")
    print(f"scene/platform.webp       {size // 1024:5d} KB   at {box[0]},{box[1]}  {cropped.width} x {cropped.height}")

    laptop = build_laptop(SOURCE / LAPTOP, args.screen, args.out / "scene" / "laptop.webp")
    print(f"scene/laptop.webp         {laptop.pop('kb'):5d} KB   {laptop['w']} x {laptop['h']}")

    sprites = build_leaves(args.out / "scene")
    anchors = find_anchors(platform, args.spacing)
    print(f"anchors: {len(anchors)} ({sum(a[4] for a in anchors)} at the end of a twig)")

    scene = {
        "platform": {"file": "platform.webp", "x": box[0], "y": box[1], "w": cropped.width, "h": cropped.height},
        "laptop": laptop,
        "root": list(TRUNK_ROOT),
        "sprites": sprites,
        "anchors": anchors,  # [x, y, angle, distance from the root (0..1), 1 at the end of a twig]
    }
    path = args.out / "scene" / "scene.json"
    path.write_text(json.dumps(scene, separators=(",", ":")), encoding="utf-8")
    print(f"scene/scene.json          {path.stat().st_size // 1024:5d} KB")

    build_branch(SOURCE / "maple_left_upper.png", args.out / "branches" / "left.webp")
    build_branch(SOURCE / "maple_right_upper.png", args.out / "branches" / "right.webp")


if __name__ == "__main__":
    main()
