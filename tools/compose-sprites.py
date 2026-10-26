#!/usr/bin/env python3
"""Fabrique par montage, à partir des originaux de art/unites/, les sprites qui manquent :

- ArcherPlates : l'archer en mailles, dont les mailles sont repeintes en plates d'acier
  (gamme de gris prise sur EpeistePlates, texture des mailles lissée, ombres en aplats) ;
- MainsNuesSansArmure : l'épéiste sans armure, épée effacée.

Les montages sont écrits dans art/unites/montages/ ; prepare-sprites.py en fait ensuite des
versions web comme pour les autres. Outil : Pillow et NumPy, hors du projet npm.

    python3 tools/compose-sprites.py
"""

from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "art" / "unites"
TARGET = SOURCE / "montages"


def load(name: str) -> np.ndarray:
    return np.asarray(Image.open(SOURCE / f"{name}.png").convert("RGBA")).astype(np.float32)


def saturation_and_value(rgba: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    rgb = rgba[..., :3]
    high = rgb.max(axis=2)
    low = rgb.min(axis=2)
    return (high - low) / np.maximum(high, 1), high / 255


def skin(rgba: np.ndarray) -> np.ndarray:
    r, g, b = rgba[..., 0], rgba[..., 1], rgba[..., 2]
    return (r > 120) & (r > g + 12) & (g > b + 4)


# --- Mains nues ---------------------------------------------------------------------------

# Lame repérée sur EpeisteSansArmure : de la pointe jusqu'au pommeau, sous la main.
BLADE_TIP = np.array([358.0, 34.0])
POMMEL = np.array([240.0, 205.0])
BLADE_HALF_WIDTH = 13.0
# La garde, en travers de la lame, et le poing qui la tient.
GUARD = (np.array([246.0, 157.0]), np.array([282.0, 183.0]), 7.0)
FIST = (np.array([255.0, 180.0]), 22.0)


def segment(points: np.ndarray, start: np.ndarray, end: np.ndarray, half_width: float) -> np.ndarray:
    """Les points à moins de half_width du segment [start, end] (bouts un peu prolongés)."""
    axis = end - start
    length = float(np.linalg.norm(axis))
    unit = axis / length
    rel = points - start
    along = rel @ unit
    across = np.abs(rel @ np.array([-unit[1], unit[0]]))
    return (along >= -4) & (along <= length + 4) & (across <= half_width)


def morph(mask: np.ndarray, *filters: ImageFilter.Filter) -> np.ndarray:
    image = Image.fromarray((mask * 255).astype(np.uint8))
    for f in filters:
        image = image.filter(f)
    return np.asarray(image) > 0


def bare_hands() -> Image.Image:
    rgba = load("EpeisteSansArmure")
    h, w = rgba.shape[:2]
    ys, xs = np.mgrid[0:h, 0:w]
    points = np.stack([xs, ys], axis=-1).astype(np.float32)
    guard_from, guard_to, guard_half_width = GUARD
    zone = segment(points, BLADE_TIP, POMMEL, BLADE_HALF_WIDTH) | segment(points, guard_from, guard_to, guard_half_width)
    fist_center, fist_radius = FIST
    near_hand = np.linalg.norm(points - fist_center, axis=-1) <= fist_radius
    # Le poing refermé : la peau, trous de la poignée bouchés.
    fist = morph(skin(rgba), ImageFilter.MaxFilter(9), ImageFilter.MinFilter(9)) & near_hand
    hole = fist & ~skin(rgba)
    out = rgba.copy()
    out[..., :3][hole] = np.median(rgba[..., :3][skin(rgba) & near_hand], axis=0)
    out[..., 3][hole] = 255
    out[..., 3][zone & ~fist] = 0
    # Un trait neuf autour du poing, comme celui des originaux.
    contour = morph(fist, ImageFilter.MaxFilter(5)) & ~fist & zone
    out[..., :3][contour] = OUTLINE
    out[..., 3][contour] = 255
    fist = fist | contour
    # Les miettes laissées autour (bouts de trait de la garde) disparaissent.
    solid = morph(out[..., 3] > 0, ImageFilter.MinFilter(5), ImageFilter.MaxFilter(5))
    crumbs = morph(zone, ImageFilter.MaxFilter(13)) & ~solid & ~fist
    out[..., 3][crumbs] = 0
    return Image.fromarray(out.astype(np.uint8), "RGBA")


# --- Archer en plates ---------------------------------------------------------------------


def steel_palette() -> np.ndarray:
    """Cinq gris d'acier pris sur EpeistePlates (quantiles de luminosité des pixels neutres)."""
    plates = load("EpeistePlates")
    sat, val = saturation_and_value(plates)
    neutral = (plates[..., 3] > 200) & (sat < 0.15) & (val > 0.16)
    colors = plates[..., :3][neutral]
    lum = colors.mean(axis=1)
    order = np.argsort(lum)
    picks = [colors[order[int(q * (len(order) - 1))]] for q in (0.12, 0.35, 0.55, 0.75, 0.95)]
    return np.array(picks, dtype=np.float32)


def fraction(mask: np.ndarray, radius: int) -> np.ndarray:
    """Part des pixels du masque dans le voisinage de chaque pixel."""
    blurred = Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.BoxBlur(radius))
    return np.asarray(blurred).astype(np.float32) / 255


