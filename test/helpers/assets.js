// Asset registry built by running the real BootScene.preload() against a fake
// loader. This gives the test scene the exact set of texture/audio keys the game
// loads, so a mode that plays an audio key or uses an image that BootScene never
// loaded fails in the test, just as it would in the browser.
import fs from 'fs';
import path from 'path';
import { BootScene } from '../../src/scenes/BootScene.js';

const PUBLIC_DIR = path.resolve(__dirname, '../../public');

let cached = null;

export function getAssetRegistry() {
    if (cached) return cached;

    const images = new Map();
    const audio = new Map();
    const noop = () => {};
    const fakeGraphics = {
        fillStyle: noop, fillRect: noop, clear: noop, destroy: noop,
        lineStyle: noop, strokeRect: noop
    };
    const fakeThis = {
        cameras: { main: { width: 1280, height: 900 } },
        add: {
            text: () => ({ setOrigin: noop, destroy: noop }),
            graphics: () => fakeGraphics
        },
        load: {
            on: noop,
            image: (key, file) => images.set(key, file),
            audio: (key, file) => audio.set(key, file)
        },
        cache: { audio: { exists: (key) => audio.has(key) } }
    };
    // Bind the real preload helpers onto the fake scene.
    for (const name of Object.getOwnPropertyNames(BootScene.prototype)) {
        if (name !== 'constructor') fakeThis[name] = BootScene.prototype[name];
    }
    fakeThis.preload();

    // Textures BootScene generates at runtime in create().
    const generated = ['game-wheel', 'game-wheel-base', 'wheel-pointer'];
    for (let i = 1; i <= 15; i++) generated.push(`dice-face-${i}`);

    cached = { images, audio, generatedTextures: generated, publicDir: PUBLIC_DIR };
    return cached;
}

// Everything the game loads must live under public/ so that both the dev
// server and `vite build` serve it.
export function assetFileExists(relativePath) {
    const decoded = decodeURIComponent(relativePath);
    return fs.existsSync(path.join(PUBLIC_DIR, decoded));
}
