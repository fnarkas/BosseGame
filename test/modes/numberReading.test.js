import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FakeScene, startMode, flush } from '../helpers/fakeScene.js';
import { setTestConfig } from '../helpers/setup.js';
import { NumberReadingMode } from '../../src/pokeballGameModes/NumberReadingMode.js';
import { getStreak, incrementStreak } from '../../src/streak.js';

// Minimal Web Speech API stand-in: the helper wires onresult/onerror/onstart/onend
// and calls start()/stop()/abort().
class FakeRecognition {
    constructor() {
        this.started = false;
        this.aborted = false;
        this.onresult = null;
        this.onerror = null;
        this.onstart = null;
        this.onend = null;
        FakeRecognition.instances.push(this);
    }
    start() {
        this.started = true;
        if (this.onstart) this.onstart();
    }
    stop() {
        this.started = false;
        if (this.onend) this.onend();
    }
    abort() {
        this.aborted = true;
        this.started = false;
    }
    static get current() {
        return FakeRecognition.instances[FakeRecognition.instances.length - 1];
    }
}
FakeRecognition.instances = [];

describe('NumberReadingMode', () => {
    let scene, mode, calls;

    async function setup(config = { required: 2, numbers: '23, 45, 67' }) {
        setTestConfig({ numberReading: config });
        scene = new FakeScene();
        mode = new NumberReadingMode();
        calls = [];
        mode.setAnswerCallback((ok, answer, x, y) => calls.push({ ok, answer, x, y }));
        await startMode(mode, scene);
        await flush(); // let the async speech-recognition init settle
    }

    // Deliver a recognition result (first transcript + alternatives) and end the session
    function speak(text, ...alternatives) {
        const rec = FakeRecognition.current;
        const results = [text, ...alternatives].map(t => ({ transcript: t, confidence: 0.9 }));
        rec.onresult({ results: [results] });
        rec.onend();
    }
    const tapMic = () => scene.click(mode.micButton);

    beforeEach(() => {
        FakeRecognition.instances = [];
        window.SpeechRecognition = FakeRecognition;
    });

    afterEach(() => {
        delete window.SpeechRecognition;
        if (scene) {
            expect(scene._useAfterDestroy).toEqual([]);
            expect(scene._missingAudio).toEqual([]);
        }
        scene = null;
    });

    describe('config and challenge generation', () => {
        it('falls back to 10-99 when there is no numberReading section', async () => {
            setTestConfig(null);
            const m = new NumberReadingMode();
            await m.loadConfig();
            expect(m.configLoaded).toBe(true);
            expect(m.requiredCorrect).toBe(1);
            expect(m.availableNumbers).toHaveLength(90);
        });

        it('reads required and numbers from the numberReading section', async () => {
            setTestConfig({ numberReading: { required: 3, numbers: '1-3, 50' } });
            const m = new NumberReadingMode();
            await m.loadConfig();
            expect(m.requiredCorrect).toBe(3);
            expect(m.availableNumbers).toEqual([1, 2, 3, 50]);
        });

        it('always picks a configured number and never repeats back to back', async () => {
            setTestConfig({ numberReading: { required: 1, numbers: '10-20' } });
            const m = new NumberReadingMode();
            await m.loadConfig();
            let previous = null;
            for (let i = 0; i < 300; i++) {
                m.generateChallenge();
                expect(m.availableNumbers).toContain(m.currentNumber);
                expect(m.challengeData.number).toBe(m.currentNumber);
                expect(m.currentNumber).not.toBe(previous);
                previous = m.currentNumber;
            }
        });

        it('still produces a challenge when generateChallenge runs before loadConfig', () => {
            const m = new NumberReadingMode();
            m.generateChallenge();
            expect(m.currentNumber).toBeGreaterThanOrEqual(10);
            expect(m.currentNumber).toBeLessThanOrEqual(99);
        });
    });

    describe('parseSwedishNumber', () => {
        it('understands digits, single words, spaced and joined compounds', () => {
            const m = new NumberReadingMode();
            expect(m.parseSwedishNumber('45')).toBe(45);
            expect(m.parseSwedishNumber(' 7 ')).toBe(7);
            expect(m.parseSwedishNumber('noll')).toBe(0);
            expect(m.parseSwedishNumber('Ett')).toBe(1);
            expect(m.parseSwedishNumber('femton')).toBe(15);
            expect(m.parseSwedishNumber('tjugo tre')).toBe(23);
            expect(m.parseSwedishNumber('tjugotre')).toBe(23);
            expect(m.parseSwedishNumber('trettiofem')).toBe(35);
            expect(m.parseSwedishNumber('nittionio')).toBe(99);
            expect(m.parseSwedishNumber('hej')).toBeNull();
            expect(m.parseSwedishNumber('')).toBeNull();
            expect(m.parseSwedishNumber('tjugo hundra')).toBeNull();
        });
    });

    describe('UI', () => {
        it('shows the number, a mic that becomes ready, and progress balls', async () => {
            await setup();
            expect(scene.findText(String(mode.currentNumber))).not.toBeNull();
            expect(scene.findText('🎤')).not.toBeNull();
            expect(mode.micButton.input.enabled).toBe(true);
            expect(mode.micButton.fillColor).toBe(0xFF6B6B);
            expect(mode.ballIndicators).toHaveLength(2);
            expect(scene.findText('🎁')).not.toBeNull();
        });

        it('keeps the mic disabled when speech recognition is unsupported', async () => {
            delete window.SpeechRecognition;
            await setup();
            expect(mode.micButton.input).toBeNull();
            expect(mode.micButton.fillColor).toBe(0x95A5A6);
        });

        it('opens the progress popup from the matrix icon', async () => {
            await setup();
            mode.showMatrixPopup = vi.fn();
            const icon = scene.interactives().find(o => o.type === 'Rectangle' && o.fillColor === 0x3498DB);
            scene.click(icon);
            expect(mode.showMatrixPopup).toHaveBeenCalledTimes(1);
        });

        it('turns the mic green while listening and red again afterwards', async () => {
            await setup();
            tapMic();
            expect(FakeRecognition.current.started).toBe(true);
            expect(mode.micButton.fillColor).toBe(0x27AE60);
            FakeRecognition.current.stop();
            expect(mode.micButton.fillColor).toBe(0xFF6B6B);
        });
    });

    describe('answering', () => {
        it('rewards exactly once after the required number of correct answers', async () => {
            await setup({ required: 2, numbers: '23, 45' });
            tapMic();
            speak(String(mode.currentNumber));
            expect(mode.correctInRow).toBe(1);
            expect(mode.ballIndicators[0].fillColor).toBe(0x27AE60);
            const first = mode.currentNumber;
            scene.advance(1000);
            await flush();
            // New challenge with a fresh recognition session
            expect(mode.currentNumber).not.toBe(first);
            expect(scene.findText(String(mode.currentNumber))).not.toBeNull();
            expect(FakeRecognition.instances).toHaveLength(2);
            expect(FakeRecognition.instances[0].aborted).toBe(true);
            tapMic();
            speak('tjugotre', String(mode.currentNumber));
            scene.advance(1000);
            expect(calls).toEqual([{ ok: true, answer: 'number-reading', x: 640, y: 450 }]);
            expect(mode.clearedNumbers.size).toBe(2);
        });

        it('accepts a correct alternative transcript', async () => {
            await setup({ required: 1, numbers: '45' });
            tapMic();
            speak('hej', 'fyrtiofem');
            expect(mode.correctInRow).toBe(1);
        });

        it('ignores a second result and mic taps while the correct answer is being celebrated', async () => {
            await setup({ required: 1, numbers: '45' });
            tapMic();
            speak('45');
            speak('45');
            expect(mode.correctInRow).toBe(1);
            tapMic();
            expect(mode.speechHelper.isListening).toBe(false);
            scene.advance(5000);
            expect(calls).toHaveLength(1);
        });

        it('resets progress and streak on a wrong answer, then lets the child retry the same number', async () => {
            await setup({ required: 2, numbers: '23, 45' });
            incrementStreak();
            tapMic();
            speak(String(mode.currentNumber));
            scene.advance(1000);
            await flush();
            expect(mode.correctInRow).toBe(1);
            const number = mode.currentNumber;

            tapMic();
            speak('hej');
            expect(mode.correctInRow).toBe(0);
            expect(getStreak()).toBe(0);
            expect(mode.isRevealing).toBe(true);
            expect(mode.displayedNumber.style.color).toBe('#FF0000');
            expect(mode.ballIndicators.every(b => b.fillColor === 0xffffff)).toBe(true);
            const redFlash = mode.wrongBg;
            expect(redFlash.destroyed).toBe(false);

            // Mic taps and results are ignored during the feedback
            scene.advance(100);
            tapMic();
            expect(mode.speechHelper.isListening).toBe(false);
            speak(String(number));
            expect(mode.correctInRow).toBe(0);

            scene.advance(1900);
            expect(mode.isRevealing).toBe(false);
            expect(mode.inputLocked).toBe(false);
            expect(mode.currentNumber).toBe(number);
            expect(mode.displayedNumber.style.color).toBe('#000000');
            expect(mode.displayedNumber.x).toBe(640);
            expect(redFlash.destroyed).toBe(true);
            expect(calls).toHaveLength(0);

            tapMic();
            speak(String(number));
            expect(mode.correctInRow).toBe(1);
            scene.advance(1000);
            await flush();
            tapMic();
            speak(String(mode.currentNumber));
            scene.advance(1000);
            expect(calls).toHaveLength(1);
        });

        it('records the wrong answer', async () => {
            await setup({ required: 1, numbers: '45' });
            tapMic();
            speak('tjugotre');
            const data = JSON.parse(localStorage.getItem('wrongAnswers'));
            expect(data.mistakeCounts.NumberReadingMode['45_vs_23']).toBe(1);
        });
    });

    describe('cleanup', () => {
        it('leaves nothing behind when torn down mid wrong-answer feedback', async () => {
            await setup({ required: 2, numbers: '23, 45' });
            tapMic();
            speak('hej');
            scene.advance(100); // mid-shake
            mode.cleanup(scene);
            const t = scene.time.now;
            scene.advance(10000);
            expect(scene.objectsCreatedAfter(t)).toEqual([]);
            expect(scene.liveObjects()).toEqual([]);
            expect(scene.clock.pendingTimers()).toEqual([]);
            expect(scene.clock.pendingTweens()).toEqual([]);
            expect(calls).toHaveLength(0);
        });

        it('leaves nothing behind when torn down right after a correct answer', async () => {
            await setup({ required: 2, numbers: '23, 45' });
            tapMic();
            speak(String(mode.currentNumber));
            mode.cleanup(scene);
            const t = scene.time.now;
            scene.advance(10000);
            await flush();
            expect(scene.objectsCreatedAfter(t)).toEqual([]);
            expect(scene.liveObjects()).toEqual([]);
            expect(scene.clock.pendingTimers()).toEqual([]);
            expect(calls).toHaveLength(0);
        });

        it('aborts a live recognition session and drops the 5s listening timeout', async () => {
            await setup();
            tapMic();
            const rec = FakeRecognition.current;
            expect(scene.clock.pendingTimers()).toHaveLength(1);
            mode.cleanup(scene);
            expect(rec.aborted).toBe(true);
            expect(scene.clock.pendingTimers()).toEqual([]);
            // A late result from the aborted session must be harmless
            expect(() => speak('45')).not.toThrow();
            scene.advance(10000);
            expect(scene.liveObjects()).toEqual([]);
            expect(calls).toHaveLength(0);
        });

        it('survives being cleaned up before the async mic initialisation finishes', async () => {
            setTestConfig({ numberReading: { required: 1, numbers: '45' } });
            scene = new FakeScene();
            mode = new NumberReadingMode();
            calls = [];
            mode.setAnswerCallback((ok, answer) => calls.push({ ok, answer }));
            await startMode(mode, scene); // init still pending
            mode.cleanup(scene);
            await flush();
            expect(scene.liveObjects()).toEqual([]);
            expect(scene.interactives()).toEqual([]);
        });
    });
});
