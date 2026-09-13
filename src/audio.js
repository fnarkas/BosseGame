// Safe sound playback.
//
// Phaser's sound manager throws when asked to play a key that isn't in the
// audio cache. A missing mp3 (a word without audio, a typo in a key) would
// otherwise blow up inside a tap handler and leave the child with a frozen
// button. Every play in the game goes through here instead: unknown keys are
// logged once and skipped, and the caller gets `null` back so it can still
// schedule whatever comes next.

const warned = new Set();

export function hasAudio(scene, key) {
    return !!(scene && scene.cache && scene.cache.audio && scene.cache.audio.exists(key));
}

// Play `key` and return the Sound, or null if the key isn't loaded.
export function playAudio(scene, key, config) {
    if (!hasAudio(scene, key)) {
        if (!warned.has(key)) {
            warned.add(key);
            console.warn(`Audio key "${key}" is not loaded; skipping playback`);
        }
        return null;
    }
    try {
        const sound = scene.sound.add(key, config);
        sound.once('complete', () => sound.destroy());
        sound.play();
        return sound;
    } catch (error) {
        console.warn(`Failed to play audio "${key}":`, error);
        return null;
    }
}

// Duration in seconds of a loaded sound, or `fallback` if unknown. Used to
// stitch clips (e.g. "två hundra" + "fyrtiofem") with a natural gap.
export function audioDuration(scene, key, fallback = 0.5) {
    if (!hasAudio(scene, key)) return fallback;
    try {
        const sound = scene.sound.add(key);
        const duration = sound.duration;
        sound.destroy();
        return Number.isFinite(duration) && duration > 0 ? duration : fallback;
    } catch (error) {
        return fallback;
    }
}

export function stopAudio(sound) {
    if (!sound) return;
    try {
        if (sound.isPlaying) sound.stop();
        sound.destroy();
    } catch (error) {
        // Already destroyed; nothing to do.
    }
}

// ---------------------------------------------------------------------------
// Audio key builders (shared by the number/clock modes and the Pokedex)
// ---------------------------------------------------------------------------

// Keys that say `number` (0-1099): one clip for 0-99, hundreds + remainder
// above that (245 -> "tvåhundra" + "fyrtiofem", 1025 -> "tusen" + "tjugofem").
// Unknown values yield [].
export function numberAudioKeys(number) {
    const n = Number(number);
    if (!Number.isInteger(n)) return [];
    if (n >= 0 && n <= 99) return [`number_audio_${n}`];
    if (n >= 100 && n <= 1099) {
        const hundreds = Math.floor(n / 100) * 100;
        const remainder = n % 100;
        return remainder > 0
            ? [`number_audio_${hundreds}`, `number_audio_${remainder}`]
            : [`number_audio_${hundreds}`];
    }
    return [];
}

// Key for "klockan <hour>" or "klockan halv ...", whole and half hours only.
export function clockAudioKey(hour, minute = 0) {
    return minute === 30 ? `clock_audio_${hour}_30` : `clock_audio_${hour}`;
}
