#!/usr/bin/env python3
"""Prépare les versions web des sprites : art/unites/*.png (originaux, non publiés)
→ assets/unites/*.webp (publiés avec le site).

Chaque sprite est d'abord nettoyé des restes du détourage (pixels presque transparents, liseré
blanc du fond d'origine, petits trous, halo loin de la silhouette, îlots isolés), puis recadré sur sa silhouette, ramené à HEIGHT pixels de haut (deux fois la
taille affichée, pour rester net sur les écrans à haute densité) et enregistré en WebP avec
transparence. Outils : Pillow et NumPy, utilisés hors du projet npm. À relancer après l'ajout d'un sprite :

    python3 tools/prepare-sprites.py
"""

from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "art" / "unites"
TARGET = ROOT / "assets" / "unites"
HEIGHT = 200
QUALITY = 85
# En dessous de cette opacité, un pixel est un reste du détourage.
FAINT = 48
# Un pixel plus clair que cela, et gris, au contact du dehors : reste du fond blanc.
MATTE = 140
# Un trou enfermé dans la silhouette plus petit que cela (en pixels) est rebouché.
HOLE = 100
# Un îlot plus petit que cette part de la plus grande masse est un reste du détourage.
ISLAND = 0.02


def without_halo(alpha: np.ndarray) -> np.ndarray:
    """Garde seulement les pixels proches (6 px) d'un pixel bien opaque."""
    solid = Image.fromarray(np.where(alpha >= 200, 255, 0).astype(np.uint8))
    near = np.asarray(solid.filter(ImageFilter.MaxFilter(13))) > 0
    return np.where(near, alpha, 0)


def components(mask: np.ndarray) -> list[list[tuple[int, int]]]:
    """Les masses de pixels qui se touchent (y compris en diagonale)."""
    h, w = mask.shape
    seen = np.zeros_like(mask)
    found = []
    for y, x in zip(*np.nonzero(mask)):
        if seen[y, x]:
            continue
        seen[y, x] = True
        queue = deque([(int(y), int(x))])
        pixels = []
        while queue:
            cy, cx = queue.popleft()
            pixels.append((cy, cx))
            for ny in range(max(cy - 1, 0), min(cy + 2, h)):
                for nx in range(max(cx - 1, 0), min(cx + 2, w)):
                    if mask[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True
                        queue.append((ny, nx))
        found.append(pixels)
    return found


def without_islands(alpha: np.ndarray) -> np.ndarray:
    parts = components(alpha > 0)
    largest = max(len(p) for p in parts)
    result = alpha.copy()
    for part in parts:
        if len(part) < largest * ISLAND:
            ys, xs = zip(*part)
            result[list(ys), list(xs)] = 0
    return result


def without_matte(rgba: np.ndarray, alpha: np.ndarray) -> np.ndarray:
    """Efface le liseré clair laissé par le fond blanc d'origine : les pixels clairs et gris
    qu'on atteint depuis le bord de l'image sans franchir le trait sombre du contour."""
    rgb = rgba[..., :3].astype(np.int32)
    light = (rgb.min(axis=2) >= MATTE) & (rgb.max(axis=2) - rgb.min(axis=2) <= 24)
    passable = (alpha == 0) | light
    h, w = alpha.shape
    result = alpha.copy()
    for part in components(passable):
        if any(y in (0, h - 1) or x in (0, w - 1) for y, x in part):
            ys, xs = zip(*part)
            result[list(ys), list(xs)] = 0
    return result


def without_holes(alpha: np.ndarray) -> np.ndarray:
    """Rebouche les petits trous du détourage enfermés dans la silhouette (reflets des plates
    rendus transparents) : la couleur d'origine est restée sous la transparence."""
    h, w = alpha.shape
    result = alpha.copy()
    for part in components(alpha < 200):
        enclosed = not any(y in (0, h - 1) or x in (0, w - 1) for y, x in part)
        if enclosed and len(part) < HOLE:
            ys, xs = zip(*part)
            result[list(ys), list(xs)] = 255
    return result


def cleaned(image: Image.Image) -> Image.Image:
    alpha = np.asarray(image.getchannel("A")).copy()
    alpha[alpha < FAINT] = 0
    alpha = without_holes(without_matte(np.asarray(image), alpha))
    alpha = without_islands(without_halo(alpha))
    result = image.copy()
    result.putalpha(Image.fromarray(alpha.astype(np.uint8)))
    return result


def prepare(source: Path) -> Path:
    image = Image.open(source).convert("RGBA")
    image = cleaned(image)
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
