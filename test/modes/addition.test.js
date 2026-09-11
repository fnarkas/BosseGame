import { describe, it, expect, beforeEach } from 'vitest';
import { getJSON } from '../../src/storage.js';
import { FakeScene, startMode } from '../helpers/fakeScene.js';
import { setTestConfig } from '../helpers/setup.js';
import { AdditionMode } from '../../src/pokeballGameModes/AdditionMode.js';
import { getStreak, incrementStreak } from '../../src/streak.js';

// A stand-in for the scene's booster bar so the streak reset path runs for real.
function fakeBoosterBar(scene) {
    return {
        multiplierText: scene.add.text(0, 0, 'x3'),
        fills: [0, 1, 2, 3, 4].map(() => scene.add.rectangle(0, 0, 10, 10, 0xffffff)),
        glowTween: null
    };
}

describe('AdditionMode', () => {
    let scene, mode, calls;

    const boxFor = (digit) => mode.digitBoxes.find(d => d.digit === digit).box;
    const dropInto = (digit, zone) => scene.drag(boxFor(digit), zone.x, zone.y);
    const answer = (value) => {
        dropInto(Math.floor(value / 10), mode.tensZone);
        dropInto(value % 10, mode.onesZone);
    };
    const correct = () => mode.challengeData.correctAnswer;
    const wrongAnswer = () => (correct() + 1) % 100;

    beforeEach(async () => {
        scene = new FakeScene();
        mode = new AdditionMode();
        calls = [];
        mode.setAnswerCallback((ok, answer, x, y) => calls.push({ ok, answer, x, y }));
        await startMode(mode, scene);
    });

    // ---------------- config ----------------

    describe('config', () => {
        it('loads the checked-in defaults', () => {
            expect(mode.configLoaded).toBe(true);
            expect(mode.numberOfTerms).toBe(2);
            expect(mode.maxSum).toBe(99);
            expect(mode.onlyOneMultiDigit).toBe(true);
        });

        it('reads every field and honours false for onlyOneMultiDigit', async () => {
            setTestConfig({ addition: { numberOfTerms: 3, maxSum: 30, onlyOneMultiDigit: false } });
            const m = new AdditionMode();
            await m.loadConfig();
            expect(m.numberOfTerms).toBe(3);
            expect(m.maxSum).toBe(30);
            expect(m.onlyOneMultiDigit).toBe(false);
            expect(m.configLoaded).toBe(true);
        });

        it('clamps maxSum to 99 because the answer only has two digit slots', async () => {
            setTestConfig({ addition: { numberOfTerms: 2, maxSum: 500, onlyOneMultiDigit: true } });
            const m = new AdditionMode();
            await m.loadConfig();
            expect(m.maxSum).toBe(99);
        });

        it('falls back to defaults when the section is missing', async () => {
            setTestConfig({ addition: undefined });
            const m = new AdditionMode();
            await m.loadConfig();
            expect(m.configLoaded).toBe(true);
            expect(m.numberOfTerms).toBe(2);
            expect(m.maxSum).toBe(99);
            expect(m.onlyOneMultiDigit).toBe(true);
        });
    });

    // ---------------- challenge generation ----------------

    describe('challenge generation', () => {
        const configs = [
            { numberOfTerms: 2, maxSum: 99, onlyOneMultiDigit: true },
            { numberOfTerms: 2, maxSum: 99, onlyOneMultiDigit: false },
            { numberOfTerms: 3, maxSum: 99, onlyOneMultiDigit: true },
            { numberOfTerms: 3, maxSum: 30, onlyOneMultiDigit: false },
            { numberOfTerms: 4, maxSum: 50, onlyOneMultiDigit: true },
            { numberOfTerms: 2, maxSum: 15, onlyOneMultiDigit: true },
            { numberOfTerms: 2, maxSum: 12, onlyOneMultiDigit: true },
            { numberOfTerms: 2, maxSum: 9, onlyOneMultiDigit: true },
            { numberOfTerms: 2, maxSum: 5, onlyOneMultiDigit: false }
        ];

        for (const cfg of configs) {
            it(`respects ${JSON.stringify(cfg)} over 500 challenges`, () => {
                const m = new AdditionMode();
                Object.assign(m, cfg);
                for (let i = 0; i < 500; i++) {
                    const c = m.generateChallenge();
                    expect(c.terms).toHaveLength(cfg.numberOfTerms);
                    for (const t of c.terms) {
                        expect(Number.isInteger(t)).toBe(true);
                        expect(t).toBeGreaterThanOrEqual(0);
                    }
                    const sum = c.terms.reduce((a, b) => a + b, 0);
                    expect(c.correctAnswer).toBe(sum);
                    expect(sum).toBeLessThanOrEqual(cfg.maxSum);
                    expect(sum).toBeLessThanOrEqual(99);
                    expect(c.tens * 10 + c.ones).toBe(sum);
                    expect(c.tens).toBeGreaterThanOrEqual(0);
                    expect(c.tens).toBeLessThanOrEqual(9);
                    expect(c.ones).toBeGreaterThanOrEqual(0);
                    expect(c.ones).toBeLessThanOrEqual(9);
                    if (cfg.onlyOneMultiDigit) {
                        expect(c.terms.filter(t => t >= 10).length).toBeLessThanOrEqual(1);
                    }
                }
            });
        }

        it('uses a multi-digit term whenever there is room for one (default config)', () => {
            for (let i = 0; i < 300; i++) {
                const c = mode.generateChallenge();
                expect(c.terms.filter(t => t >= 10).length).toBe(1);
            }
        });

        it('never repeats the same problem back to back', () => {
            let prev = mode.challengeData.terms.join('+');
            for (let i = 0; i < 300; i++) {
                const c = mode.generateChallenge();
                const key = c.terms.join('+');
                expect(key).not.toBe(prev);
                prev = key;
            }
        });
    });

    // ---------------- UI ----------------

    describe('UI', () => {
        it('shows the problem as learning text, two zones and ten draggable digits', () => {
            expect(scene.findText(mode.challengeData.terms.join(' + ') + ' = ?')).not.toBeNull();
            expect(mode.digitBoxes.map(d => d.digit)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
            mode.digitBoxes.forEach(d => expect(d.box.input.draggable).toBe(true));
            expect(mode.tensZone.getData('value')).toBeNull();
            expect(mode.onesZone.getData('value')).toBeNull();
            expect(mode.progressBalls.circles).toHaveLength(3);
            expect(scene.playedAudio()).toEqual([]);
        });

        it('snaps a digit back when dropped outside both zones', () => {
            const box = boxFor(4);
            const ox = box.getData('originalX');
            const oy = box.getData('originalY');
            scene.drag(box, 30, 30);
            expect(box.x).toBe(ox);
            expect(box.y).toBe(oy);
            expect(mode.tensZone.getData('value')).toBeNull();
            expect(mode.correctInRow).toBe(0);
        });

        it('replaces a digit already sitting in a zone', () => {
            dropInto(3, mode.tensZone);
            expect(mode.tensZone.getData('label').text).toBe('3');
            dropInto(7, mode.tensZone);
            expect(mode.tensZone.getData('value')).toBe(7);
            expect(mode.tensZone.getData('label').text).toBe('7');
            expect(boxFor(3).x).toBe(boxFor(3).getData('originalX'));
        });

        it('dragging a placed digit away clears its zone', () => {
            dropInto(3, mode.tensZone);
            scene.drag(boxFor(3), 30, 30);
            expect(mode.tensZone.getData('value')).toBeNull();
            expect(mode.tensZone.getData('label').text).toBe('');
        });

        it('does nothing until both zones are filled', () => {
            dropInto(Math.floor(correct() / 10), mode.tensZone);
            scene.advance(2000);
            expect(mode.correctInRow).toBe(0);
            expect(calls).toHaveLength(0);
        });

        it('ignores drags of objects that are not its digit boxes', () => {
            const foreign = scene.add.rectangle(10, 10, 10, 10, 0xff0000);
            foreign.setInteractive();
            scene.input.setDraggable(foreign);
            scene.drag(foreign, mode.tensZone.x, mode.tensZone.y);
            expect(mode.tensZone.getData('value')).toBeNull();
            expect(scene._useAfterDestroy).toEqual([]);
        });
    });

    // ---------------- happy path ----------------

    describe('answering', () => {
        it('rewards exactly once after three correct answers in a row', () => {
            for (let i = 0; i < 3; i++) {
                const start = scene.time.now;
                answer(correct());
                expect(mode.correctInRow).toBe(i + 1);
                expect(mode.tensZone.fillColor).toBe(0x27AE60);
                scene.advance(1000);
                if (i < 2) {
                    // A fresh challenge was built
                    expect(scene.objectsCreatedAfter(start).length).toBeGreaterThan(0);
                    expect(mode.tensZone.getData('value')).toBeNull();
                    expect(mode.inputLocked).toBe(false);
                    expect(mode.progressBalls.circles.filter(b => b.fillColor === 0x27AE60)).toHaveLength(i + 1);
                }
            }
            expect(calls).toHaveLength(1);
            expect(calls[0].ok).toBe(true);
            expect(typeof calls[0].answer).toBe('number');
            scene.advance(10000);
            expect(calls).toHaveLength(1);
            expect(scene._useAfterDestroy).toEqual([]);
        });

        it('solves an answer with two equal digits using the single box for that digit', () => {
            mode.cleanup(scene);
            mode.challengeData = { terms: [5, 6], correctAnswer: 11, tens: 1, ones: 1 };
            mode.createChallengeUI(scene);
            dropInto(1, mode.tensZone);
            dropInto(1, mode.onesZone);
            expect(mode.correctInRow).toBe(1);
            expect(mode.tensZone.getData('label').text).toBe('1');
            expect(mode.onesZone.getData('label').text).toBe('1');
        });

        it('locks input while the correct-answer feedback plays', () => {
            answer(correct());
            expect(mode.correctInRow).toBe(1);
            const problem = mode.challengeData;
            // Try to answer again during the 800ms feedback window
            const other = (correct() % 10 + 1) % 10;
            scene.drag(boxFor(other), mode.onesZone.x, mode.onesZone.y);
            expect(mode.correctInRow).toBe(1);
            expect(mode.onesZone.getData('value')).toBe(correct() % 10);
            expect(scene.clock.pendingTimers()).toHaveLength(1);
            scene.advance(1000);
            expect(mode.challengeData).not.toBe(problem);
            expect(mode.correctInRow).toBe(1);
            expect(calls).toHaveLength(0);
        });

        it('never sends the reward twice even if the winning answer is re-dropped', () => {
            for (let i = 0; i < 2; i++) { answer(correct()); scene.advance(1000); }
            answer(correct());
            answer(correct());
            dropInto(correct() % 10, mode.onesZone);
            scene.advance(5000);
            expect(calls).toHaveLength(1);
        });
    });

    // ---------------- wrong answers ----------------

    describe('wrong answers', () => {
        it('resets progress and the streak, reveals and speaks the answer, then asks the same problem again', () => {
            answer(correct());
            scene.advance(1000);
            expect(mode.correctInRow).toBe(1);
            incrementStreak(); incrementStreak();
            scene.boosterBarElements = fakeBoosterBar(scene);

            const problem = mode.challengeData;
            const start = scene.time.now;
            answer(wrongAnswer());
            expect(mode.isRevealing).toBe(true);
            expect(mode.correctInRow).toBe(0);
            expect(mode.tensZone.fillColor).toBe(0xFF0000);
            expect(mode.progressBalls.circles.every(b => b.fillColor === 0xffffff)).toBe(true);
            expect(scene.playedAudio()).toEqual([]);

            // After the shake, the correct digits are shown in gold and the sum is spoken
            scene.advance(500);
            expect(mode.tensZone.fillColor).toBe(0xFFD700);
            expect(mode.tensZone.getData('label').text).toBe(String(problem.tens));
            expect(mode.onesZone.getData('label').text).toBe(String(problem.ones));
            expect(scene.playedAudio()).toEqual([`number_audio_${problem.correctAnswer}`]);

            // Drops during the reveal are ignored (use a digit box that is still
            // at home, i.e. not one of the two used for the wrong answer)
            const wrong = wrongAnswer();
            const used = new Set([Math.floor(wrong / 10), wrong % 10]);
            const spareDigit = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].find(d => !used.has(d) && boxFor(d).x === boxFor(d).getData('originalX'));
            const box = boxFor(spareDigit);
            scene.drag(box, mode.onesZone.x, mode.onesZone.y);
            expect(box.x).toBe(box.getData('originalX'));
            expect(mode.onesZone.getData('label').text).toBe(String(problem.ones));

            scene.advance(2500);
            expect(mode.isRevealing).toBe(false);
            expect(mode.inputLocked).toBe(false);
            expect(mode.challengeData).not.toBe(problem);
            expect(mode.challengeData.terms).toEqual(problem.terms); // re-asked
            expect(getStreak()).toBe(0);
            expect(scene.boosterBarElements.multiplierText.text).toBe('x1');
            expect(scene.objectsCreatedAfter(start).length).toBeGreaterThan(0);
            expect(calls).toHaveLength(0);
            expect(scene._useAfterDestroy).toEqual([]);

            // And the new problem is answerable
            answer(correct());
            expect(mode.correctInRow).toBe(1);
        });

        it('re-asks a missed problem immediately and once more two rounds later', () => {
            mode.requiredCorrect = 10;
            const missed = mode.challengeData.terms;
            answer(wrongAnswer());
            scene.advance(2500);
            expect(mode.challengeData.terms).toEqual(missed);
            answer(correct());
            scene.advance(1000);
            expect(mode.challengeData.terms).not.toEqual(missed);
            answer(correct());
            scene.advance(1000);
            expect(mode.challengeData.terms).toEqual(missed);
        });

        it('tracks the mistake', () => {
            answer(wrongAnswer());
            const data = getJSON('wrongAnswers');
            expect(data.mistakeCounts.AdditionMode).toBeDefined();
            expect(data.totalMistakes).toBe(1);
        });
    });

    // ---------------- cleanup ----------------

    describe('cleanup', () => {
        it('leaves nothing behind when torn down mid wrong-answer reveal', () => {
            answer(wrongAnswer());
            scene.advance(100);
            mode.cleanup(scene);
            const t = scene.time.now;
            scene.advance(10000);
            expect(scene.objectsCreatedAfter(t)).toEqual([]);
            expect(scene.liveObjects()).toEqual([]);
            expect(scene.clock.pendingTimers()).toEqual([]);
            expect(scene.clock.pendingTweens()).toEqual([]);
            expect(scene._useAfterDestroy).toEqual([]);
            expect(calls).toHaveLength(0);
            expect(scene.input._emitter.listenerCount('drag')).toBe(0);
            expect(scene.input._emitter.listenerCount('dragend')).toBe(0);
        });

        it('leaves nothing behind when torn down mid correct-answer feedback', () => {
            answer(correct());
            mode.cleanup(scene);
            const t = scene.time.now;
            scene.advance(10000);
            expect(scene.objectsCreatedAfter(t)).toEqual([]);
            expect(scene.liveObjects()).toEqual([]);
            expect(scene._useAfterDestroy).toEqual([]);
            expect(calls).toHaveLength(0);
        });

        it('only removes its own drag listeners', () => {
            let foreignCalls = 0;
            const foreign = () => foreignCalls++;
            scene.input.on('drag', foreign);
            mode.cleanup(scene);
            scene.input._emitter.emit('drag', {}, {}, 0, 0);
            expect(foreignCalls).toBe(1);
        });
    });
});
