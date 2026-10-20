import { defineConfig } from 'vite';
export default defineConfig({
  base:'./',
  build:{rollupOptions:{output:{manualChunks:{physics:['@dimforge/rapier3d-compat'],graphics:['three']}}}},
});
