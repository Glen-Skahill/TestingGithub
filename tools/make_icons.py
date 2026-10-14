#!/usr/bin/env python3
"""Generate pixel-art PWA icons (pure python, no PIL).

Draws a neon cross on a dark cyberpunk grid at 32x32 and upscales with
nearest-neighbour so the pixels stay crisp. Run: python3 tools/make_icons.py
"""
import struct, zlib, os

W = 32
BG      = (7, 5, 15)
GRID    = (18, 12, 40)
GLOW2   = (90, 20, 120)
GLOW1   = (190, 40, 210)
CROSS   = (255, 214, 102)   # gold
CORE    = (255, 250, 220)
CYAN    = (25, 230, 255)
MAG     = (255, 43, 214)

def blank():
    px = [[BG for _ in range(W)] for _ in range(W)]
    for y in range(W):
        for x in range(W):
            if x % 8 == 0 or y % 8 == 0:
                px[y][x] = GRID
    return px

def put(px, x, y, c):
    if 0 <= x < W and 0 <= y < W:
        px[y][x] = c

def rect(px, x0, y0, x1, y1, c):
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            put(px, x, y, c)

def draw(px):
    # horizon / skyline bars (cyan + magenta neon)
    rect(px, 0, 28, 31, 28, MAG)
    rect(px, 0, 30, 31, 30, CYAN)
    for x in range(0, 32, 5):
        rect(px, x, 24, x + 1, 27, (40, 22, 70))
    # outer glow
    rect(px, 13, 3, 18, 26, GLOW2)
    rect(px, 6, 9, 25, 14, GLOW2)
    rect(px, 14, 4, 17, 25, GLOW1)
    rect(px, 7, 10, 24, 13, GLOW1)
    # cross body (gold)
    rect(px, 15, 5, 16, 24, CROSS)
    rect(px, 8, 11, 23, 12, CROSS)
    # bright core
    rect(px, 15, 11, 16, 12, CORE)
    put(px, 15, 5, CORE); put(px, 8, 11, CORE); put(px, 23, 11, CORE)
    # light rays
    for d in (3, 5):
        put(px, 15 - d - 2, 11 - d, CYAN); put(px, 16 + d + 2, 11 - d, CYAN)
        put(px, 15 - d - 2, 12 + d + 2, MAG); put(px, 16 + d + 2, 12 + d + 2, MAG)

def png(px, scale, path):
    size = W * scale
    raw = bytearray()
    for y in range(size):
        raw.append(0)
        row = px[y // scale]
        for x in range(size):
            raw.extend(row[x // scale])
    def chunk(tag, data):
        c = struct.pack('>I', len(data)) + tag + data
        return c + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)
    ihdr = struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0)
    out = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr) + chunk(b'IDAT', zlib.compress(bytes(raw), 9)) + chunk(b'IEND', b'')
    with open(path, 'wb') as f:
        f.write(out)

if __name__ == '__main__':
    here = os.path.dirname(os.path.abspath(__file__))
    outdir = os.path.join(here, '..', 'icons')
    os.makedirs(outdir, exist_ok=True)
    px = blank(); draw(px)
    for name, scale in (('icon-192.png', 6), ('icon-512.png', 16), ('apple-touch-icon.png', 6), ('favicon-32.png', 1)):
        png(px, scale, os.path.join(outdir, name))
        print('wrote', name)
