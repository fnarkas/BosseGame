// On-demand asset loading through a scene's loader.
//
// `ensureAssets(scene, { images, audio })` resolves once every listed key is
// in the texture/audio cache, loading only the missing ones. While something
// is actually downloading a small spinning ⏳ is shown (no text: the player
// can't read). Resolves `false` when nothing had to be loaded.

import { audioPacks } from './assetManifest.js';

function showSpinner(scene) {
    if (!scene.add || !scene.cameras) return null;
    const w = scene.cameras.main.width;
    const h = scene.cameras.main.height;
    const spinner = scene.add.text(w / 2, h / 2, '⏳', { fontSize: '96px', padding: { y: 20 } }).setOrigin(0.5).setDepth(5000);
    const tween = scene.tweens && scene.tweens.add ? scene.tweens.add({
        targets: spinner, angle: 360, duration: 1200, repeat: -1
    }) : null;
    return { spinner, tween };
}

function hideSpinner(handle) {
    if (!handle) return;
    if (handle.tween && handle.tween.stop) handle.tween.stop();
    if (handle.spinner && handle.spinner.scene) handle.spinner.destroy();
}

export function ensureAssets(scene, { images = [], audio = [], spinner = true } = {}) {
    const needImages = images.filter(a => a && !scene.textures.exists(a.key));
    const needAudio = audio.filter(a => a && !scene.cache.audio.exists(a.key));
    if (needImages.length === 0 && needAudio.length === 0) return Promise.resolve(false);

    return new Promise(resolve => {
        const handle = spinner ? showSpinner(scene) : null;
        needImages.forEach(a => scene.load.image(a.key, a.url));
        needAudio.forEach(a => scene.load.audio(a.key, a.url));

        const done = () => {
            scene.load.off('complete', done);
            hideSpinner(handle);
            resolve(true);
        };
        scene.load.once('complete', done);
        scene.load.start();
    });
}

export function ensureAudioPacks(scene, packNames = [], options = {}) {
    return ensureAssets(scene, { audio: audioPacks(packNames), ...options });
}
