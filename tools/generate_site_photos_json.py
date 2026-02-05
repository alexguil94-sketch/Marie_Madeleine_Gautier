import os, json

BASE = os.path.dirname(os.path.dirname(__file__))

ASSETS_DIR = os.path.join(BASE, "assets")
OUT = os.path.join(BASE, "data", "site-photos.json")

IMG_EXTS = (".jpg", ".jpeg", ".png", ".webp", ".svg")


def is_image(fn: str) -> bool:
    low = fn.lower()
    if not low.endswith(IMG_EXTS):
        return False
    # Exclude logos/icons that aren't "photos" content
    if "logo" in low:
        return False
    return True


items = []
for root, _, files in os.walk(ASSETS_DIR):
    rel_root = os.path.relpath(root, BASE).replace("\\", "/")
    for fn in sorted(files):
        if not is_image(fn):
            continue
        items.append("/" + rel_root + "/" + fn)

items = sorted(set(items))
os.makedirs(os.path.dirname(OUT), exist_ok=True)

with open(OUT, "w", encoding="utf-8") as f:
    json.dump(items, f, ensure_ascii=False, indent=2)

print(f"OK: {len(items)} images -> {OUT}")

