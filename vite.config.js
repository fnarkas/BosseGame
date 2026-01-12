import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import fs from 'fs';
import path from 'path';

// Custom plugin to handle config updates
function configManagerPlugin() {
  return {
    name: 'config-manager',
    configureServer(server) {
      server.middlewares.use('/api/config/save', async (req, res, next) => {
        if (req.method === 'POST') {
          let body = '';
          req.on('data', chunk => {
            body += chunk.toString();
          });
          req.on('end', () => {
            try {
              const config = JSON.parse(body);
              const configPath = path.resolve(__dirname, 'public/config/minigames.json');

              // Ensure config directory exists
              const configDir = path.dirname(configPath);
              if (!fs.existsSync(configDir)) {
                fs.mkdirSync(configDir, { recursive: true });
              }

              // Write config file
              fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true }));
            } catch (error) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: false, error: error.message }));
            }
          });
        } else {
          next();
        }
      });
    }
  };
}

// NOTE: Don't run 'npm run dev' automatically - the user runs the server themselves
export default defineConfig({
  base: './',
  plugins: [
    basicSsl(), // Enables HTTPS for speech recognition API
    configManagerPlugin() // Handles config file updates
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
