import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FakeScene, startMode, flush } from '../helpers/fakeScene.js';
import {
    FakeSpeechRecognition,
    installFakeSpeechRecognition,
    uninstallFakeSpeechRecognition
} from './fakeSpeechRecognition.js';
import { SpeechRecognitionMode } from '../../src/pokeballGameModes/SpeechRecognitionMode.js';
import { SPEECH_VOCABULARY, SPEECH_SENTENCES } from '../../src/speechVocabulary.js';
import { getGameModeMistakes } from '../../src/wrongAnswers.js';

const EASY_WORDS = SPEECH_VOCABULARY.easy.map(w => w.word);
const EASY_SENTENCES = SPEECH_SENTENCES.easy.map(s => s.sentence);

const RED = 0xFF6B6B;
const GREEN = 0x27AE60;

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

    it('shows the text and a ready mic, and never opens the microphone eagerly', () => {
        expect(mode.wordText.text).toBe(word().toUpperCase());
        expect(scene.interactives()).toContain(mode.micButton);
        expect(mode.micButton.fillColor).toBe(RED);
        expect(mode.ballIndicators).toHaveLength(1);
        expect(scene.findText('🎁')).not.toBeNull();
        expect(rec.lang).toBe('sv-SE');
        expect(rec.startCalls).toBe(0);
        expect(mic.getUserMedia).not.toHaveBeenCalled();
        expect(mode.statusText.text).toBe('Tryck för att prata');
    });

    it('starts listening on tap and rewards once after the word is read correctly', () => {
        tapMic();
        expect(rec.startCalls).toBe(1);
        expect(mode.isListening).toBe(true);
        expect(mode.micButton.fillColor).toBe(GREEN);
        rec.fireStart();
        speak([word()]);
        expect(mode.correctCount).toBe(1);
        expect(mode.ballIndicators[0].fillColor).toBe(GREEN);
        expect(mode.statusText.text).toBe('✅ Rätt!');
        rec.fireEnd();
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

    it('rejects a wrong utterance, records the mistake and allows a retry', () => {
        tapMic();
        speak(['xyzzy']);
        expect(mode.correctCount).toBe(0);
        expect(mode.statusText.text).toBe('❌ Du sa: "xyzzy"');
        expect(getGameModeMistakes('SpeechRecognitionMode')).toEqual({ [`${word()}_vs_xyzzy`]: 1 });
        rec.fireEnd();
        expect(mode.micButton.fillColor).toBe(RED);
        scene.advance(2000);
        expect(mode.statusText.text).toBe('Tryck för att försöka igen');
        tapMic();
        expect(rec.startCalls).toBe(2);
        speak([word()]);
        rec.fireEnd();
        scene.advance(1000);
        expect(calls).toHaveLength(1);
    });

    it('keeps "Lyssnar..." when the child retries before the wrong-answer message times out', () => {
        tapMic();
        speak(['xyzzy']);
        rec.fireEnd();
        scene.advance(500);
        tapMic();
        expect(mode.statusText.text).toBe('Lyssnar...');
        scene.advance(2000);
        expect(mode.statusText.text).toBe('Lyssnar...');
    });

    it('ignores taps and stray results while the correct-answer feedback is running', () => {
        tapMic();
        speak([word()]);
        rec.fireEnd();
        expect(mode.micButton.fillColor).toBe(RED);
        tapMic(); // red again, but locked
        expect(rec.startCalls).toBe(1);
        expect(mode.isListening).toBe(false);
        speak([word()]); // a late duplicate result
        expect(mode.correctCount).toBe(1);
        scene.advance(1000);
        expect(calls).toHaveLength(1);
        scene.advance(10000);
        expect(calls).toHaveLength(1);
    });

    it('moves on to a new word after each correct answer when more than one is required', async () => {
        await boot({ required: 2 });
        expect(mode.ballIndicators).toHaveLength(2);
        tapMic();
        speak([word()]);
        rec.fireEnd();
        expect(mode.inputLocked).toBe(true);
        scene.advance(1500);
        expect(mode.inputLocked).toBe(false);
        expect(mode.statusText.text).toBe('Tryck för att prata');
        expect(mode.wordText.text).toBe(word().toUpperCase());
        expect(calls).toHaveLength(0);
        tapMic();
        expect(rec.startCalls).toBe(2);
        speak([word()]);
        rec.fireEnd();
        expect(mode.ballIndicators.every(b => b.fillColor === GREEN)).toBe(true);
        scene.advance(1000);
        expect(calls).toHaveLength(1);
        expect(calls[0].ok).toBe(true);
    });

    it('stops a silent session after five seconds and lets the child try again', () => {
        tapMic();
        scene.advance(5000);
        expect(rec.stopCalls).toBe(1);
        expect(mode.isListening).toBe(false);
        expect(mode.micButton.fillColor).toBe(RED);
        rec.fireEnd();
        tapMic();
        expect(rec.startCalls).toBe(2);
    });

    it('turns the button red after not-allowed and lets a tap retry', () => {
        tapMic();
        rec.fireError('not-allowed');
        expect(mode.permissionGranted).toBe(false);
        expect(mode.isListening).toBe(false);
        expect(mode.micButton.fillColor).toBe(RED);
        rec.fireEnd();
        tapMic();
        expect(mode.permissionGranted).toBe(true);
        expect(rec.startCalls).toBe(2);
    });

    it('recovers from a recognizer network error', () => {
        tapMic();
        rec.fireError('network');
        rec.fireEnd();
        expect(mode.statusText.text).toContain('⚠️');
        scene.advance(5000);
        expect(mode.statusText.text).toBe('Tryck för att försöka igen');
        tapMic();
        expect(rec.startCalls).toBe(2);
    });

    it('survives a start() that throws', () => {
        rec.start = () => { throw new Error('recognition has already started'); };
        tapMic();
        expect(mode.isListening).toBe(false);
        expect(mode.micButton.fillColor).toBe(RED);
        expect(mode.statusText.text).toBe('Redan igång - vänta lite');
    });

    it('cleans up mid-feedback: no orphaned UI, no late callback, no use after destroy', () => {
        tapMic();
        speak([word()]); // reward timer + particles pending
        const button = mode.micButton;
        mode.cleanup(scene);
        expect(rec.abortCalls).toBe(1);
        expect(mode.recognition).toBeNull();
        // abort() makes the browser fire these asynchronously
        rec.fireError('aborted');
        rec.fireEnd();
        const t = scene.time.now;
        scene.advance(10000);
        expect(scene.objectsCreatedAfter(t)).toEqual([]);
        expect(scene.liveObjects()).toEqual([]);
        expect(scene.clock.pendingTimers()).toEqual([]);
        expect(calls).toHaveLength(0);
        expect(scene._useAfterDestroy).toEqual([]);
        expect(button.destroyed).toBe(true);
    });

    it('cleans up while listening and while a wrong-answer message is pending', () => {
        tapMic();
        speak(['xyzzy']);
        mode.cleanup(scene);
        rec.fireEnd();
        scene.advance(10000);
        expect(scene.liveObjects()).toEqual([]);
        expect(scene.clock.pendingTimers()).toEqual([]);
        expect(scene._useAfterDestroy).toEqual([]);
        expect(calls).toHaveLength(0);
    });

    it('does not touch destroyed UI when the network probe settles after cleanup', async () => {
        const realFetch = globalThis.fetch;
        let failProbe;
        globalThis.fetch = vi.fn((url, opts) => String(url).startsWith('/')
            ? realFetch(url, opts)
            : new Promise((_, reject) => { failProbe = reject; }));
        try {
            await boot(); // probe still in flight
            expect(mode.statusText.text).toBe('Väntar på mikrofon...');
            mode.cleanup(scene);
            failProbe(new Error('offline'));
            await flush();
            expect(scene._useAfterDestroy).toEqual([]);
            expect(scene.clock.pendingTimers()).toEqual([]);
        } finally {
            globalThis.fetch = realFetch;
        }
    });

    it('shows the offline status, retries the probe every five seconds, and stops after cleanup', async () => {
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
            expect(mode.statusText.text).toBe('⚠️ Ingen internet - behövs för röstigenkänning');
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
        expect(mode.recognition).toBeNull();
        expect(scene.interactives()).toEqual([]);
        expect(scene.click(mode.micButton)).toBe(false);
        mode.cleanup(scene);
        expect(scene.liveObjects()).toEqual([]);
    });

    it('never plays an audio key or uses a texture that BootScene did not load', () => {
        tapMic();
        speak([word()]);
        rec.fireEnd();
        scene.advance(2000);
        expect(scene._missingAudio).toEqual([]);
        expect(scene._missingTextures).toEqual([]);
    });
});
