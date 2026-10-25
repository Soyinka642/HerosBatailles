import { describe, expect, it } from 'vitest';
import { ahead, behind, formatCell, hexDistance, isOnField, neighbor, neighbors, sameCell, toCube } from './hex';

describe('coordonnées cubiques', () => {
  it('x + y + z = 0', () => {
    for (const cell of [{ col: 0, row: 0 }, { col: 3, row: 1 }, { col: 7, row: 4 }]) {
      const { x, y, z } = toCube(cell);
      expect(x + y + z).toBe(0);
    }
  });

  it('une rangée impaire est décalée d’un demi-hexagone vers l’est', () => {
    expect(toCube({ col: 0, row: 1 })).toEqual({ x: 0, y: -1, z: 1 });
    expect(toCube({ col: 0, row: 2 })).toEqual({ x: -1, y: -1, z: 2 });
  });
});

describe('distance', () => {
  it('vaut 0 sur la même case', () => {
    expect(hexDistance({ col: 4, row: 2 }, { col: 4, row: 2 })).toBe(0);
  });

  it('compte les cases le long d’une rangée', () => {
    expect(hexDistance({ col: 1, row: 3 }, { col: 9, row: 3 })).toBe(8);
  });

  it('une diagonale avance d’une colonne toutes les deux rangées', () => {
    // De (2,0) on atteint (3,2) en deux pas : SE (2,1) puis SE (3,2).
    expect(hexDistance({ col: 2, row: 0 }, { col: 3, row: 2 })).toBe(2);
    expect(hexDistance({ col: 2, row: 0 }, { col: 2, row: 4 })).toBe(4);
    expect(hexDistance({ col: 0, row: 0 }, { col: 5, row: 4 })).toBe(7);
  });

  it('est symétrique', () => {
    expect(hexDistance({ col: 5, row: 1 }, { col: 2, row: 4 })).toBe(hexDistance({ col: 2, row: 4 }, { col: 5, row: 1 }));
  });
});

describe('voisins', () => {
  it('rangée paire : E, NE, NW, W, SW, SE', () => {
    expect(neighbors({ col: 3, row: 2 })).toEqual([
      { col: 4, row: 2 },
      { col: 3, row: 1 },
      { col: 2, row: 1 },
      { col: 2, row: 2 },
      { col: 2, row: 3 },
      { col: 3, row: 3 },
    ]);
  });

  it('rangée impaire : E, NE, NW, W, SW, SE', () => {
    expect(neighbors({ col: 3, row: 1 })).toEqual([
      { col: 4, row: 1 },
      { col: 4, row: 0 },
      { col: 3, row: 0 },
      { col: 2, row: 1 },
      { col: 3, row: 2 },
      { col: 4, row: 2 },
    ]);
  });

  it('chaque voisin est à distance 1', () => {
    for (const cell of [{ col: 3, row: 2 }, { col: 3, row: 1 }]) {
      for (const n of neighbors(cell)) expect(hexDistance(cell, n)).toBe(1);
    }
  });

  it('un voisin est réciproque', () => {
    expect(neighbor(neighbor({ col: 5, row: 3 }, 'NE'), 'SW')).toEqual({ col: 5, row: 3 });
  });
});

describe('devant et derrière', () => {
  it('le joueur regarde vers le portail (est)', () => {
    expect(ahead({ col: 3, row: 1 }, 'player')).toEqual({ col: 4, row: 1 });
    expect(behind({ col: 3, row: 1 }, 'player')).toEqual({ col: 2, row: 1 });
  });

  it('l’ennemi regarde vers le campement (ouest)', () => {
    expect(ahead({ col: 3, row: 1 }, 'enemy')).toEqual({ col: 2, row: 1 });
    expect(behind({ col: 3, row: 1 }, 'enemy')).toEqual({ col: 4, row: 1 });
  });
});

describe('terrain', () => {
  const field = { width: 12, height: 5 };

  it('accepte les coins', () => {
    expect(isOnField(field, { col: 0, row: 0 })).toBe(true);
    expect(isOnField(field, { col: 11, row: 4 })).toBe(true);
  });

  it('refuse ce qui déborde', () => {
    expect(isOnField(field, { col: -1, row: 0 })).toBe(false);
    expect(isOnField(field, { col: 12, row: 0 })).toBe(false);
    expect(isOnField(field, { col: 0, row: 5 })).toBe(false);
    expect(isOnField(field, { col: 0, row: -1 })).toBe(false);
  });

  it('compare et écrit les cases', () => {
    expect(sameCell({ col: 1, row: 2 }, { col: 1, row: 2 })).toBe(true);
    expect(sameCell({ col: 1, row: 2 }, { col: 2, row: 1 })).toBe(false);
    expect(formatCell({ col: 1, row: 2 })).toBe('(1,2)');
  });
});
