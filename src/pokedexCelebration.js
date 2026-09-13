// The big celebration for a completed Pokedex.
//
// Shown by MainGameScene when every unlocked Pokemon has been caught, right
// after the next batch has been unlocked (see pokemonPool.js): fireworks and
// confetti over a dark backdrop, a trophy, the number of caught Pokemon, a
// spoken "grattis" in Swedish, then a parade of the first newly unlocked
// Pokemon flying in, and finally a big ✅ that ends the show. No text beyond
// the numbers: the player can't read, and numbers are learning content.

import Phaser from 'phaser';
import { playChime } from './sfx.js';
import { playAudio } from './audio.js';
import { ensureAssets } from './lazyLoad.js';
import { audioPack, pokemonImageAsset } from './assetManifest.js';
import { ensureStarTexture } from './pokeballGameModes/uiKit.js';

const DEPTH = 900;
const PARADE_COUNT = 5;
const CONFETTI_TEXTURE = 'celebration-confetti';
const FIREWORK_COLORS = [0xFF5252, 0xFFD740, 0x69F0AE, 0x40C4FF, 0xE040FB, 0xFF6E40, 0xFFFFFF];
const TIMING = {
    FIREWORK_INTERVAL: 320,
    TROPHY: 200,
    COUNT: 700,
    VOICE: 900,
    PARADE: 2600,
    PARADE_STAGGER: 260,
    BUTTON_AFTER_PARADE: 700
};

function ensureConfettiTexture(scene) {
    if (scene.textures.exists(CONFETTI_TEXTURE)) return CONFETTI_TEXTURE;
    const g = scene.add.graphics();
    g.fillStyle(0xFFFFFF, 1);
    g.fillRect(0, 0, 10, 16);
    g.generateTexture(CONFETTI_TEXTURE, 10, 16);
    g.destroy();
    return CONFETTI_TEXTURE;
}

/**
 * Play the celebration and call `onDone` once the player taps the ✅.
 * @param {Phaser.Scene} scene
 * @param {{ completedCount: number, batch: { from: number, to: number, pokemon: Array } }} info
 * @param {Function} onDone
 * @returns {Promise<void>} resolves when the show is on screen (assets loaded)
 */
export function showPokedexCelebration(scene, { completedCount, batch }, onDone) {
    const parade = (batch && batch.pokemon ? batch.pokemon : []).slice(0, PARADE_COUNT);
    const assets = {
        audio: audioPack('celebration'),
        images: parade.map(p => pokemonImageAsset(p))
    };
    return ensureAssets(scene, assets)
        .catch(error => console.warn('Celebration assets failed to load, celebrating anyway:', error))
        .then(() => runShow(scene, { completedCount, batch, parade }, onDone));
}

