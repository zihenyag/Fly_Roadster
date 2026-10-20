import { defineConfig } from 'vite';
export default defineConfig({
  build:{rollupOptions:{output:{manualChunks:{physics:['@dimforge/rapier3d-compat'],graphics:['three']}}}},
});
