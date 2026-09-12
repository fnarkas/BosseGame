/**
 * Microphone session guard.
 *
 * Why this exists: on iOS/iPadOS, the first time a page opens the microphone
 * (getUserMedia or SpeechRecognition) WebKit flips Safari's audio session into
 * "play and record" mode. That mode runs through the voice-processing audio
 * unit, which attenuates output heavily. If a capture session is left dangling
 * the flip is never undone, and because the state lives in the tab's process it
 * even survives a page reload. The symptom is "the game suddenly gets very
 * quiet and stays that way".
 *
 * Rules enforced here:
 *  1. Never open the microphone eagerly. Speech modes must only start
 *     recognition when the child actually taps the mic. SpeechRecognition
 *     prompts for permission on its own, so getUserMedia is never needed.
 *  2. Only one SpeechRecognition may be live at a time. Registering a new one
 *     aborts the previous one, so a mode switch can never leak a session.
 *  3. When the page is hidden (app switch, tab switch) the live recognition is
 *     aborted immediately rather than left to time out.
 *  4. After every recognition session ends, the Web Audio context is cycled
 *     (suspend → resume) so WebKit re-evaluates the audio session category and
 *     the output unit is re-initialised for playback.
 */

export const isIOS = (() => {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent || '';
    if (/iPhone|iPad|iPod/.test(ua)) return true;
    // iPadOS 13+ reports itself as a Mac but has touch support.
    return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
})();

import { remoteLog } from '../remoteLog.js';

let activeRecognition = null;
let restoreTimer = null;

function abortQuietly(recognition) {
    if (!recognition) return;
    try {
        recognition.abort();
    } catch (e) {
        // Aborting a recognition that never started throws in some browsers.
    }
}

/**
 * Register a SpeechRecognition instance as the one currently allowed to be
 * live. Any previously registered instance is aborted first.
 */
export function registerRecognition(recognition) {
    if (activeRecognition && activeRecognition !== recognition) {
        console.log('🎤 Aborting previous recognition session before starting a new one');
        abortQuietly(activeRecognition);
    }
    activeRecognition = recognition;
}

/**
 * Abort a recognition instance decisively and forget it. Use this from
 * cleanup paths; `stop()` waits for final results and can leave the capture
 * session open, `abort()` tears it down immediately.
 */
export function releaseRecognition(recognition) {
    abortQuietly(recognition);
    if (activeRecognition === recognition) {
        activeRecognition = null;
    }
}

/**
 * Abort whatever recognition is live right now (used on page hide).
 */
export function abortActiveRecognition() {
    if (activeRecognition) {
        console.log('🎤 Page hidden - aborting live recognition session');
        remoteLog('mic', 'abortOnHide');
        abortQuietly(activeRecognition);
        activeRecognition = null;
    }
}

/**
 * Cycle the Phaser Web Audio context shortly after the microphone has been
 * released. On iOS this nudges WebKit into re-evaluating the audio session
 * (capture count is now zero) and re-initialises the output unit, which is
 * what restores full playback volume.
 *
 * @param {Phaser.Scene} scene - any scene; used to reach the sound manager
 */
export function restoreAudioAfterMic(scene) {
    const sound = scene && scene.sound;
    const context = sound && sound.context;
    if (!context) return;

    if (restoreTimer) {
        clearTimeout(restoreTimer);
    }

    // WebKit keeps the session in play-and-record for a few hundred ms after
    // capture stops; wait for that to settle before cycling the context.
    restoreTimer = setTimeout(() => {
        restoreTimer = null;

        // Don't fight Phaser's own blur handling or the initial unlock.
        if (context.state !== 'running' || sound.locked) return;

        // Skip if a new recognition started in the meantime; we'll be called
        // again when that one ends.
        if (activeRecognition) return;

        remoteLog('mic', 'audioCycle', { state: context.state });
        context.suspend()
            .then(() => context.resume())
            .then(() => console.log('🔊 Audio context cycled after microphone use'))
            .catch(e => console.warn('Audio context cycle failed:', e));
    }, 800);
}

if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
            abortActiveRecognition();
        }
    });
    window.addEventListener('pagehide', abortActiveRecognition);
}
