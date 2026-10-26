#!/usr/bin/env python3
"""Prépare les versions web des sprites : art/unites/*.png (originaux, non publiés)
→ assets/unites/*.webp (publiés avec le site).

Chaque sprite est recadré sur sa silhouette, ramené à HEIGHT pixels de haut (deux fois la
taille affichée, pour rester net sur les écrans à haute densité) et enregistré en WebP avec
transparence. Outil : Pillow, utilisé hors du projet npm. À relancer après l'ajout d'un sprite :

    python3 tools/prepare-sprites.py
"""

from pathlib import Path

from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "art" / "unites"
TARGET = ROOT / "assets" / "unites"
HEIGHT = 200
QUALITY = 85
# Sprites dont on efface le halo : des pixels presque transparents, loin de la silhouette.
CLEAN_HALO = {"EpeisteSansArmure"}


def without_halo(image: Image.Image) -> Image.Image:
    """Garde seulement les pixels proches (6 px) d'un pixel bien opaque."""
    alpha = image.getchannel("A")
    solid = alpha.point(lambda a: 255 if a >= 200 else 0)
    near = solid.filter(ImageFilter.MaxFilter(13))
    cleaned = Image.composite(alpha, Image.new("L", image.size, 0), near)
    result = image.copy()
    result.putalpha(cleaned)
    return result


def prepare(source: Path) -> Path:
    image = Image.open(source).convert("RGBA")
    if source.stem in CLEAN_HALO:
        image = without_halo(image)
    image = image.crop(image.getbbox())
    width = round(image.width * HEIGHT / image.height)
    image = image.resize((width, HEIGHT), Image.LANCZOS)
    target = TARGET / f"{source.stem}.webp"
    image.save(target, "WEBP", quality=QUALITY, method=6)
    return target


def main() -> None:
    TARGET.mkdir(parents=True, exist_ok=True)
    total = 0
    for source in sorted(SOURCE.glob("*.png")):
        target = prepare(source)
        size = target.stat().st_size
        total += size
        print(f"{source.name:28} {source.stat().st_size // 1024:5} ko → {target.name:28} {size // 1024:3} ko")
    print(f"Total publié : {total // 1024} ko")


if __name__ == "__main__":
    main()
