import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FakeScene, startMode, flush } from '../helpers/fakeScene.js';
import { setTestConfig } from '../helpers/setup.js';
import { ClockReadingMode } from '../../src/pokeballGameModes/ClockReadingMode.js';
import { getStreak, incrementStreak } from '../../src/streak.js';

// Minimal Web Speech API stand-in. start() fires onstart synchronously; tests
// deliver results through speak().
class FakeRecognition {
    constructor() {
        this.started = 0;
        this.aborted = 0;
        this.onresult = null; this.onerror = null; this.onstart = null; this.onend = null;
        FakeRecognition.instances.push(this);
    }
    start() { this.started++; this.live = true; if (this.onstart) this.onstart(); }
    stop() { this.live = false; if (this.onend) this.onend(); }
    abort() { this.aborted++; this.live = false; }
}
FakeRecognition.instances = [];

const HOUR_WORDS = { 1: 'ett', 2: 'två', 3: 'tre', 4: 'fyra', 5: 'fem', 6: 'sex', 7: 'sju', 8: 'åtta', 9: 'nio', 10: 'tio', 11: 'elva', 12: 'tolv' };
function swedishTime(hour, minute) {
    if (minute === 30) return `klockan halv ${HOUR_WORDS[hour === 12 ? 1 : hour + 1]}`;
    return `klockan ${HOUR_WORDS[hour]}`;
}
function speak(mode, transcript, alternatives = []) {
    const rec = mode.speechHelper.recognition;
    const results = [{ transcript }, ...alternatives.map(t => ({ transcript: t }))];
    rec.onresult({ results: [results] });
}
function speakCorrect(mode) { speak(mode, swedishTime(mode.currentHour, mode.currentMinute)); }
function speakWrong(mode) {
    const wrongHour = mode.currentHour === 12 ? 1 : mode.currentHour + 1;
    speak(mode, swedishTime(wrongHour, mode.currentMinute));
}
async function forceChallenge(scene, mode, hour, minute) {
    mode.cleanup(scene);
    mode.currentHour = hour;
    mode.currentMinute = minute;
    mode.challengeData = { hour, minute };
    mode.createChallengeUI(scene);
    await flush();
}
function expectedHourAngle(hour, minute) { return (hour % 12) * 30 + (minute / 60) * 30; }
function expectedMinuteAngle(minute) { return minute * 6; }

