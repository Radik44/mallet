"""Installer banners for the NSIS setup, from the app icon, with no image
libraries: a tiny PNG reader, a box downscale and a 24-bit BMP writer.

    python -I make_images.py

Writes `header.bmp` (150x57, the strip above every page) and `sidebar.bmp`
(164x314, the welcome and finish pages) next to this file. Dark gradient in
the editor's colours, the mallet in the middle, an accent line underneath.
"""

import os
import struct
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))
ICON = os.path.join(HERE, "..", "icons", "128x128@2x.png")


def read_png(path):
    """8-bit RGB/RGBA PNG → (width, height, rows of (r, g, b, a))."""
    data = open(path, "rb").read()
    assert data[:8] == b"\x89PNG\r\n\x1a\n", "not a PNG"
    pos = 8
    idat = b""
    width = height = 0
    channels = 4
    while pos < len(data):
        (length,) = struct.unpack(">I", data[pos : pos + 4])
        kind = data[pos + 4 : pos + 8]
        body = data[pos + 8 : pos + 8 + length]
        pos += 12 + length
        if kind == b"IHDR":
            width, height, depth, ctype = struct.unpack(">IIBB", body[:10])
            assert depth == 8 and ctype in (2, 6), f"unsupported PNG (depth {depth}, type {ctype})"
            channels = 4 if ctype == 6 else 3
        elif kind == b"IDAT":
            idat += body
        elif kind == b"IEND":
            break
    raw = zlib.decompress(idat)
    stride = width * channels
    rows = []
    prev = bytearray(stride)
    at = 0
    for _ in range(height):
        f = raw[at]
        line = bytearray(raw[at + 1 : at + 1 + stride])
        at += 1 + stride
        for i in range(stride):
            a = line[i - channels] if i >= channels else 0
            b = prev[i]
            c = prev[i - channels] if i >= channels else 0
            if f == 1:
                line[i] = (line[i] + a) & 255
            elif f == 2:
                line[i] = (line[i] + b) & 255
            elif f == 3:
                line[i] = (line[i] + (a + b) // 2) & 255
            elif f == 4:
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                pred = a if pa <= pb and pa <= pc else b if pb <= pc else c
                line[i] = (line[i] + pred) & 255
        px = []
        for x in range(width):
            o = x * channels
            px.append((line[o], line[o + 1], line[o + 2], line[o + 3] if channels == 4 else 255))
        rows.append(px)
        prev = line
    return width, height, rows


def downscale(width, height, rows, size):
    """Box filter to a square of `size` pixels (the icon is square)."""
    out = []
    for y in range(size):
        y0, y1 = y * height // size, max((y + 1) * height // size, y * height // size + 1)
        line = []
        for x in range(size):
            x0, x1 = x * width // size, max((x + 1) * width // size, x * width // size + 1)
            r = g = b = a = n = 0
            for yy in range(y0, y1):
                for xx in range(x0, x1):
                    pr, pg, pb, pa = rows[yy][xx]
                    r += pr * pa
                    g += pg * pa
                    b += pb * pa
                    a += pa
                    n += 1
            if a:
                line.append((r // a, g // a, b // a, a // n))
            else:
                line.append((0, 0, 0, 0))
        out.append(line)
    return out


def lerp(c0, c1, t):
    return tuple(round(c0[i] + (c1[i] - c0[i]) * t) for i in range(3))


def banner(width, height, logo, logo_at, accent_y):
    """A dark vertical gradient, the logo composited, an accent line."""
    top, bottom = (0x1C, 0x21, 0x30), (0x12, 0x15, 0x1C)
    accent = (0x2A, 0x9D, 0xAE)
    img = [[lerp(top, bottom, y / max(1, height - 1)) for _ in range(width)] for y in range(height)]
    # A faint grid, as in the 2D views.
    for y in range(height):
        for x in range(width):
            if x % 16 == 0 or y % 16 == 0:
                img[y][x] = lerp(img[y][x], (0x2A, 0x31, 0x40), 0.45)
    lx, ly = logo_at
    for y, line in enumerate(logo):
        for x, (r, g, b, a) in enumerate(line):
            px, py = lx + x, ly + y
            if 0 <= px < width and 0 <= py < height and a:
                img[py][px] = lerp(img[py][px], (r, g, b), a / 255)
    if accent_y is not None:
        for x in range(width):
            img[accent_y][x] = accent
            img[accent_y + 1][x] = lerp(accent, bottom, 0.5)
    return img


def write_bmp(path, img):
    height = len(img)
    width = len(img[0])
    row_bytes = (width * 3 + 3) & ~3
    pixel_bytes = row_bytes * height
    with open(path, "wb") as f:
        f.write(b"BM")
        f.write(struct.pack("<IHHI", 54 + pixel_bytes, 0, 0, 54))
        f.write(struct.pack("<IiiHHIIiiII", 40, width, height, 1, 24, 0, pixel_bytes, 2835, 2835, 0, 0))
        for y in range(height - 1, -1, -1):
            row = bytearray()
            for r, g, b in img[y]:
                row += bytes((b, g, r))
            row += b"\0" * (row_bytes - len(row))
            f.write(row)


def main():
    w, h, rows = read_png(ICON)
    # Header strip: the logo at the right, the accent line along the bottom.
    header = banner(150, 57, downscale(w, h, rows, 44), (150 - 44 - 8, 6), 54)
    write_bmp(os.path.join(HERE, "header.bmp"), header)
    # Sidebar: the logo in the upper third, the accent line under it.
    sidebar = banner(164, 314, downscale(w, h, rows, 112), ((164 - 112) // 2, 48), 190)
    write_bmp(os.path.join(HERE, "sidebar.bmp"), sidebar)
    print("header.bmp 150x57, sidebar.bmp 164x314")


if __name__ == "__main__":
    main()
