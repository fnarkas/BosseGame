/**
 * Microphone button for the speech minigames.
 *
 * The child cannot read, so the microphone's state is never written out: it
 * is shown on the button itself.
 *
 *   idle        grey button, 🎤            tap to talk / waiting
 *   listening   red button, pulsing ring   the microphone is open, read now
 *   evaluating  amber button, solid ring   heard you, checking
 *   correct     green button, ✅           heard the right word
 *   wrong       red button, ❌             heard something else
 *   blocked     grey button, 🚫            microphone unavailable or denied
 *
 * The button starts non-interactive; call enable() once speech recognition
 * exists. Everything created here goes into owner.uiElements and the pulse
 * tween is owner-tracked, so the mode's cleanup() tears it all down.
 */

export const MIC_COLORS = {
    IDLE: 0x95A5A6,
    LISTENING: 0xE74C3C,
    EVALUATING: 0xF39C12,
    CORRECT: 0x27AE60,
    WRONG: 0xE74C3C,
    BLOCKED: 0x95A5A6
};

const STYLES = {
    idle:       { fill: MIC_COLORS.IDLE,       emoji: '🎤', ring: null },
    listening:  { fill: MIC_COLORS.LISTENING,  emoji: '🎤', ring: 'pulse' },
    evaluating: { fill: MIC_COLORS.EVALUATING, emoji: '🎤', ring: 'solid' },
    correct:    { fill: MIC_COLORS.CORRECT,    emoji: '✅', ring: null },
    wrong:      { fill: MIC_COLORS.WRONG,      emoji: '❌', ring: null },
    blocked:    { fill: MIC_COLORS.BLOCKED,    emoji: '🚫', ring: null }
};

/**
 * @param {Phaser.Scene} scene
 * @param {BasePokeballGameMode} owner - the mode; supplies uiElements/addTween
 * @param {Object} options
 * @param {number} options.x
 * @param {number} options.y
 * @param {number} [options.size=150] - button diameter
 * @param {Function} options.onTap - called on every tap while enabled
 */
export function createMicButton(scene, owner, { x, y, size = 150, onTap }) {
    const ring = scene.add.circle(x, y, size / 2 + 14, 0x000000, 0);
    ring.setStrokeStyle(8, MIC_COLORS.LISTENING, 1);
    ring.setVisible(false);

    const button = scene.add.circle(x, y, size / 2, MIC_COLORS.IDLE, 1);
    button.setStrokeStyle(6, 0xFFFFFF);

    const emoji = scene.add.text(x, y, '🎤', {
        fontSize: '80px',
        padding: { y: 20 }
    }).setOrigin(0.5);

    owner.uiElements.push(ring, button, emoji);

    let state = 'idle';
    let ringTween = null;

    const alive = () => !!button.scene;

    function stopRing() {
        if (ringTween) {
            ringTween.stop();
            owner.pendingTweens.delete(ringTween);
            ringTween = null;
        }
        if (ring.scene) {
            ring.setVisible(false);
            ring.setScale(1);
            ring.setAlpha(1);
        }
    }

    function showRing(kind, color) {
        if (!ring.scene) return;
        ring.setStrokeStyle(8, color, 1);
        ring.setVisible(true);
        ring.setScale(1);
        ring.setAlpha(1);
        if (kind === 'pulse') {
            ringTween = owner.addTween(scene, {
                targets: ring,
                scale: 1.35,
                alpha: 0.15,
                duration: 650,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut'
            });
        }
    }

    const api = {
        button,
        emoji,
        ring,
        get state() { return state; },

        setState(next) {
            const style = STYLES[next];
            if (!style || !alive()) return;
            state = next;
            stopRing();
            button.setFillStyle(style.fill, 1);
            if (emoji.scene && emoji.text !== style.emoji) emoji.setText(style.emoji);
            if (style.ring) showRing(style.ring, style.fill);
        },

        enable() {
            if (!alive()) return;
            button.setInteractive({ useHandCursor: true });
            button.off('pointerdown');
            button.on('pointerdown', () => onTap());
        },

        disable() {
            if (alive()) button.disableInteractive();
        }
    };

    return api;
}
