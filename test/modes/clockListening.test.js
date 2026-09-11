import { describe, it, expect, beforeEach } from 'vitest';
import { FakeScene, startMode } from '../helpers/fakeScene.js';
import { setTestConfig } from '../helpers/setup.js';
import { ClockListeningMode } from '../../src/pokeballGameModes/ClockListeningMode.js';
import { getStreak, incrementStreak } from '../../src/streak.js';

function submitButton(scene) {
    return scene.interactives().find(o => o.type === 'Rectangle' && o.width === 200 && o.height === 70);
}
function expectedHourAngle(hour, minute) { return (hour % 12) * 30 + (minute / 60) * 30; }
function expectedMinuteAngle(minute) { return minute * 6; }

// Drag a hand hitbox so the pointer ends up at `angleDeg` (0 = 12 o'clock,
// clockwise) around the clock centre.
function dragHandTo(scene, mode, hitbox, angleDeg) {
    const rad = (angleDeg - 90) * Math.PI / 180;
    const x = mode.clockCenter.x + Math.cos(rad) * 100;
    const y = mode.clockCenter.y + Math.sin(rad) * 100;
    return scene.drag(hitbox, x, y);
}
function setTime(scene, mode, hour, minute) {
    dragHandTo(scene, mode, mode.minuteHitbox, expectedMinuteAngle(minute));
    dragHandTo(scene, mode, mode.hourHitbox, expectedHourAngle(hour, minute));
}
function setCorrectTime(scene, mode) {
    setTime(scene, mode, mode.currentHour, mode.currentMinute);
}
// Rebuild the UI for a specific time (keeps progress state).
function forceChallenge(scene, mode, hour, minute) {
    mode.cleanup(scene);
    mode.currentHour = hour;
    mode.currentMinute = minute;
    mode.challengeData = { hour, minute };
    mode.createChallengeUI(scene);
}
function audioKeyFor(hour, minute) {
    return minute === 30 ? `clock_audio_${hour}_30` : `clock_audio_${hour}`;
}

