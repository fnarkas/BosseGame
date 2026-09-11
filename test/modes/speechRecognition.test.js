import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FakeScene, startMode, flush } from '../helpers/fakeScene.js';
import {
    FakeSpeechRecognition,
    installFakeSpeechRecognition,
    uninstallFakeSpeechRecognition
} from './fakeSpeechRecognition.js';
import { SpeechRecognitionMode } from '../../src/pokeballGameModes/SpeechRecognitionMode.js';
import { MIC_COLORS } from '../../src/components/MicButton.js';
import { SPEECH_VOCABULARY, SPEECH_SENTENCES } from '../../src/speechVocabulary.js';
import { getWordAudioKey } from '../../src/wordAudioData.js';
import { getGameModeMistakes } from '../../src/wrongAnswers.js';

const EASY_WORDS = SPEECH_VOCABULARY.easy.map(w => w.word);
const EASY_SENTENCES = SPEECH_SENTENCES.easy.map(s => s.sentence);

// Status is shown on the mic, never written out. Only the text being read
// (and the gift/emoji) may exist as Text objects.
function assertNoStatusText(scene, mode) {
    const learning = new Set([mode.challengeData.word.toUpperCase(), '🎁', '🎤', '✅', '❌', '🚫']);
    scene.liveTexts().forEach(t => {
        expect(learning.has(t.text), `unexpected text "${t.text}"`).toBe(true);
    });
}

