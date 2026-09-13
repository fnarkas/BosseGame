#!/usr/bin/env python3
"""
Draw public/minigame_icons/vowel_sort.png: a big vowel above two buckets
labelled LÅNG and KORT, 256x256 with a transparent background.

Requires Pillow (pip install pillow). Uses Arial Bold from macOS; falls back
to Pillow's default font elsewhere.
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

SIZE = 256
OUT = Path("public/minigame_icons/vowel_sort.png")


def font(size):
    for candidate in ("/System/Library/Fonts/Supplemental/Arial Bold.ttf", "/Library/Fonts/Arial Bold.ttf"):
        try:
            return ImageFont.truetype(candidate, size)
        except OSError:
            continue
    return ImageFont.load_default()


def main():
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # The vowel card at the top
    draw.rounded_rectangle((78, 8, 178, 108), radius=18, fill=(255, 255, 255, 255), outline=(52, 152, 219, 255), width=6)
    letter_font = font(72)
    draw.text((128, 58), "A", font=letter_font, fill=(0, 131, 143, 255), anchor="mm")

    # Arrows down into both buckets
    for x_from, x_to in ((110, 66), (146, 190)):
        draw.line((x_from, 112, x_to, 150), fill=(44, 62, 80, 255), width=8)
        draw.polygon([(x_to - 12, 140), (x_to + 12, 140), (x_to, 162)], fill=(44, 62, 80, 255))

    # Two buckets: LÅNG (teal, wide bar) and KORT (orange, short bar)
    buckets = (
        ((8, 160, 124, 248), (0, 137, 123, 255), "LÅNG", (24, 236, 108, 236)),
        ((132, 160, 248, 248), (255, 140, 66, 255), "KORT", (170, 236, 210, 236)),
    )
    label_font = font(30)
    for box, color, label, bar in buckets:
        draw.rounded_rectangle(box, radius=16, fill=color, outline=(0, 0, 0, 255), width=5)
        cx = (box[0] + box[2]) // 2
        draw.text((cx, 196), label, font=label_font, fill=(255, 255, 255, 255), anchor="mm")
        draw.rounded_rectangle(bar, radius=4, fill=(255, 255, 255, 230))

    OUT.parent.mkdir(parents=True, exist_ok=True)
    img.save(OUT, "PNG", optimize=True)
    print(f"wrote {OUT} ({OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