describe('ClockListeningMode', () => {
    let scene, mode, calls;
    beforeEach(async () => {
        scene = new FakeScene();
        mode = new ClockListeningMode();
        calls = [];
        mode.setAnswerCallback((ok, answer, x, y) => calls.push({ ok, answer, x, y }));
        await startMode(mode, scene);
    });

    describe('config', () => {
        it('loads required and includeHalfHours from the server config', async () => {
            setTestConfig({ clockListening: { required: 2, includeHalfHours: false } });
            const m = new ClockListeningMode();
            await m.loadConfig();
            expect(m.configLoaded).toBe(true);
            expect(m.requiredCorrect).toBe(2);
            expect(m.includeHalfHours).toBe(false);
        });

        it('falls back to defaults when the section is missing', async () => {
            setTestConfig({ clockListening: undefined });
            const m = new ClockListeningMode();
            await m.loadConfig();
            expect(m.configLoaded).toBe(true);
            expect(m.requiredCorrect).toBe(3);
            expect(m.includeHalfHours).toBe(true);
        });

        it('honours includeHalfHours=false when generating', async () => {
            setTestConfig({ clockListening: { required: 3, includeHalfHours: false } });
            const m = new ClockListeningMode();
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
                expect(mode.currentHour).toBe(hour);
                expect(mode.currentMinute).toBe(minute);
                if (prev) expect(`${hour}:${minute}`).not.toBe(prev);
                prev = `${hour}:${minute}`;
                seenMinutes.add(minute);
                seenHours.add(hour);
            }
            expect(seenMinutes.size).toBe(2);
            expect(seenHours.size).toBe(12);
        });
    });

    describe('audio', () => {
        it('plays the audio for the challenge time on start and on the speaker button', () => {
            const key = audioKeyFor(mode.currentHour, mode.currentMinute);
            expect(scene.playedAudio()).toEqual([key]);
            scene.click(scene.findText('🔊'));
            expect(scene.playedAudio()).toEqual([key, key]);
            expect(scene._missingAudio).toEqual([]);
        });

        it('has a loaded audio key for every hour, whole and half', () => {
            for (let hour = 1; hour <= 12; hour++) {
                for (const minute of [0, 30]) {
                    forceChallenge(scene, mode, hour, minute);
                    expect(scene.lastAudio()).toBe(audioKeyFor(hour, minute));
                }
            }
            expect(scene._missingAudio).toEqual([]);
        });
    });

    describe('clock hands', () => {
        it('starts at 12:00 with both hands pointing up', () => {
            expect(mode.setHour).toBe(12);
            expect(mode.setMinute).toBe(0);
            expect(mode.hourHand.angle).toBe(0);
            expect(mode.minuteHand.angle).toBe(0);
            expect(mode.hourHitbox.input.draggable).toBe(true);
            expect(mode.minuteHitbox.input.draggable).toBe(true);
        });

        it('dragging sets the time and keeps hand angles consistent (hour hand offset at half hours)', () => {
            for (let hour = 1; hour <= 12; hour++) {
                for (const minute of [0, 30]) {
                    setTime(scene, mode, hour, minute);
                    expect(mode.setHour).toBe(hour);
                    expect(mode.setMinute).toBe(minute);
                    expect(mode.hourHand.angle).toBeCloseTo(expectedHourAngle(hour, minute));
                    expect(mode.hourHitbox.angle).toBeCloseTo(expectedHourAngle(hour, minute));
                    expect(mode.minuteHand.angle).toBeCloseTo(expectedMinuteAngle(minute));
                    expect(mode.minuteHitbox.angle).toBeCloseTo(expectedMinuteAngle(minute));
                }
            }
        });

        it('12:30 puts the hour hand halfway between 12 and 1', () => {
            setTime(scene, mode, 12, 30);
            expect(mode.hourHand.angle).toBeCloseTo(15);
            expect(mode.minuteHand.angle).toBeCloseTo(180);
        });

        it('moving the minute hand drags the hour hand along without changing the hour', () => {
            setTime(scene, mode, 5, 0);
            dragHandTo(scene, mode, mode.minuteHitbox, 180);
            expect(mode.setHour).toBe(5);
            expect(mode.setMinute).toBe(30);
            expect(mode.hourHand.angle).toBeCloseTo(165);
            dragHandTo(scene, mode, mode.minuteHitbox, 0);
            expect(mode.setHour).toBe(5);
            expect(mode.hourHand.angle).toBeCloseTo(150);
        });
    });

    describe('happy path', () => {
        it('gives the reward after the required number of correct answers (exactly one callback)', () => {
            for (let i = 0; i < mode.requiredCorrect; i++) {
                setCorrectTime(scene, mode);
                expect(scene.click(submitButton(scene))).toBe(true);
                scene.advance(1200);
            }
            expect(calls).toHaveLength(1);
            expect(calls[0].ok).toBe(true);
            scene.advance(10000);
            expect(calls).toHaveLength(1);
            expect(scene._useAfterDestroy).toEqual([]);
        });

        it('accepts 12:00 and 12:30 answers', () => {
            forceChallenge(scene, mode, 12, 0);
            setCorrectTime(scene, mode);
            scene.click(submitButton(scene));
            scene.advance(1200);
            expect(mode.correctInRow).toBe(1);

            forceChallenge(scene, mode, 12, 30);
            setCorrectTime(scene, mode);
            scene.click(submitButton(scene));
            scene.advance(1200);
            expect(mode.correctInRow).toBe(2);
            expect(calls).toHaveLength(0);
        });

        it('progress indicators follow the number of correct answers', () => {
            setCorrectTime(scene, mode);
            scene.click(submitButton(scene));
            scene.advance(1200);
            const balls = scene.liveObjectsOfType('Arc').filter(c => c.radius === 20);
            expect(balls).toHaveLength(mode.requiredCorrect);
            expect(balls[0].fillColor).toBe(0x27AE60);
            expect(balls[1].fillColor).toBe(0xffffff);
        });

        it('ignores extra submit taps and drags while the next challenge is loading', () => {
            setCorrectTime(scene, mode);
            const btn = submitButton(scene);
            scene.click(btn);
            scene.click(btn);
            scene.click(btn);
            // dragging must not change the dialled time either
            const before = { h: mode.setHour, m: mode.setMinute };
            dragHandTo(scene, mode, mode.hourHitbox, 90);
            expect(mode.setHour).toBe(before.h);
            expect(mode.setMinute).toBe(before.m);
            scene.advance(1200);
            expect(mode.correctInRow).toBe(1);
            expect(calls).toHaveLength(0);
            expect(scene.findTexts('🔊')).toHaveLength(1);
        });
    });

    describe('wrong answer', () => {
        it('reveals the correct time, resets progress and streak, then lets the player retry', () => {
            incrementStreak();
            setCorrectTime(scene, mode);
            scene.click(submitButton(scene));
            scene.advance(1200);
            expect(mode.correctInRow).toBe(1);

            const { currentHour, currentMinute } = mode;
            const wrongHour = currentHour === 12 ? 1 : currentHour + 1;
            setTime(scene, mode, wrongHour, currentMinute);
            scene.click(submitButton(scene));
            expect(mode.correctInRow).toBe(0);
            expect(getStreak()).toBe(0);
            expect(mode.isRevealing).toBe(true);

            // Hands animate to the correct time (shake 400ms + 800ms tween)
            scene.advance(1300);
            expect(mode.hourHand.angle).toBeCloseTo(expectedHourAngle(currentHour, currentMinute));
            expect(mode.minuteHand.angle).toBeCloseTo(expectedMinuteAngle(currentMinute));
            expect(mode.hourHand.fillColor).toBe(0xFFD700);

            // Then reset to 12:00, same challenge, answerable again
            scene.advance(800);
            expect(mode.isRevealing).toBe(false);
            expect(mode.inputLocked).toBe(false);
            expect(mode.setHour).toBe(12);
            expect(mode.setMinute).toBe(0);
            expect(mode.hourHand.angle).toBe(0);
            expect(mode.hourHand.fillColor).toBe(0x2C3E50);
            expect(mode.currentHour).toBe(currentHour);
            expect(mode.currentMinute).toBe(currentMinute);
            // The red flash overlay is gone
            expect(scene.liveObjectsOfType('Arc').filter(c => c.radius === 150)).toHaveLength(0);
            expect(calls).toHaveLength(0);

            setCorrectTime(scene, mode);
            scene.click(submitButton(scene));
            scene.advance(1200);
            expect(mode.correctInRow).toBe(1);
        });

        it('ignores submit taps and drags while the answer is being revealed', () => {
            setTime(scene, mode, mode.currentHour, mode.currentMinute === 0 ? 30 : 0);
            scene.click(submitButton(scene));
            scene.advance(100);
            const timersBefore = scene.clock.pendingTimers().length;
            scene.click(submitButton(scene));
            expect(scene.clock.pendingTimers().length).toBe(timersBefore);
            dragHandTo(scene, mode, mode.minuteHitbox, 90);
            expect(mode.setMinute).not.toBe(15);
            scene.advance(3000);
            expect(mode.correctInRow).toBe(0);
            expect(calls).toHaveLength(0);
        });
    });

    describe('cleanup', () => {
        it('cancels the reveal and leaves nothing behind', () => {
            setTime(scene, mode, mode.currentHour, mode.currentMinute === 0 ? 30 : 0);
            scene.click(submitButton(scene));
            scene.advance(100);
            mode.cleanup(scene);
            const t = scene.time.now;
            scene.advance(10000);
            expect(scene.objectsCreatedAfter(t)).toEqual([]);
            expect(scene.liveObjects()).toEqual([]);
            expect(scene.clock.pendingTimers()).toEqual([]);
            expect(scene.clock.pendingTweens()).toEqual([]);
            expect(scene.playingSounds()).toEqual([]);
            expect(scene._useAfterDestroy).toEqual([]);
            expect(calls).toHaveLength(0);
        });

        it('cancels a pending next-challenge / reward timer after a correct answer', () => {
            setCorrectTime(scene, mode);
            scene.click(submitButton(scene));
            mode.cleanup(scene);
            const t = scene.time.now;
            scene.advance(10000);
            expect(scene.objectsCreatedAfter(t)).toEqual([]);
            expect(scene.liveObjects()).toEqual([]);
            expect(calls).toHaveLength(0);
        });
    });

    it('never plays an audio key that BootScene did not load', () => {
        expect(scene._missingAudio).toEqual([]);
    });
});
