import os, json

BASE = os.path.dirname(os.path.dirname(__file__))

# Put your photos here:
#   assets/works/full/   -> full size (recommended)
# Optional:
#   assets/works/thumbs/ -> lighter thumbnails with same filenames
#
# If you don't create "full/", the script will read directly from assets/works/

WORKS_DIR = os.path.join(BASE, 'assets', 'works')
FULL_DIR = os.path.join(WORKS_DIR, 'full')
THUMBS_DIR = os.path.join(WORKS_DIR, 'thumbs')
OUT = os.path.join(BASE, 'data', 'works.json')

DEFAULT_CATEGORY = ''  # leave empty to avoid showing filters

def list_images(folder):
    if not os.path.isdir(folder):
        return []
    files = []
    for fn in sorted(os.listdir(folder)):
        if fn.lower().endswith(('.jpg','.jpeg','.png','.webp','.svg')):
            files.append(fn)
    return files

use_full = os.path.isdir(FULL_DIR)
src_dir = FULL_DIR if use_full else WORKS_DIR
files = list_images(src_dir)

thumb_files = list_images(THUMBS_DIR)
# Map thumbs by stem (base filename without extension) so you can use .webp thumbs
thumb_by_stem = {os.path.splitext(fn)[0]: fn for fn in thumb_files}

items = []
for i, fn in enumerate(files, 1):
    src = f'assets/works/{("full/" if use_full else "")}{fn}'
    stem = os.path.splitext(fn)[0]
    tfn = thumb_by_stem.get(stem)
    thumb = f'assets/works/thumbs/{tfn}' if tfn else src
    items.append({
        'src': src,
        'thumb': thumb,
        'title': f'Oeuvre {i:03d}',
        'year': '',
        'category': DEFAULT_CATEGORY
    })

with open(OUT, 'w', encoding='utf-8') as f:
    json.dump(items, f, ensure_ascii=False, indent=2)

print(f'OK: {len(items)} images -> {OUT}')