# Les plumes des flèches, grises elles aussi, sont dans ce coin du carquois : on les laisse.
QUIVER = (0, 0, 75, 110)


def mail_mask(rgba: np.ndarray) -> np.ndarray:
    """Les mailles : là où dominent les gris neutres, loin des couleurs (peau, cuir, bois)."""
    sat, val = saturation_and_value(rgba)
    opaque = rgba[..., 3] > 200
    grey = opaque & (sat < 0.12) & (val > 0.27)
    colored = opaque & (sat > 0.2) & (val > 0.24)
    mask = opaque & (fraction(grey, 5) > 0.3) & (fraction(colored, 4) < 0.08)
    image = Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.MinFilter(3))
    mask = (np.asarray(image) > 0) & opaque
    left, top, right, bottom = QUIVER
    mask[top:bottom, left:right] = False
    return mask


def archer_plates() -> Image.Image:
    rgba = load("ArcherMailles")
    mask = mail_mask(rgba)
    palette = steel_palette()
    # La texture des mailles est lissée ; il ne reste que le modelé général.
    lum = rgba[..., :3].mean(axis=2)
    smooth = np.asarray(Image.fromarray(lum.astype(np.uint8)).filter(ImageFilter.GaussianBlur(6))).astype(np.float32)
    low, high = np.percentile(smooth[mask], [5, 95])
    level = np.clip((smooth - low) / max(high - low, 1), 0, 1)
    # Des aplats francs, comme le métal d'EpeistePlates, aux bords adoucis.
    band = np.minimum((level * len(palette)).astype(int), len(palette) - 1)
    steel = Image.fromarray(palette[band].astype(np.uint8)).filter(ImageFilter.GaussianBlur(1))
    steel = np.asarray(steel).astype(np.float32)
    # Un contour sombre autour des masses de métal, comme le trait des originaux.
    inner = np.asarray(Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(5))) > 0
    # Les plaques se chevauchent : un joint sombre, puis un liseré clair, toutes les LAME lignes.
    rows = np.arange(mask.shape[0])[:, None]
    joint = (rows % LAME == 0) & inner
    rim = (rows % LAME == 1) & inner
    out = rgba.copy()
    out[..., :3][mask] = steel[mask]
    out[..., :3][joint] = palette[0]
    out[..., :3][rim] = palette[-1]
    out[..., :3][mask & ~inner] = OUTLINE
    return Image.fromarray(out.astype(np.uint8), "RGBA")


OUTLINE = np.array([28.0, 28.0, 32.0])
LAME = 16


def main() -> None:
    TARGET.mkdir(parents=True, exist_ok=True)
    for name, image in (("ArcherPlates", archer_plates()), ("MainsNuesSansArmure", bare_hands())):
        path = TARGET / f"{name}.png"
        image.save(path)
        print(f"{path.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
