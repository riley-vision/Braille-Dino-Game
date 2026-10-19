#!/usr/bin/env python3
"""Reads a screenshot of VoiceOver's Braille panel and prints the cells it
shows as Unicode braille, one line per screenshot.

Usage: read_braille_panel.py shot.png [more.png ...]

Raised dots are bright yellow; unraised dot positions are dim grey. Both
give the cell grid, so blank cells are kept. Uses only the standard library
(and macOS sips to turn the PNG into a BMP).
"""
import os
import struct
import subprocess
import sys
import tempfile

BITS = {(0, 0): 0x01, (0, 1): 0x02, (0, 2): 0x04, (1, 0): 0x08, (1, 1): 0x10, (1, 2): 0x20, (0, 3): 0x40, (1, 3): 0x80}


def load(path):
    with tempfile.TemporaryDirectory() as tmp:
        bmp = os.path.join(tmp, 'shot.bmp')
        subprocess.run(['sips', '-s', 'format', 'bmp', path, '--out', bmp], check=True, capture_output=True)
        data = open(bmp, 'rb').read()
    offset = struct.unpack_from('<I', data, 10)[0]
    width, height = struct.unpack_from('<ii', data, 18)
    bpp = struct.unpack_from('<H', data, 28)[0] // 8
    stride = (width * bpp + 3) & ~3
    flip = height > 0
    height = abs(height)

    def pixel(x, y):
        row = height - 1 - y if flip else y
        i = offset + row * stride + x * bpp
        b, g, r = data[i], data[i + 1], data[i + 2]
        return r, g, b

    return width, height, pixel


def components(width, height, pixel, top, bottom):
    """Dots: connected groups of bright pixels, with their kind."""
    kind = {}
    for y in range(top, bottom):
        for x in range(width):
            r, g, b = pixel(x, y)
            if r > 180 and g > 150 and b < 120:
                kind[(x, y)] = 'raised'
            elif 95 < r < 200 and abs(r - g) < 12 and abs(g - b) < 12 and r > 100:
                kind[(x, y)] = 'flat'
    seen = set()
    dots = []
    for start, k in kind.items():
        if start in seen:
            continue
        stack = [start]
        seen.add(start)
        xs, ys = [], []
        while stack:
            x, y = stack.pop()
            xs.append(x)
            ys.append(y)
            for n in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                if n in kind and n not in seen and kind[n] == k:
                    seen.add(n)
                    stack.append(n)
        if 3 <= len(xs) <= 400:
            dots.append((sum(xs) / len(xs), sum(ys) / len(ys), k, len(xs)))
    return dots


def cluster(values, gap):
    values = sorted(values)
    groups = [[values[0]]]
    for v in values[1:]:
        if v - groups[-1][-1] > gap:
            groups.append([v])
        else:
            groups[-1].append(v)
    return [sum(g) / len(g) for g in groups]


def read(path):
    width, height, pixel = load(path)
    # The dots are in the top part of the panel, above the text.
    dots = components(width, height, pixel, 0, int(height * 0.55))
    # The panel's rounded corners and edges are not dots.
    dots = [d for d in dots if 30 < d[0] < width - 30 and d[1] > 25]
    if not dots:
        return ''
    # Raised dots are large and yellow, unraised ones small and grey; anything
    # else (the panel's rounded corners) is not a dot.
    raised = [d for d in dots if d[2] == 'raised']
    flat = [d for d in dots if d[2] == 'flat']
    big = sorted(d[3] for d in raised)[len(raised) // 2] if raised else 50
    small = sorted(d[3] for d in flat)[len(flat) // 2] if flat else 11
    dots = [d for d in raised if 0.5 * big <= d[3] <= 1.6 * big] + [d for d in flat if 0.5 * small <= d[3] <= 1.6 * small]
    rows = cluster([d[1] for d in dots], 4)
    if len(rows) > 4:
        # Keep the four rows with the most dots.
        count = {r: sum(1 for d in dots if abs(d[1] - r) < 4) for r in rows}
        rows = sorted(sorted(rows, key=lambda r: -count[r])[:4])
    cols = cluster([d[0] for d in dots], 4)
    # Two kinds of gaps: between the two columns of a cell (small) and
    # between cells (large). Split them at the middle of the two.
    gaps = sorted(b - a for a, b in zip(cols, cols[1:]))
    if not gaps:
        return ''
    small_gap, large_gap = gaps[0], gaps[-1]
    for _ in range(10):
        split = (small_gap + large_gap) / 2
        lo = [g for g in gaps if g < split] or [small_gap]
        hi = [g for g in gaps if g >= split] or [large_gap]
        small_gap, large_gap = sum(lo) / len(lo), sum(hi) / len(hi)
    split = (small_gap + large_gap) / 2
    inner = small_gap
    cells = []
    i = 0
    while i < len(cols):
        if i + 1 < len(cols) and cols[i + 1] - cols[i] < split:
            cells.append((cols[i], cols[i + 1]))
            i += 2
        else:
            cells.append((cols[i], cols[i] + inner))
            i += 1
    out = []
    for left, right in cells:
        mask = 0
        for x, y, k, _ in dots:
            if k != 'raised':
                continue
            c = 0 if abs(x - left) < abs(x - right) else 1
            if min(abs(x - left), abs(x - right)) > inner:
                continue
            r = min(range(len(rows)), key=lambda j: abs(rows[j] - y))
            mask |= BITS.get((c, r), 0)
        out.append(chr(0x2800 + mask))
    return ''.join(out)


if __name__ == '__main__':
    for p in sys.argv[1:]:
        print(read(p))
