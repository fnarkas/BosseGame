#!/usr/bin/env python3
"""
Downscale the Pokemon artwork in public/pokemon_images/ for the iPad.

The PokeAPI official artwork is 475x475 (about 140 KB each, 21 MB for Gen 1).
Phaser keeps every loaded texture decoded in GPU memory: 151 x 475 x 475 x 4
bytes is ~136 MB, which is enough for iPad Safari to evict the tab. The game
never draws a Pokemon larger than ~240 px, so 256 px loses nothing visible and
cuts texture memory by ~70%.

Usage:
    python3 optimize_pokemon_images.py            # resize in place (idempotent)
    python3 optimize_pokemon_images.py --size 320 # different maximum edge
    python3 optimize_pokemon_images.py --dry-run  # report only

Requires Pillow:  pip install pillow
Run it after download_pokemon_images.py. Already-small files are skipped.
"""
import argparse
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:  # pragma: no cover
    print("Pillow is required: pip install pillow", file=sys.stderr)
    sys.exit(1)


def optimize(directory: Path, max_size: int, dry_run: bool) -> None:
    files = sorted(directory.glob("*.png"))
    if not files:
        print(f"No PNG files in {directory}")
        return

    before_total = 0
    after_total = 0
    resized = 0
    for path in files:
        before = path.stat().st_size
        before_total += before
        with Image.open(path) as img:
            width, height = img.size
            if max(width, height) <= max_size:
                after_total += before
                continue
            scale = max_size / max(width, height)
            new_size = (max(1, round(width * scale)), max(1, round(height * scale)))
            if dry_run:
                print(f"{path.name}: {width}x{height} -> {new_size[0]}x{new_size[1]}")
                after_total += before
                continue
            img = img.convert("RGBA")
            img = img.resize(new_size, Image.LANCZOS)
            img.save(path, "PNG", optimize=True)
        after = path.stat().st_size
        after_total += after
        resized += 1
        print(f"{path.name}: {width}x{height} -> {new_size[0]}x{new_size[1]}  {before // 1024} KB -> {after // 1024} KB")

    print(f"\n{resized} of {len(files)} files resized")
    print(f"Total: {before_total / 1024 / 1024:.1f} MB -> {after_total / 1024 / 1024:.1f} MB")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dir", default="public/pokemon_images", help="folder with the PNG artwork")
    parser.add_argument("--size", type=int, default=256, help="maximum edge length in pixels (default 256)")
    parser.add_argument("--dry-run", action="store_true", help="only report what would change")
    args = parser.parse_args()
    optimize(Path(args.dir), args.size, args.dry_run)


if __name__ == "__main__":
    main()
