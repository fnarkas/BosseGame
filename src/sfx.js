// Tiny synthesised sound effects (no audio files needed).
//
// A non-reader needs to *hear* right/wrong, not just see a 😢. These chimes
// are generated with the Web Audio context Phaser already owns, so they cost
// nothing to load and respect the game's volume/mute settings. They silently
// do nothing where Web Audio isn't available (or is still locked before the
// first tap on iOS).

const PATTERNS = {
    // C5 E5 G5 rising: "yes!"
    correct: { notes: [[523.25, 0], [659.25, 0.09], [783.99, 0.18]], noteLength: 0.16, type: 'sine', volume: 0.18 },
    // A3 → F3 falling: gentle "hmm, try again"
    wrong: { notes: [[220, 0], [174.61, 0.14]], noteLength: 0.2, type: 'triangle', volume: 0.14 },
    // C5 E5 G5 C6 fanfare: streak milestone / reward
    fanfare: { notes: [[523.25, 0], [659.25, 0.08], [783.99, 0.16], [1046.5, 0.26]], noteLength: 0.22, type: 'square', volume: 0.09 },
    // short tick for UI taps
    tick: { notes: [[880, 0]], noteLength: 0.05, type: 'sine', volume: 0.08 }
};

function audioContextOf(scene) {
    const manager = scene && scene.sound;
    const ctx = manager && manager.context;
    if (!ctx || typeof ctx.createOscillator !== 'function' || typeof ctx.createGain !== 'function') return null;
    if (ctx.state && ctx.state !== 'running') return null;
    return ctx;
}

/**
 * Play a named chime. Returns true if it was scheduled.
 * @param {Phaser.Scene} scene
 * @param {'correct'|'wrong'|'fanfare'|'tick'} kind
 */
export function playChime(scene, kind) {
    const pattern = PATTERNS[kind];
    const ctx = audioContextOf(scene);
    if (!pattern || !ctx) return false;
    const manager = scene.sound;
    if (manager.mute) return false;
    const masterVolume = Number.isFinite(manager.volume) ? manager.volume : 1;
    if (masterVolume <= 0) return false;

    try {
        const now = ctx.currentTime;
        for (const [freq, offset] of pattern.notes) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = pattern.type;
            osc.frequency.value = freq;
            const start = now + offset;
            const end = start + pattern.noteLength;
            gain.gain.setValueAtTime(0.0001, start);
            gain.gain.exponentialRampToValueAtTime(pattern.volume * masterVolume, start + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.0001, end);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(start);
            osc.stop(end + 0.02);
        }
        return true;
    } catch (error) {
        return false;
    }
}