describe('ClockReadingMode', () => {
    let scene, mode, calls;
    beforeEach(async () => {
        FakeRecognition.instances = [];
        window.SpeechRecognition = FakeRecognition;
        scene = new FakeScene();
        mode = new ClockReadingMode();
        calls = [];
        mode.setAnswerCallback((ok, answer, x, y) => calls.push({ ok, answer, x, y }));
        await startMode(mode, scene);
        await flush(); // let speech init settle
    });
    afterEach(() => {
        mode.cleanup(scene);
        delete window.SpeechRecognition;
    });

    describe('config', () => {
        it('loads required and includeHalfHours from the server config', async () => {
            setTestConfig({ clockReading: { required: 2, includeHalfHours: false } });
            const m = new ClockReadingMode();
            await m.loadConfig();
            expect(m.configLoaded).toBe(true);
            expect(m.requiredCorrect).toBe(2);
            expect(m.includeHalfHours).toBe(false);
        });

        it('falls back to defaults when the section is missing', async () => {
            setTestConfig({ clockReading: undefined });
            const m = new ClockReadingMode();
            await m.loadConfig();
            expect(m.configLoaded).toBe(true);
            expect(m.requiredCorrect).toBe(3);
            expect(m.includeHalfHours).toBe(true);
        });

        it('honours includeHalfHours=false when generating', async () => {
            setTestConfig({ clockReading: { required: 3, includeHalfHours: false } });
            const m = new ClockReadingMode();
            await m.loadConfig();
            for (let i = 0; i < 200; i++) {
                m.generateChallenge();
                expect(m.currentMinute).toBe(0);
            }
        });
    });

    describe('challenge generation', () => {
        it('produces valid times, both whole and half hours, never the same time twice in a row', () => {
            const seenMinutes = new Set();
            const seenHours = new Set();
            let prev = null;
            for (let i = 0; i < 500; i++) {
                mode.generateChallenge();
                const { hour, minute } = mode.challengeData;
                expect(hour).toBeGreaterThanOrEqual(1);
                expect(hour).toBeLessThanOrEqual(12);
                expect([0, 30]).toContain(minute);
                if (prev) expect(`${hour}:${minute}`).not.toBe(prev);
                prev = `${hour}:${minute}`;
                seenMinutes.add(minute);
                seenHours.add(hour);
            }
            expect(seenMinutes.size).toBe(2);
            expect(seenHours.size).toBe(12);
        });
    });

    describe('clock face', () => {
        it('draws the hands at angles consistent with the challenge time for every time', async () => {
            for (let hour = 1; hour <= 12; hour++) {
                for (const minute of [0, 30]) {
                    await forceChallenge(scene, mode, hour, minute);
                    expect(mode.hourHand.angle).toBeCloseTo(expectedHourAngle(hour, minute));
                    expect(mode.minuteHand.angle).toBeCloseTo(expectedMinuteAngle(minute));
                }
            }
        });

        it('12:00 points both hands up and 12:30 offsets the hour hand by 15 degrees', async () => {
            await forceChallenge(scene, mode, 12, 0);
            expect(mode.hourHand.angle).toBe(0);
            expect(mode.minuteHand.angle).toBe(0);
            await forceChallenge(scene, mode, 12, 30);
            expect(mode.hourHand.angle).toBeCloseTo(15);
            expect(mode.minuteHand.angle).toBeCloseTo(180);
        });

        it('shows one progress ball per required answer plus a gift', () => {
            const balls = scene.liveObjectsOfType('Arc').filter(c => c.radius === 20);
            expect(balls).toHaveLength(mode.requiredCorrect);
            expect(scene.findText('🎁')).not.toBeNull();
        });
    });

    describe('parseSwedishTime', () => {
        const cases = [
            ['klockan tre', { hour: 3, minute: 0 }],
            ['tre', { hour: 3, minute: 0 }],
            ['Klockan Tolv', { hour: 12, minute: 0 }],
            ['klockan ett', { hour: 1, minute: 0 }],
            ['klockan en', { hour: 1, minute: 0 }],
            ['klockan halv två', { hour: 1, minute: 30 }],
            ['halv åtta', { hour: 7, minute: 30 }],
            ['klockan halv ett', { hour: 12, minute: 30 }],
            ['klockan halv tolv', { hour: 11, minute: 30 }],
            ['klockan är fem', { hour: 5, minute: 0 }],
            ['klockan 3', { hour: 3, minute: 0 }],
            ['3:00', { hour: 3, minute: 0 }],
            ['03.30', { hour: 3, minute: 30 }],
            ['halv 3', { hour: 2, minute: 30 }],
            ['halv 1', { hour: 12, minute: 30 }],
            ['banan', null],
            ['klockan tretton', null],
            ['13', null],
            ['3:15', null],
            ['halv', null],
            ['', null]
        ];
        for (const [input, expected] of cases) {
            it(`parses "${input}"`, () => {
                expect(mode.parseSwedishTime(input)).toEqual(expected);
            });
        }

        it('round-trips every challenge time through the spoken form', () => {
            for (let hour = 1; hour <= 12; hour++) {
                for (const minute of [0, 30]) {
                    expect(mode.parseSwedishTime(swedishTime(hour, minute))).toEqual({ hour, minute });
                }
            }
        });
    });

    describe('microphone', () => {
        it('enables the mic button after speech init and starts listening on tap', () => {
            expect(mode.micButton.input && mode.micButton.input.enabled).toBe(true);
            expect(mode.micButton.fillColor).toBe(0xFF6B6B);
            expect(scene.click(mode.micButton)).toBe(true);
            expect(mode.speechHelper.isListening).toBe(true);
            expect(mode.speechHelper.recognition.started).toBe(1);
            expect(mode.micButton.fillColor).toBe(0x27AE60);
            // a second tap while listening does not restart recognition
            scene.click(mode.micButton);
            expect(mode.speechHelper.recognition.started).toBe(1);
        });

        it('leaves the mic disabled when the browser has no speech API', async () => {
            delete window.SpeechRecognition;
            const s2 = new FakeScene();
            const m2 = new ClockReadingMode();
            await startMode(m2, s2);
            await flush();
            expect(m2.micButton.input).toBeNull();
            m2.cleanup(s2);
        });
    });

    describe('happy path', () => {
        it('gives the reward after the required number of correct answers (exactly one callback)', () => {
            for (let i = 0; i < mode.requiredCorrect; i++) {
                scene.click(mode.micButton);
                speakCorrect(mode);
                scene.advance(1200);
            }
            expect(calls).toHaveLength(1);
            expect(calls[0].ok).toBe(true);
            scene.advance(10000);
            expect(calls).toHaveLength(1);
            expect(scene._useAfterDestroy).toEqual([]);
        });

        it('accepts a correct time among the alternatives even if the first transcript is wrong', () => {
            const wrongHour = mode.currentHour === 12 ? 1 : mode.currentHour + 1;
            speak(mode, swedishTime(wrongHour, mode.currentMinute), ['banan', swedishTime(mode.currentHour, mode.currentMinute)]);
            scene.advance(1200);
            expect(mode.correctCount).toBe(1);
        });

        it('accepts 12:00 ("tolv") and 12:30 ("halv ett")', async () => {
            await forceChallenge(scene, mode, 12, 0);
            speak(mode, 'klockan tolv');
            scene.advance(1200);
            expect(mode.correctCount).toBe(1);
            await forceChallenge(scene, mode, 12, 30);
            speak(mode, 'klockan halv ett');
            scene.advance(1200);
            expect(mode.correctCount).toBe(2);
        });

        it('builds a fresh clock and updates progress after a correct answer', () => {
            speakCorrect(mode);
            scene.advance(1200);
            const balls = scene.liveObjectsOfType('Arc').filter(c => c.radius === 20);
            expect(balls[0].fillColor).toBe(0x27AE60);
            expect(balls[1].fillColor).toBe(0xffffff);
            expect(scene.findTexts('🎤')).toHaveLength(1);
            expect(mode.inputLocked).toBe(false);
        });

        it('ignores a second result and mic taps while the correct feedback is showing', () => {
            speakCorrect(mode);
            speakCorrect(mode);
            expect(scene.click(mode.micButton)).toBe(true);
            expect(mode.speechHelper.isListening).toBe(false);
            scene.advance(1200);
            expect(mode.correctCount).toBe(1);
            expect(calls).toHaveLength(0);
            expect(scene.findTexts('🎤')).toHaveLength(1);
        });
    });

    describe('wrong answer', () => {
        it('keeps accumulated progress, resets the streak and moves on to a new clock', () => {
            incrementStreak();
            speakCorrect(mode);
            scene.advance(1200);
            expect(mode.correctCount).toBe(1);

            const before = `${mode.currentHour}:${mode.currentMinute}`;
            speakWrong(mode);
            expect(mode.isRevealing).toBe(true);
            expect(getStreak()).toBe(0);
            scene.advance(100);
            // results during the reveal are ignored
            speakCorrect(mode);
            scene.advance(2500);
            expect(mode.correctCount).toBe(1);
            expect(mode.isRevealing).toBe(false);
            expect(mode.inputLocked).toBe(false);
            expect(`${mode.currentHour}:${mode.currentMinute}`).not.toBe(before);
            expect(scene.findTexts('🎤')).toHaveLength(1);
            expect(calls).toHaveLength(0);
            expect(scene._useAfterDestroy).toEqual([]);
        });

        it('treats unparseable speech as a wrong answer without throwing', () => {
            speak(mode, 'banan');
            scene.advance(2500);
            expect(mode.correctCount).toBe(0);
            expect(calls).toHaveLength(0);
            expect(scene.findTexts('🎤')).toHaveLength(1);
        });
    });

    describe('cleanup', () => {
        it('cancels the reveal, aborts recognition and leaves nothing behind', () => {
            speakWrong(mode);
            scene.advance(100);
            const rec = mode.speechHelper.recognition;
            mode.cleanup(scene);
            expect(rec.aborted).toBe(1);
            expect(mode.speechHelper.recognition).toBeNull();
            const t = scene.time.now;
            scene.advance(10000);
            expect(scene.objectsCreatedAfter(t)).toEqual([]);
            expect(scene.liveObjects()).toEqual([]);
            expect(scene.clock.pendingTimers()).toEqual([]);
            expect(scene.clock.pendingTweens()).toEqual([]);
            expect(scene._useAfterDestroy).toEqual([]);
            expect(calls).toHaveLength(0);
        });

        it('cancels a pending reward timer after the final correct answer', () => {
            for (let i = 0; i < mode.requiredCorrect - 1; i++) {
                speakCorrect(mode);
                scene.advance(1200);
            }
            speakCorrect(mode);
            mode.cleanup(scene);
            scene.advance(10000);
            expect(calls).toHaveLength(0);
            expect(scene.liveObjects()).toEqual([]);
        });

        it('survives cleanup while speech init is still pending (no stale button access)', async () => {
            const s2 = new FakeScene();
            const m2 = new ClockReadingMode();
            await m2.loadConfig();
            m2.generateChallenge();
            m2.createChallengeUI(s2);
            m2.cleanup(s2); // before initialize() resolves
            await flush();
            expect(s2.liveObjects()).toEqual([]);
            expect(s2._useAfterDestroy).toEqual([]);
        });

        it('removes the listening timeout on cleanup', () => {
            scene.click(mode.micButton);
            expect(scene.clock.pendingTimers().length).toBeGreaterThan(0);
            mode.cleanup(scene);
            expect(scene.clock.pendingTimers()).toEqual([]);
        });
    });

    it('never plays an audio key that BootScene did not load', () => {
        expect(scene._missingAudio).toEqual([]);
    });
});