describe('SpeechRecognitionMode', () => {
    let scene, mode, calls, rec, mic;

    async function boot({ required } = {}) {
        scene = new FakeScene();
        mode = new SpeechRecognitionMode();
        if (required) mode.requiredCorrect = required;
        calls = [];
        mode.setAnswerCallback((ok, answer, x, y) => calls.push({ ok, answer, x, y }));
        await startMode(mode, scene);
        await flush(); // lets the network probe settle
        rec = FakeSpeechRecognition.last();
    }

    beforeEach(async () => {
        mic = installFakeSpeechRecognition();
        await boot();
    });
    afterEach(() => uninstallFakeSpeechRecognition());

    const word = () => mode.challengeData.word;
    const speak = (transcripts, opts) => rec.fireResult(transcripts, opts);
    const tapMic = () => scene.click(mode.micButton);
    const helper = () => mode.speechHelper;

    it('generates a non-empty word or sentence from the easy vocabulary', () => {
        let words = 0;
        let sentences = 0;
        for (let i = 0; i < 200; i++) {
            mode.generateChallenge();
            const w = mode.challengeData.word;
            expect(typeof w).toBe('string');
            expect(w.length).toBeGreaterThan(0);
            expect(typeof mode.challengeData.translation).toBe('string');
            if (mode.isSentence) {
                sentences++;
                expect(EASY_SENTENCES).toContain(w);
            } else {
                words++;
                expect(EASY_WORDS).toContain(w);
            }
        }
        expect(words).toBeGreaterThan(0);
        expect(sentences).toBeGreaterThan(0);
    });

    it('shows the text and an idle mic, with no status text, and never opens the microphone eagerly', () => {
        expect(mode.wordText.text).toBe(word().toUpperCase());
        expect(scene.interactives()).toContain(mode.micButton);
        expect(mode.micState).toBe('idle');
        expect(mode.micButton.fillColor).toBe(MIC_COLORS.IDLE);
        expect(mode.mic.emoji.text).toBe('🎤');
        expect(mode.mic.ring.visible).toBe(false);
        expect(mode.progressBalls.circles).toHaveLength(1);
        expect(scene.findText('🎁')).not.toBeNull();
        expect(rec.lang).toBe('sv-SE');
        expect(rec.startCalls).toBe(0);
        expect(mic.getUserMedia).not.toHaveBeenCalled();
        assertNoStatusText(scene, mode);
    });

    it('starts listening on tap (pulsing red mic) and rewards once after the word is read correctly', () => {
        tapMic();
        expect(rec.startCalls).toBe(1);
        expect(helper().isListening).toBe(true);
        expect(mode.micState).toBe('listening');
        expect(mode.micButton.fillColor).toBe(MIC_COLORS.LISTENING);
        expect(mode.mic.ring.visible).toBe(true);
        expect(scene.clock.pendingTweens()).toHaveLength(1);
        rec.fireStart();
        speak([word()]);
        expect(mode.correctCount).toBe(1);
        expect(mode.progressBalls.circles[0].fillColor).toBe(0x27AE60);
        expect(mode.micState).toBe('correct');
        expect(mode.mic.emoji.text).toBe('✅');
        expect(mode.mic.ring.visible).toBe(false);
        assertNoStatusText(scene, mode);
        rec.fireEnd();
        expect(mode.micState).toBe('correct');
        expect(calls).toHaveLength(0);
        scene.advance(1000);
        expect(calls).toEqual([{ ok: true, answer: word(), x: 640, y: 450 }]);
        scene.advance(10000);
        expect(calls).toHaveLength(1);
        expect(mic.getUserMedia).not.toHaveBeenCalled();
    });

    it('accepts the word from any recognizer alternative and inside a longer utterance', () => {
        tapMic();
        speak(['xyzzy', `ja ${word()} tack`]);
        expect(mode.correctCount).toBe(1);
    });

    it('rejects a wrong utterance, shows ❌, speaks the word, records the mistake and allows a retry', () => {
        tapMic();
        speak(['xyzzy']);
        expect(mode.correctCount).toBe(0);
        expect(mode.micState).toBe('wrong');
        expect(mode.mic.emoji.text).toBe('❌');
        // The correct pronunciation is played while the ❌ is shown
        expect(scene.lastAudio()).toBe(getWordAudioKey(word().split(' ')[0]));
        expect(getGameModeMistakes('SpeechRecognitionMode')).toEqual({ [`${word()}_vs_xyzzy`]: 1 });
        assertNoStatusText(scene, mode);
        rec.fireEnd();
        expect(mode.micState).toBe('wrong');
        scene.advance(2000);
        expect(mode.micState).toBe('idle');
        expect(mode.mic.emoji.text).toBe('🎤');
        tapMic();
        expect(rec.startCalls).toBe(2);
        speak([word()]);
        rec.fireEnd();
        scene.advance(1000);
        expect(calls).toHaveLength(1);
        expect(scene._missingAudio).toEqual([]);
    });

    it('reads a whole sentence aloud word by word after a miss', () => {
        mode.cleanup(scene);
        mode.isSentence = true;
        mode.challengeData = { word: EASY_SENTENCES[0], translation: '' };
        mode.createChallengeUI(scene);
        rec = FakeSpeechRecognition.last();
        tapMic();
        speak(['xyzzy']);
        const keys = EASY_SENTENCES[0].toLowerCase().split(' ').map(getWordAudioKey);
        expect(scene.playedAudio()).toEqual(keys.slice(0, 1));
        scene.advance(keys.length * 600);
        expect(scene.playedAudio()).toEqual(keys);
        expect(scene._missingAudio).toEqual([]);
    });

    it('keeps listening when the child retries before the ❌ times out', () => {
        tapMic();
        speak(['xyzzy']);
        rec.fireEnd();
        scene.advance(500);
        tapMic();
        expect(mode.micState).toBe('listening');
        scene.advance(2000);
        expect(mode.micState).toBe('listening');
    });

    it('brings a missed word back two words later', async () => {
        await boot({ required: 5 });
        const missed = word();
        tapMic();
        speak(['xyzzy']);
        rec.fireEnd();
        scene.advance(2000);
        const seen = [];
        for (let i = 0; i < 4; i++) {
            seen.push(word());
            tapMic();
            speak([word()]);
            rec.fireEnd();
            scene.advance(1500);
        }
        // The missed word stays up until it is read, then two others, then it
        // returns (the two in between are random draws and may coincide).
        expect(seen[0]).toBe(missed);
        expect(seen[3]).toBe(missed);
    });

    it('ignores taps and stray results while the correct-answer feedback is running', () => {
        tapMic();
        speak([word()]);
        rec.fireEnd();
        expect(mode.micState).toBe('correct');
        tapMic(); // locked
        expect(rec.startCalls).toBe(1);
        expect(helper().isListening).toBe(false);
        speak([word()]); // a late duplicate result
        expect(mode.correctCount).toBe(1);
        scene.advance(1000);
        expect(calls).toHaveLength(1);
        scene.advance(10000);
        expect(calls).toHaveLength(1);
    });

    it('moves on to a new word after each correct answer when more than one is required', async () => {
        await boot({ required: 2 });
        expect(mode.progressBalls.circles).toHaveLength(2);
        tapMic();
        speak([word()]);
        rec.fireEnd();
        expect(mode.inputLocked).toBe(true);
        scene.advance(1500);
        expect(mode.inputLocked).toBe(false);
        expect(mode.micState).toBe('idle');
        expect(mode.wordText.text).toBe(word().toUpperCase());
        expect(calls).toHaveLength(0);
        tapMic();
        expect(rec.startCalls).toBe(2);
        speak([word()]);
        rec.fireEnd();
        expect(mode.progressBalls.circles.every(b => b.fillColor === 0x27AE60)).toBe(true);
        scene.advance(1000);
        expect(calls).toHaveLength(1);
        expect(calls[0].ok).toBe(true);
    });

    it('stops a silent session after five seconds and lets the child try again', () => {
        tapMic();
        scene.advance(5000);
        expect(rec.stopCalls).toBe(1);
        expect(helper().isListening).toBe(false);
        expect(mode.micState).toBe('idle');
        rec.fireEnd();
        tapMic();
        expect(rec.startCalls).toBe(2);
    });

    it('shows 🚫 after not-allowed and lets a tap retry', () => {
        tapMic();
        rec.fireError('not-allowed');
        expect(helper().permissionGranted).toBe(false);
        expect(helper().isListening).toBe(false);
        expect(mode.micState).toBe('blocked');
        expect(mode.mic.emoji.text).toBe('🚫');
        rec.fireEnd();
        expect(mode.micState).toBe('blocked');
        tapMic();
        expect(helper().permissionGranted).toBe(true);
        expect(rec.startCalls).toBe(2);
        expect(mode.micState).toBe('listening');
    });

    it('recovers from a recognizer network error', () => {
        tapMic();
        rec.fireError('network');
        expect(mode.micState).toBe('idle');
        rec.fireEnd();
        scene.advance(5000);
        expect(mode.micState).toBe('idle');
        tapMic();
        expect(rec.startCalls).toBe(2);
    });

    it('survives a start() that throws', () => {
        rec.start = () => { throw new Error('recognition has already started'); };
        tapMic();
        expect(helper().isListening).toBe(false);
        expect(mode.micState).toBe('idle');
    });

    it('cleans up mid-feedback: no orphaned UI, no late callback, no use after destroy', () => {
        tapMic();
        speak([word()]); // reward timer + particles pending
        const button = mode.micButton;
        mode.cleanup(scene);
        expect(rec.abortCalls).toBe(1);
        expect(helper().recognition).toBeNull();
        // abort() makes the browser fire these asynchronously
        rec.fireError('aborted');
        rec.fireEnd();
        const t = scene.time.now;
        scene.advance(10000);
        expect(scene.objectsCreatedAfter(t)).toEqual([]);
        expect(scene.liveObjects()).toEqual([]);
        expect(scene.clock.pendingTimers()).toEqual([]);
        expect(scene.clock.pendingTweens()).toEqual([]);
        expect(calls).toHaveLength(0);
        expect(scene._useAfterDestroy).toEqual([]);
        expect(button.destroyed).toBe(true);
    });

    it('cleans up while listening and while a wrong-answer ❌ is pending', () => {
        tapMic();
        speak(['xyzzy']);
        mode.cleanup(scene);
        rec.fireEnd();
        scene.advance(10000);
        expect(scene.liveObjects()).toEqual([]);
        expect(scene.clock.pendingTimers()).toEqual([]);
        expect(scene.clock.pendingTweens()).toEqual([]);
        expect(scene._useAfterDestroy).toEqual([]);
        expect(scene.playingSounds()).toEqual([]);
        expect(calls).toHaveLength(0);
    });

    it('is usable while the network probe is in flight and untouched by it after cleanup', async () => {
        const realFetch = globalThis.fetch;
        let failProbe;
        globalThis.fetch = vi.fn((url, opts) => String(url).startsWith('/')
            ? realFetch(url, opts)
            : new Promise((_, reject) => { failProbe = reject; }));
        try {
            await boot(); // probe still in flight
            expect(mode.micState).toBe('idle');
            expect(scene.interactives()).toContain(mode.micButton);
            mode.cleanup(scene);
            failProbe(new Error('offline'));
            await flush();
            scene.advance(20000);
            await flush();
            expect(scene._useAfterDestroy).toEqual([]);
            expect(scene.liveObjects()).toEqual([]);
        } finally {
            globalThis.fetch = realFetch;
        }
    });

    it('retries the probe every five seconds while offline, keeps the mic usable, and stops after cleanup', async () => {
        const realFetch = globalThis.fetch;
        let probes = 0;
        globalThis.fetch = vi.fn(async (url, opts) => {
            if (String(url).startsWith('/')) return realFetch(url, opts);
            probes++;
            throw new Error('offline');
        });
        try {
            await boot();
            expect(probes).toBe(1);
            expect(mode.micState).toBe('idle');
            assertNoStatusText(scene, mode);
            scene.advance(5000);
            await flush();
            expect(probes).toBe(2);
            // The mic is still usable: the probe is only advisory.
            tapMic();
            expect(rec.startCalls).toBe(1);
            mode.cleanup(scene);
            scene.advance(20000);
            await flush();
            expect(probes).toBe(2);
            expect(scene._useAfterDestroy).toEqual([]);
        } finally {
            globalThis.fetch = realFetch;
        }
    });

    it('stays harmless when the browser has no speech recognition', async () => {
        uninstallFakeSpeechRecognition();
        scene = new FakeScene();
        mode = new SpeechRecognitionMode();
        await startMode(mode, scene);
        await flush();
        expect(mode.speechHelper.recognition).toBeNull();
        expect(mode.micState).toBe('blocked');
        expect(scene.interactives()).toEqual([]);
        expect(scene.click(mode.micButton)).toBe(false);
        mode.cleanup(scene);
        expect(scene.liveObjects()).toEqual([]);
    });

    it('never plays an audio key or uses a texture that BootScene did not load', () => {
        tapMic();
        speak(['xyzzy']);
        rec.fireEnd();
        scene.advance(2500);
        tapMic();
        speak([word()]);
        rec.fireEnd();
        scene.advance(2000);
        expect(scene._missingAudio).toEqual([]);
        expect(scene._missingTextures).toEqual([]);
    });
});
