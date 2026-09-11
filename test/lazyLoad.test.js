import { describe, it, expect } from 'vitest';
import { FakeScene } from './helpers/fakeScene.js';
import { ensureAssets, ensureAudioPacks } from '../src/lazyLoad.js';
import { AUDIO_PACKS, BOOT_AUDIO_PACKS, audioPacks, bootImages, pokemonImageAsset, pokemonAudioAsset, allAudioAssets } from '../src/assetManifest.js';
import { MINIGAMES } from '../src/minigameRegistry.js';
import { assetFileExists } from './helpers/assets.js';

describe('lazy asset loading', () => {
    it('loads only what is missing, shows a spinner meanwhile, and is a no-op afterwards', async () => {
        const scene = new FakeScene();
        const image = { key: 'zz_test_image', url: 'x.png' };
        const audio = { key: 'zz_test_audio', url: 'x.mp3' };
        expect(scene.textures.exists(image.key)).toBe(false);

        let resolved = null;
        const p = ensureAssets(scene, { images: [image, { key: 'coin-tiny', url: 'coin-tiny.png' }], audio: [audio] }).then(v => { resolved = v; });
        // The fake loader completes synchronously on start(), so the spinner has come and gone
        await p;
        expect(resolved).toBe(true);
        expect(scene.loadedAssets.map(a => a.key)).toEqual(['zz_test_image', 'zz_test_audio']);
        expect(scene.textures.exists(image.key)).toBe(true);
        expect(scene.cache.audio.exists(audio.key)).toBe(true);
        expect(scene.findText('⏳')).toBeNull();
        expect(scene.liveObjects()).toEqual([]);

        expect(await ensureAssets(scene, { images: [image], audio: [audio] })).toBe(false);
        expect(scene.loadedAssets).toHaveLength(2);
    });

    it('ignores null entries (unknown Pokemon) and unknown packs', async () => {
        const scene = new FakeScene();
        expect(pokemonImageAsset(99999)).toBeNull();
        expect(await ensureAssets(scene, { images: [pokemonImageAsset(99999)], audio: [pokemonAudioAsset(99999)] })).toBe(false);
        expect(await ensureAudioPacks(scene, ['no-such-pack'])).toBe(false);
    });
});

describe('asset manifest', () => {
    it('every audio pack a mode declares exists, and every manifest file is on disk', () => {
        for (const game of MINIGAMES) {
            for (const pack of game.audio || []) expect(AUDIO_PACKS[pack], `${game.key} -> ${pack}`).toBeTypeOf('function');
        }
        for (const pack of BOOT_AUDIO_PACKS) expect(AUDIO_PACKS[pack]).toBeTypeOf('function');
        const missing = [...bootImages(), ...allAudioAssets()].filter(a => !assetFileExists(a.url)).map(a => a.url);
        expect(missing).toEqual([]);
    });

    it('keeps the boot set small and puts the big packs behind the modes', () => {
        const boot = audioPacks(BOOT_AUDIO_PACKS);
        expect(boot.length).toBeLessThan(200);
        expect(audioPacks(['words']).length).toBeGreaterThan(400);
        expect(pokemonImageAsset(1)).toEqual({ key: 'pokemon_1', url: 'pokemon_images/001_bulbasaur.png' });
        expect(pokemonAudioAsset(150).url).toBe('pokemon_audio/150_mewtwo.mp3');
    });
});
