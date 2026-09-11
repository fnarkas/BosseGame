import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { gameApiPlugin } from './server/vitePlugin.js';

// NOTE: Don't run 'npm run dev' automatically - the user runs the server themselves
export default defineConfig({
  base: './',
  plugins: [
    basicSsl(), // Enables HTTPS for speech recognition API
    gameApiPlugin() // Accounts, saved state and per-account config in data/game.db (see server/)
  ],
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
