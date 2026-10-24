import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Le dossier assets/ (sprites dans assets/unites/) est servi tel quel à la racine du site.
  publicDir: 'assets',
  build: {
    // Phaser pèse à lui seul environ 1,2 Mo minifié : on relève le seuil d'avertissement.
    chunkSizeWarningLimit: 1500,
  },
  test: {
    // Les tests portent sur le moteur, TypeScript pur : pas besoin de navigateur.
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Pas de cache disque des modules transformés : il fige le résultat de import.meta.glob,
    // et le garde-fou d'architecture ne verrait pas un nouveau fichier ajouté à src/engine/.
    fsModuleCache: false,
  },
});
