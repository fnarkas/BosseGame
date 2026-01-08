import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

// NOTE: Don't run 'npm run dev' automatically - the user runs the server themselves
export default defineConfig({
  base: './',
  plugins: [
    basicSsl() // Enables HTTPS for speech recognition API
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