function runShow(scene, { completedCount, batch, parade }, onDone) {
    const width = scene.cameras.main.width;
    const height = scene.cameras.main.height;
    const objects = [];
    const timers = [];
    let finished = false;

    const keep = (obj) => { objects.push(obj); return obj; };
    const later = (ms, fn) => { timers.push(scene.time.delayedCall(ms, fn)); };

    // Backdrop
    const overlay = keep(scene.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0));
    overlay.setDepth(DEPTH).setInteractive();
    scene.tweens.add({ targets: overlay, fillAlpha: 0.78, duration: 400 });

    // Fireworks: one emitter, a burst at a new spot every few hundred ms
    const starKey = ensureStarTexture(scene);
    const fireworks = keep(scene.add.particles(0, 0, starKey, {
        speed: { min: 150, max: 420 },
        angle: { min: 0, max: 360 },
        scale: { start: 1.8, end: 0 },
        lifespan: { min: 700, max: 1100 },
        gravityY: 120,
        blendMode: 'ADD',
        emitting: false
    }));
    fireworks.setDepth(DEPTH + 1);
    const burst = () => {
        if (finished) return;
        const x = Phaser.Math.Between(width * 0.1, width * 0.9);
        const y = Phaser.Math.Between(height * 0.08, height * 0.55);
        fireworks.setParticleTint(Phaser.Utils.Array.GetRandom(FIREWORK_COLORS));
        fireworks.explode(Phaser.Math.Between(30, 50), x, y);
        playChime(scene, 'tick');
        later(TIMING.FIREWORK_INTERVAL, burst);
    };
    burst();

    // Confetti raining from the top for the whole show
    const confetti = keep(scene.add.particles(0, -20, ensureConfettiTexture(scene), {
        x: { min: 0, max: width },
        speedY: { min: 120, max: 320 },
        speedX: { min: -60, max: 60 },
        gravityY: 120,
        rotate: { start: 0, end: 720 },
        scale: { min: 0.6, max: 1.3 },
        alpha: { start: 1, end: 0.6 },
        lifespan: 4500,
        frequency: 35,
        tint: FIREWORK_COLORS
    }));
    confetti.setDepth(DEPTH + 1);

    // Fanfare, three times
    playChime(scene, 'fanfare');
    later(700, () => playChime(scene, 'fanfare'));
    later(1400, () => playChime(scene, 'fanfare'));
    later(TIMING.VOICE, () => { if (!finished) playAudio(scene, 'celebration_audio_all_caught'); });

    // Trophy
    const trophy = keep(scene.add.text(width / 2, height * 0.28, '🏆', { fontSize: '200px', padding: { y: 40 } }));
    trophy.setOrigin(0.5).setDepth(DEPTH + 2).setScale(0);
    later(TIMING.TROPHY, () => {
        scene.tweens.add({ targets: trophy, scale: 1, duration: 700, ease: 'Back.easeOut' });
        scene.tweens.add({ targets: trophy, angle: { from: -6, to: 6 }, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: 700 });
    });

    // The number of caught Pokemon, big; grows to the new total when the
    // parade arrives so "more to catch" is visible without words.
    const count = keep(scene.add.text(width / 2, height * 0.55, String(completedCount), {
        fontSize: '140px', fontFamily: 'Arial', fontStyle: 'bold', color: '#FFD700',
        stroke: '#000000', strokeThickness: 12, padding: { y: 20 }
    }));
    count.setOrigin(0.5).setDepth(DEPTH + 2).setScale(0).setData('celebrationCount', true);
    later(TIMING.COUNT, () => {
        scene.tweens.add({ targets: count, scale: 1, duration: 600, ease: 'Back.easeOut' });
    });

    // Parade of the newly unlocked Pokemon
    const slotWidth = Math.min(200, width / (PARADE_COUNT + 1));
    const paradeY = height * 0.8;
    const paradeStartX = width / 2 - ((parade.length - 1) * slotWidth) / 2;
    parade.forEach((pokemon, index) => {
        later(TIMING.PARADE + index * TIMING.PARADE_STAGGER, () => {
            if (finished) return;
            const info = pokemonImageAsset(pokemon);
            if (!info || !scene.textures.exists(info.key)) return;
            const sprite = keep(scene.add.image(width + 200, paradeY, info.key));
            sprite.setDepth(DEPTH + 3).setDisplaySize(slotWidth * 0.9, slotWidth * 0.9).setData('celebrationParade', pokemon.id);
            scene.tweens.add({
                targets: sprite, x: paradeStartX + index * slotWidth, duration: 700, ease: 'Back.easeOut',
                onComplete: () => {
                    if (finished || !sprite.scene) return;
                    scene.tweens.add({ targets: sprite, y: paradeY - 14, duration: 350, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
                }
            });
            if (index === 0) {
                // Move the count up out of the way and show the new total
                scene.tweens.add({ targets: count, y: height * 0.5, duration: 400 });
                scene.tweens.add({ targets: count, scale: 1.3, duration: 250, yoyo: true });
                later(250, () => { if (batch && count.scene) count.setText(String(batch.to)); });
            }
        });
    });

    // Big ✅ to continue
    const buttonDelay = TIMING.PARADE + parade.length * TIMING.PARADE_STAGGER + TIMING.BUTTON_AFTER_PARADE;
    later(buttonDelay, () => {
        if (finished) return;
        const bx = width / 2;
        const by = height * 0.93;
        const button = keep(scene.add.rectangle(bx, by, 260, 100, 0x4CAF50).setStrokeStyle(4, 0x000000));
        button.setDepth(DEPTH + 4).setScale(0).setData('celebrationContinue', true);
        const label = keep(scene.add.text(bx, by, '✅', { fontSize: '64px', padding: { y: 10 } }));
        label.setOrigin(0.5).setDepth(DEPTH + 5).setScale(0);
        scene.tweens.add({ targets: [button, label], scale: 1, duration: 400, ease: 'Back.easeOut' });
        button.setInteractive({ useHandCursor: true });
        button.on('pointerdown', finish);
    });

    function finish() {
        if (finished) return;
        finished = true;
        for (const timer of timers) {
            if (timer && timer.remove) timer.remove(false);
        }
        for (const obj of objects) {
            if (!obj || !obj.scene) continue;
            scene.tweens.killTweensOf(obj);
            if (obj.stop) obj.stop();
            obj.destroy();
        }
        objects.length = 0;
        if (onDone) onDone();
    }

    return finish;
}
