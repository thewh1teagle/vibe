#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.12"
# dependencies = ["pillow"]
# ///

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent / "logo-source.png"
SIZE = 1024
FILL = "#7c3aed"
BAR = "#ffffff"


def main() -> None:
    cx = cy = SIZE // 2
    r = SIZE * 40 // 100

    circle = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    ImageDraw.Draw(circle).ellipse((cx - r, cy - r, cx + r, cy + r), fill=FILL)

    mask = Image.new("L", (SIZE, SIZE), 0)
    ImageDraw.Draw(mask).ellipse((cx - r, cy - r, cx + r, cy + r), fill=255)

    bars = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    bars_draw = ImageDraw.Draw(bars)

    bar_count = 10
    bar_width = SIZE * 3 // 100
    span = SIZE * 0.50
    start_x = cx - span / 2
    gap = (span - bar_count * bar_width) / (bar_count - 1)
    heights = [0.04, 0.12, 0.20, 0.32, 0.16, 0.24, 0.40, 0.28, 0.20, 0.08]

    for i, h_frac in enumerate(heights):
        x0 = start_x + i * (bar_width + gap)
        x1 = x0 + bar_width
        h = SIZE * h_frac
        y0 = cy - h / 2
        y1 = cy + h / 2
        bars_draw.rounded_rectangle((x0, y0, x1, y1), radius=bar_width / 2, fill=BAR)

    masked_bars = Image.composite(bars, Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0)), mask)

    img = Image.alpha_composite(circle, masked_bars)
    img.save(OUT, "PNG")
    print(f"wrote {OUT} ({SIZE}x{SIZE})")


if __name__ == "__main__":
    main()
