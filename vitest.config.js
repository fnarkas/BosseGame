import { defineConfig } from 'vitest/config';
import path from 'path';

// Separate config from vite.config.js so the SSL plugin and the config-save
// middleware never load under test. Phaser needs a real browser (canvas, WebGL,
// window); the tests run against a small fake of the parts the game modes use.
export default defineConfig({
    resolve: {
        alias: {
            phaser: path.resolve(__dirname, 'test/helpers/fakePhaser.js')
        }
    },
    test: {
        environment: 'node',
        include: ['test/**/*.test.js'],
        setupFiles: ['test/helpers/setup.js'],
        testTimeout: 20000
    }
});
