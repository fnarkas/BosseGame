import { defineConfig } from 'vite';

// NOTE: Don't run 'npm run dev' automatically - the user runs the server themselves
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    rollupOptions: {
      output: {
        manualChunks: {
          phaser: ['phaser']
        }
      }
    }
  },
  server: {
    port: 5173,
    open: true
  }
});
