import { describe, it, expect } from 'vitest';
import { getAssetRegistry, assetFileExists } from './helpers/assets.js';

// Every asset BootScene queues must exist on disk, otherwise the browser logs a
// 404 and any mode that plays/shows it breaks at runtime.
describe('BootScene assets', () => {
    const registry = getAssetRegistry();

    it('loads every image file that exists on disk', () => {
        const missing = [...registry.images.entries()].filter(([, file]) => !assetFileExists(file));
        expect(missing).toEqual([]);
    });

    it('loads every audio file that exists on disk', () => {
        const missing = [...registry.audio.entries()].filter(([, file]) => !assetFileExists(file));
        expect(missing).toEqual([]);
    });
});
