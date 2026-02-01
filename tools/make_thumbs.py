"""Generate lightweight thumbnails for the gallery.

Usage:
  python tools/make_thumbs.py

It will read images from:
  assets/works/full/
and write thumbnails to:
  assets/works/thumbs/

Thumbnails keep aspect ratio (perfect for tall portrait photos).
"""

import os

try:
    from PIL import Image, ImageOps
except Exception as e:
    raise SystemExit(
        "Pillow is required. Install it with: pip install pillow\n" + str(e)
    )

BASE = os.path.dirname(os.path.dirname(__file__))
FULL_DIR = os.path.join(BASE, 'assets', 'works', 'full')
THUMBS_DIR = os.path.join(BASE, 'assets', 'works', 'thumbs')

# Thumb target: max width/height in pixels
MAX_W = 720
MAX_H = 720

def is_img(fn: str) -> bool:
    return fn.lower().endswith(('.jpg', '.jpeg', '.png', '.webp'))

os.makedirs(THUMBS_DIR, exist_ok=True)

count = 0
for fn in sorted(os.listdir(FULL_DIR)) if os.path.isdir(FULL_DIR) else []:
    if not is_img(fn):
        continue
    src = os.path.join(FULL_DIR, fn)
    dst = os.path.join(THUMBS_DIR, fn.rsplit('.', 1)[0] + '.webp')

    with Image.open(src) as im:
        # Ensure correct orientation from EXIF
        try:
            im = ImageOps.exif_transpose(im)
        except Exception:
            pass

        im = im.convert('RGB')
        im.thumbnail((MAX_W, MAX_H))
        im.save(dst, 'WEBP', quality=82, method=6)
        count += 1

print(f"OK: {count} thumbnails -> {THUMBS_DIR}")
