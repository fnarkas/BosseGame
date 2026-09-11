import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FakeScene, startMode } from '../helpers/fakeScene.js';
import { setTestConfig } from '../helpers/setup.js';
import {
    FakeSpeechRecognition,
    installFakeSpeechRecognition,
    uninstallFakeSpeechRecognition
} from './fakeSpeechRecognition.js';
import { SpeedReadingMode } from '../../src/pokeballGameModes/SpeedReadingMode.js';
import { getTopCommonWords } from '../../src/commonSwedishWords.js';

const CONFIG = { wordCount: 50, durationSeconds: 10, targetWords: 5, maxCoins: 100 };

describe('SpeedReadingMode', () => {
    let scene, mode, calls, rec, mic;
    const word = () => mode.challengeData.word;
    // The child reads `transcripts` in the current session.
    const readAloud = (transcripts, opts) => { rec.fireStart(); rec.fireResult(transcripts, opts); };
    // The session ends and the listen loop gets its chance to restart.
    const endSession = () => { rec.fireEnd(); scene.advance(150); };

    beforeEach(async () => {
        setTestConfig({ speedReading: CONFIG });
        mic = installFakeSpeechRecognition();
        scene = new FakeScene();
        mode = new SpeedReadingMode();
        calls = [];
        mode.setAnswerCallback((ok, answer, x, y) => calls.push({ ok, answer, x, y }));
        await startMode(mode, scene);
        rec = FakeSpeechRecognition.last();
    });
    afterEach(() => uninstallFakeSpeechRecognition());

    it('loads its config', () => {
        expect(mode.configLoaded).toBe(true);
        expect([mode.wordCount, mode.durationSeconds, mode.targetWords, mode.maxCoins]).toEqual([50, 10, 5, 100]);
        expect(mode.wordPool).toEqual(getTopCommonWords(50));
        expect(mode.timeLeft).toBe(10);
    });

    it('falls back to defaults without a config section', async () => {
        setTestConfig({ speedReading: undefined });
        const m = new SpeedReadingMode();
        await m.loadConfig();
        expect(m.configLoaded).toBe(true);
        expect([m.wordCount, m.durationSeconds, m.targetWords, m.maxCoins]).toEqual([100, 60, 20, 100]);
    });

    it('picks words from the pool and never the same word twice in a row', () => {
        const pool = getTopCommonWords(50);
        let prev = word();
        for (let i = 0; i < 300; i++) {
            mode.generateChallenge();
            expect(pool).toContain(word());
            expect(word()).not.toBe(prev);
            prev = word();
        }
    });

    it('starts the clock and the listen loop at once, without touching getUserMedia', () => {
        expect(mode.gameActive).toBe(true);
        expect(rec.startCalls).toBe(1);
        expect(rec.lang).toBe('sv-SE');
        expect(rec.interimResults).toBe(true);
        expect(mic.getUserMedia).not.toHaveBeenCalled();
        expect(mode.micState).toBe('listening');
        expect(mode.listenRing.visible).toBe(true);
        expect(scene.clock.pendingTweens()).toHaveLength(1);
        expect(mode.wordText.text).toBe(word().toUpperCase());
        expect(mode.coinCountText.text).toBe('0');
        expect(scene.interactives()).toContain(mode.micButton);
    });

    it('counts each word read, shows a new one, and ends early with the full reward at the target', () => {
        for (let i = 0; i < 5; i++) {
            const current = word();
            readAloud([current]);
            expect(mode.correctWords).toBe(i + 1);
            expect(mode.earnedCoins).toBe(mode.coinsForWords(i + 1));
            expect(mode.coinCountText.text).toBe(`${mode.earnedCoins}`);
            if (i < 4) {
                expect(rec.stopCalls).toBe(i + 1);
                expect(word()).not.toBe(current);
                expect(mode.wordText.text).toBe(word().toUpperCase());
                endSession();
                expect(rec.startCalls).toBe(i + 2);
            }
        }
        expect(mode.gameActive).toBe(false);
        expect(mode.finished).toBe(true);
        expect(mode.earnedCoins).toBe(100);
        expect(mode.progressBarFill.width).toBe(mode.progressBarWidth);
        expect(mode.statusText.text).toBe('🎉 100 🪙');
        expect(mode.listenRing.visible).toBe(false);
        endSession(); // the last session ends - must not restart
        expect(rec.startCalls).toBe(5);
        scene.advance(900);
        expect(calls).toEqual([{ ok: true, answer: word(), x: 640, y: 450 }]);
        scene.advance(5000);
        expect(calls).toHaveLength(1);
    });

    it('accepts an interim hypothesis, homophones and padded pronunciations', () => {
        readAloud([word()], { isFinal: false });
        expect(mode.correctWords).toBe(1);

        expect(mode.wordsMatch('säg', 'sig')).toBe(true);
        expect(mode.wordsMatch('dom', 'de')).toBe(true);
        expect(mode.wordsMatch('å', 'och')).toBe(true);
        expect(mode.wordsMatch('skall', 'ska')).toBe(true);
        expect(mode.wordsMatch('hä', 'här')).toBe(true);
        expect(mode.wordsMatch('jag är här', 'är')).toBe(true);
        expect(mode.wordsMatch('Jag!', 'jag')).toBe(false); // caller lower-cases; punctuation is stripped
        expect(mode.wordsMatch('jag!', 'jag')).toBe(true);
        expect(mode.wordsMatch('katten', 'ko')).toBe(false);
        expect(mode.wordsMatch('jaguar', 'jag')).toBe(false);
        expect(mode.wordsMatch('', 'jag')).toBe(false);
    });

    it('keeps the same word after a wrong final result and restarts listening', () => {
        const current = word();
        readAloud(['xyzzy'], { isFinal: false }); // an interim miss is not judged yet
        expect(mode.correctWords).toBe(0);
        expect(mode.statusText.text).toBe('Läs ordet!');
        rec.fireResult(['xyzzy'], { isFinal: true });
        expect(mode.correctWords).toBe(0);
        expect(word()).toBe(current);
        expect(mode.statusText.text).toBe('❌ "xyzzy"');
        expect(mode.micState).toBe('evaluating');
        expect(calls).toHaveLength(0);
        endSession();
        expect(rec.startCalls).toBe(2);
        expect(mode.micState).toBe('listening');
        readAloud([current]);
        expect(mode.correctWords).toBe(1);
    });

    it('never counts one session twice', () => {
        readAloud([word()]);
        rec.fireResult([word()]); // a duplicate final result for the same session
        expect(mode.correctWords).toBe(1);
        rec.fireResult(['xyzzy']);
        expect(mode.statusText.text).toBe('✅ Rätt!');
    });

    it('finishes when the clock runs out, pays for what was read, and is dead afterwards', () => {
        readAloud([word()]);
        endSession();
        scene.advance(10000);
        expect(mode.gameActive).toBe(false);
        expect(mode.finished).toBe(true);
        expect(mode.timeLeft).toBe(0);
        expect(mode.timerBarFill.width).toBe(0);
        expect(mode.earnedCoins).toBe(mode.coinsForWords(1));
        expect(rec.stopCalls).toBe(2); // once for the match, once at the end
        endSession();
        expect(rec.startCalls).toBe(2); // no restart after the end
        scene.advance(1000);
        expect(calls).toHaveLength(1);
        // A tap after the end must not restart the clock or the microphone
        scene.click(mode.micButton);
        expect(mode.gameActive).toBe(false);
        expect(rec.startCalls).toBe(2);
        rec.fireResult([word()]);
        expect(mode.correctWords).toBe(1);
        scene.advance(20000);
        expect(calls).toHaveLength(1);
    });

    it('colours the timer bar as time runs out', () => {
        expect(mode.timerBarFill.fillColor).toBe(0x2ECC71);
        scene.advance(5100);
        expect(mode.timerBarFill.fillColor).toBe(0xF39C12);
        scene.advance(2600);
        expect(mode.timerBarFill.fillColor).toBe(0xE74C3C);
    });

    it('drops permission on not-allowed, stops the loop, and a tap retries', () => {
        rec.fireError('not-allowed');
        expect(mode.permissionGranted).toBe(false);
        expect(mode.micState).toBe('idle');
        rec.fireEnd();
        scene.advance(1000);
        expect(rec.startCalls).toBe(1); // no auto-restart without permission
        expect(mode.gameActive).toBe(true);
        scene.click(mode.micButton);
        expect(mode.permissionGranted).toBe(true);
        expect(rec.startCalls).toBe(2);
        expect(mode.micState).toBe('listening');
    });

    it('cleans up mid-game: timer, tween, UI and late recognition events are all inert', () => {
        readAloud([word()]); // particles pending, ring tween running
        const ring = mode.listenRing;
        mode.cleanup(scene);
        expect(rec.abortCalls).toBe(1);
        expect(mode.recognition).toBeNull();
        rec.fireError('aborted'); // async fallout of abort()
        rec.fireEnd();
        const t = scene.time.now;
        scene.advance(20000);
        expect(scene.objectsCreatedAfter(t)).toEqual([]);
        expect(scene.liveObjects()).toEqual([]);
        expect(scene.clock.pendingTimers()).toEqual([]);
        expect(scene.clock.pendingTweens()).toEqual([]);
        expect(calls).toHaveLength(0);
        expect(scene._useAfterDestroy).toEqual([]);
        expect(ring.destroyed).toBe(true);
        expect(rec.startCalls).toBe(1);
    });

    it('cleans up between the end of the round and the reward hand-over without a late callback', () => {
        scene.advance(10200);
        expect(mode.finished).toBe(true);
        mode.cleanup(scene);
        rec.fireEnd();
        scene.advance(5000);
        expect(calls).toHaveLength(0);
        expect(scene.liveObjects()).toEqual([]);
        expect(scene.clock.pendingTimers()).toEqual([]);
    });

    it('never plays an audio key or uses a texture that BootScene did not load', () => {
        readAloud([word()]);
        endSession();
        scene.advance(1000);
        expect(scene._missingAudio).toEqual([]);
        expect(scene._missingTextures).toEqual([]);
    });
});
