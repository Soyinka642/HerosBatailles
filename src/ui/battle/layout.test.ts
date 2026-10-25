import { describe, expect, it } from 'vitest';
import { HEX_SIZE, HEX_WIDTH, MARGIN, ROW_STEP, cellCenter, fieldSize, hexCorners } from './layout';

describe('géométrie de l’écran', () => {
  it('les rangées impaires sont décalées d’un demi-hexagone vers l’est', () => {
    const even = cellCenter({ col: 3, row: 2 });
    const odd = cellCenter({ col: 3, row: 1 });
    expect(odd.x - even.x).toBeCloseTo(HEX_WIDTH / 2);
    expect(even.y - odd.y).toBeCloseTo(ROW_STEP);
  });

  it('deux cases voisines sont à une largeur d’hexagone', () => {
    const a = cellCenter({ col: 2, row: 2 });
    const b = cellCenter({ col: 2, row: 1 }); // NE de (2,2) en rangée paire
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeCloseTo(HEX_WIDTH);
  });

  it('six sommets à la bonne distance, la pointe en haut', () => {
    const corners = hexCorners({ x: 0, y: 0 });
    expect(corners).toHaveLength(6);
    expect(corners[0]!.x).toBeCloseTo(0);
    expect(corners[0]!.y).toBeCloseTo(-HEX_SIZE);
  });

  it('le canevas contient tout le terrain', () => {
    const size = fieldSize(12, 5);
    const last = cellCenter({ col: 11, row: 3 });
    expect(last.x + HEX_WIDTH / 2).toBeLessThanOrEqual(size.width - MARGIN.right + 1);
    expect(cellCenter({ col: 0, row: 4 }).y + HEX_SIZE).toBeLessThanOrEqual(size.height - MARGIN.bottom + 1);
  });
});
