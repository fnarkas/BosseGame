import { describe, it, expect, beforeEach } from 'vitest';
import { FakeScene, startMode } from '../helpers/fakeScene.js';
import { setTestConfig } from '../helpers/setup.js';
import { MultiplicationMode } from '../../src/pokeballGameModes/MultiplicationMode.js';
import { getStreak, incrementStreak } from '../../src/streak.js';

// A stand-in for the scene's booster bar so the streak reset path runs for real.
function fakeBoosterBar(scene) {
    return {
        multiplierText: scene.add.text(0, 0, 'x3'),
        fills: [0, 1, 2, 3, 4].map(() => scene.add.rectangle(0, 0, 10, 10, 0xffffff)),
        glowTween: null
    };
}

// Generous: the longest reveal (10 rows) + transpose + pause is ~5.5 s.
const ROUND_MS = 8000;

// Mirrors the mode's per-row pacing so tests can stop right after the reveal.
const stepMsFor = (rows) => Math.min(700, Math.max(320, Math.round(2600 / rows)));
const revealMsFor = (rows) => rows * stepMsFor(rows) + 250;

describe('MultiplicationMode', () => {
    let scene, mode, calls;

    const boxFor = (digit) => mode.digitBoxes.find(d => d.digit === digit).box;

    const spareBox = () => mode.digitBoxes.map(d => d.box).find(b => b.x === b.getData('originalX') && b.y === b.getData('originalY'));
    const dropInto = (digit, zone) => scene.drag(boxFor(digit), zone.x, zone.y);
    const answer = (value) => {
        dropInto(Math.floor(value / 10), mode.tensZone);
        dropInto(value % 10, mode.onesZone);
    };
    const product = () => mode.challengeData.product;
    const wrongAnswer = () => (product() + 1) % 100;

    beforeEach(async () => {
        scene = new FakeScene();
        mode = new MultiplicationMode();
        calls = [];
        mode.setAnswerCallback((ok, answer, x, y) => calls.push({ ok, answer, x, y }));
        await startMode(mode, scene);
    });

    // ---------------- config ----------------

    describe('config', () => {
        it('loads the checked-in defaults', () => {
            expect(mode.configLoaded).toBe(true);
            expect(mode.requiredCorrect).toBe(3);
            expect(mode.tables).toEqual([2, 5, 10]);
            expect(mode.maxFactor).toBe(10);
            expect(mode.maxProduct).toBe(99);
            expect(mode.commutativityEnabled).toBe(true);
        });

        it('parses ranges and lists of tables, dropping junk', async () => {
            setTestConfig({ multiplication: { required: 2, tables: '1-3, 10, x, 0, 5-4', maxFactor: 5, maxProduct: 40, showCommutativity: false } });
            const m = new MultiplicationMode();
            await m.loadConfig();
            expect(m.requiredCorrect).toBe(2);
            expect(m.tables).toEqual([1, 2, 3, 10]);
            expect(m.maxFactor).toBe(5);
            expect(m.maxProduct).toBe(40);
            expect(m.commutativityEnabled).toBe(false);
        });

        it('falls back to 2,5,10 when no table is valid and clamps maxProduct to 99', async () => {
            setTestConfig({ multiplication: { tables: 'abc', maxProduct: 500 } });
            const m = new MultiplicationMode();
            await m.loadConfig();
            expect(m.tables).toEqual([2, 5, 10]);
            expect(m.maxProduct).toBe(99);
        });

        it('falls back to defaults when the section is missing', async () => {
            setTestConfig({ multiplication: undefined });
            const m = new MultiplicationMode();
            await m.loadConfig();
            expect(m.configLoaded).toBe(true);
            expect(m.tables).toEqual([2, 5, 10]);
            expect(m.requiredCorrect).toBe(3);
        });
    });

    // ---------------- challenge generation ----------------

    describe('challenge generation', () => {
        const configs = [
            { tables: [2, 5, 10], maxFactor: 10, maxProduct: 99 },
            { tables: [10], maxFactor: 10, maxProduct: 99 },
            { tables: [3, 4], maxFactor: 12, maxProduct: 40 },
            { tables: [1, 2, 3, 4, 5, 6, 7, 8, 9], maxFactor: 10, maxProduct: 99 },
            { tables: [9], maxFactor: 3, maxProduct: 99 },
            { tables: [2], maxFactor: 1, maxProduct: 99 }
        ];

        for (const cfg of configs) {
            it(`respects ${JSON.stringify(cfg)} over 500 challenges`, () => {
                const m = new MultiplicationMode();
                Object.assign(m, cfg);
                const seenTables = new Set();
                for (let i = 0; i < 500; i++) {
                    const c = m.generateChallenge();
                    expect(cfg.tables).toContain(c.cols);
                    expect(c.rows).toBeGreaterThanOrEqual(1);
                    expect(c.rows).toBeLessThanOrEqual(cfg.maxFactor);
                    expect(c.product).toBe(c.rows * c.cols);
                    expect(c.product).toBeLessThanOrEqual(cfg.maxProduct);
                    expect(c.product).toBeLessThanOrEqual(99);
                    expect(c.tens * 10 + c.ones).toBe(c.product);
                    expect(c.tens).toBeLessThanOrEqual(9);
                    seenTables.add(c.cols);
                }
                // Every configured table that fits under maxProduct gets practised
                const usable = cfg.tables.filter(t => t <= cfg.maxProduct);
                expect([...seenTables].sort((a, b) => a - b)).toEqual(usable);
            });
        }

        it('never repeats the same problem back to back', () => {
            let prev = `${mode.challengeData.rows}x${mode.challengeData.cols}`;
            for (let i = 0; i < 300; i++) {
                const c = mode.generateChallenge();
                const key = `${c.rows}x${c.cols}`;
                expect(key).not.toBe(prev);
                prev = key;
            }
        });

        it('is allowed to repeat when there is only one possible problem', () => {
            const m = new MultiplicationMode();
            Object.assign(m, { tables: [2], maxFactor: 1, maxProduct: 99 });
            for (let i = 0; i < 5; i++) {
                expect(m.generateChallenge()).toMatchObject({ rows: 1, cols: 2, product: 2 });
            }
        });
    });

    // ---------------- UI + audio ----------------

    describe('UI and audio', () => {
        it('shows the problem, one pokeball per cell, zones, digits and a speaker', () => {
            const { rows, cols } = mode.challengeData;
            expect(scene.findText(`${rows} × ${cols}`)).not.toBeNull();
            expect(scene.liveObjectsOfType('Image')).toHaveLength(rows * cols);
            expect(mode.rowHighlights).toHaveLength(rows);
            expect(mode.rowTotals.every(t => t.alpha === 0)).toBe(true);
            expect(mode.digitBoxes.map(d => d.digit)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
            expect(scene.findText('🔊')).not.toBeNull();
            expect(mode.ballIndicators).toHaveLength(3);
        });

        it('says "rows gånger cols" at the start, stitched from loaded audio keys', () => {
            const { rows, cols } = mode.challengeData;
            expect(scene.playedAudio()).toEqual([]);
            scene.advance(300);
            expect(scene.playedAudio()).toEqual([`number_audio_${rows}`]);
            scene.advance(600);
            expect(scene.playedAudio()).toEqual([`number_audio_${rows}`, 'math_audio_ganger']);
            scene.advance(600);
            expect(scene.playedAudio()).toEqual([`number_audio_${rows}`, 'math_audio_ganger', `number_audio_${cols}`]);
            expect(scene._missingAudio).toEqual([]);
        });

        it('replays the problem from the speaker and restarts a phrase in progress', () => {
            const { rows, cols } = mode.challengeData;
            scene.advance(300);
            scene.click(scene.findText('🔊'));
            scene.advance(2000);
            expect(scene.playedAudio()).toEqual([
                `number_audio_${rows}`, `number_audio_${rows}`, 'math_audio_ganger', `number_audio_${cols}`
            ]);
        });

        it('snaps a digit back when dropped outside both zones', () => {
            const box = boxFor(4);
            scene.drag(box, 30, 30);
            expect(box.x).toBe(box.getData('originalX'));
            expect(mode.tensZone.getData('value')).toBeNull();
        });

        it('does nothing until both zones are filled', () => {
            dropInto(mode.challengeData.tens, mode.tensZone);
            scene.advance(ROUND_MS);
            expect(mode.correctCount).toBe(0);
            expect(calls).toHaveLength(0);
        });
    });

    // ---------------- happy path ----------------

    describe('answering', () => {
        it('skip-counts every row with audio, transposes, then moves on', () => {
            scene.advance(2000); // let the intro phrase finish
            const { rows, cols, product: p } = mode.challengeData;
            const before = scene.playedAudio().length;
            answer(p);
            expect(mode.correctCount).toBe(1);
            expect(mode.isRevealing).toBe(true);
            expect(mode.tensZone.fillColor).toBe(0x27AE60);

            scene.advance(revealMsFor(rows) + 50);
            const counted = scene.playedAudio().slice(before);
            expect(counted).toEqual(Array.from({ length: rows }, (_, r) => `number_audio_${(r + 1) * cols}`));
            expect(mode.rowHighlights.every(b => b.fillColor === 0x27AE60)).toBe(true);
            expect(mode.rowTotals.map(t => t.text)).toEqual(Array.from({ length: rows }, (_, r) => String((r + 1) * cols)));
            expect(mode.problemDisplay.text).toBe(`${rows} × ${cols} = ${p}`);

            if (rows !== cols) {
                scene.advance(500);
                expect(mode.problemDisplay.text).toBe(`${cols} × ${rows} = ${p}`);
            }
            scene.advance(ROUND_MS);
            expect(mode.isRevealing).toBe(false);
            expect(mode.inputLocked).toBe(false);
            expect(mode.tensZone.getData('value')).toBeNull();
            expect(mode.ballIndicators.filter(b => b.fillColor === 0x27AE60)).toHaveLength(1);
            expect(calls).toHaveLength(0);
            expect(scene._useAfterDestroy).toEqual([]);
            expect(scene._missingAudio).toEqual([]);
        });

        it('rewards exactly once after the required number of correct answers', () => {
            for (let i = 0; i < 3; i++) {
                answer(product());
                expect(mode.correctCount).toBe(i + 1);
                scene.advance(ROUND_MS);
            }
            expect(calls).toHaveLength(1);
            expect(calls[0].ok).toBe(true);
            expect(calls[0].answer).toBe(mode.challengeData.product);
            scene.advance(20000);
            expect(calls).toHaveLength(1);
            expect(scene._useAfterDestroy).toEqual([]);
            expect(scene._missingAudio).toEqual([]);
        });

        it('honours a configured required count', async () => {
            setTestConfig({ multiplication: { required: 2, tables: '2,5,10', maxFactor: 10, maxProduct: 99, showCommutativity: false } });
            scene = new FakeScene();
            mode = new MultiplicationMode();
            calls = [];
            mode.setAnswerCallback((ok, answer) => calls.push({ ok, answer }));
            await startMode(mode, scene);
            expect(mode.ballIndicators).toHaveLength(2);
            for (let i = 0; i < 2; i++) { answer(product()); scene.advance(ROUND_MS); }
            expect(calls).toHaveLength(1);
        });

        it('skips the transpose when commutativity is off or the array is square', () => {
            mode.commutativityEnabled = false;
            const { rows, cols, product: p } = mode.challengeData;
            answer(p);
            scene.advance(revealMsFor(rows) + 50);
            expect(mode.problemDisplay.text).toBe(`${rows} × ${cols} = ${p}`);
            scene.advance(500);
            expect(mode.problemDisplay.text).toBe(`${rows} × ${cols} = ${p}`);
        });

        it('locks input while the correct-answer reveal plays', () => {
            const p = product();
            answer(p);
            const problem = mode.challengeData;
            const timers = scene.clock.pendingTimers().length;
            // A digit box that is still at home (not one of the two just placed)
            const box = spareBox();
            scene.drag(box, mode.onesZone.x, mode.onesZone.y);
            expect(box.x).toBe(box.getData('originalX'));
            expect(mode.onesZone.getData('value')).toBe(p % 10);
            expect(mode.correctCount).toBe(1);
            expect(scene.clock.pendingTimers().length).toBe(timers);
            // The speaker is silent during the lesson
            const played = scene.playedAudio().length;
            scene.click(scene.findText('🔊'));
            expect(scene.playedAudio().length).toBe(played);
            scene.advance(ROUND_MS);
            expect(mode.challengeData).not.toBe(problem);
            expect(mode.correctCount).toBe(1);
        });

        it('never sends the reward twice even if the winning answer is re-dropped', () => {
            for (let i = 0; i < 2; i++) { answer(product()); scene.advance(ROUND_MS); }
            answer(product());
            answer(product());
            scene.advance(ROUND_MS);
            dropInto(product() % 10, mode.onesZone);
            scene.advance(ROUND_MS);
            expect(calls).toHaveLength(1);
        });
    });

    // ---------------- wrong answers ----------------

    describe('wrong answers', () => {
        it('keeps progress but resets the streak, reveals and skip-counts, then moves on', () => {
            answer(product());
            scene.advance(ROUND_MS);
            expect(mode.correctCount).toBe(1);
            incrementStreak(); incrementStreak();
            scene.boosterBarElements = fakeBoosterBar(scene);

            const problem = mode.challengeData;
            const before = scene.playedAudio().length;
            const start = scene.time.now;
            answer(wrongAnswer());
            expect(mode.isRevealing).toBe(true);
            expect(mode.correctCount).toBe(1);
            expect(getStreak()).toBe(0);
            expect(scene.boosterBarElements.multiplierText.text).toBe('x1');
            expect(mode.tensZone.fillColor).toBe(0xFF0000);

            // After the shake, the correct digits are shown in gold
            scene.advance(500);
            expect(mode.tensZone.fillColor).toBe(0xFFD700);
            expect(mode.tensZone.getData('label').text).toBe(String(problem.tens));
            expect(mode.onesZone.getData('label').text).toBe(String(problem.ones));

            // Drops during the reveal are ignored
            const box = spareBox();
            scene.drag(box, mode.onesZone.x, mode.onesZone.y);
            expect(box.x).toBe(box.getData('originalX'));
            expect(mode.onesZone.getData('label').text).toBe(String(problem.ones));

            scene.advance(ROUND_MS);
            const counted = scene.playedAudio().slice(before);
            expect(counted.slice(0, problem.rows)).toEqual(
                Array.from({ length: problem.rows }, (_, r) => `number_audio_${(r + 1) * problem.cols}`)
            );
            expect(mode.isRevealing).toBe(false);
            expect(mode.inputLocked).toBe(false);
            expect(mode.challengeData).not.toBe(problem);
            expect(mode.correctCount).toBe(1);
            expect(scene.objectsCreatedAfter(start).length).toBeGreaterThan(0);
            expect(calls).toHaveLength(0);
            expect(scene._useAfterDestroy).toEqual([]);
            expect(scene._missingAudio).toEqual([]);

            // And the new problem is answerable
            answer(product());
            expect(mode.correctCount).toBe(2);
        });

        it('tracks the mistake', () => {
            answer(wrongAnswer());
            const data = JSON.parse(localStorage.getItem('wrongAnswers'));
            expect(data.mistakeCounts.MultiplicationMode).toBeDefined();
            expect(data.totalMistakes).toBe(1);
        });
    });

    // ---------------- cleanup ----------------

    for (const [label, act] of [
        ['mid intro phrase', () => scene.advance(100)],
        ['mid wrong-answer shake', () => { answer(wrongAnswer()); scene.advance(100); }],
        ['mid wrong-answer skip-count', () => { answer(wrongAnswer()); scene.advance(1000); }],
        ['mid correct-answer skip-count', () => { answer(product()); scene.advance(500); }],
        ['mid transpose', () => { answer(product()); scene.advance(revealMsFor(mode.challengeData.rows) + 100); }],
        ['just before the reward', () => {
            for (let i = 0; i < 2; i++) { answer(product()); scene.advance(ROUND_MS); }
            const { rows, cols } = mode.challengeData;
            answer(product());
            const rewardAt = revealMsFor(rows) + (rows !== cols ? 1300 : 0) + 500;
            scene.advance(rewardAt - 200);
            expect(calls).toHaveLength(0);
        }]
    ]) {
        it(`leaves nothing behind when torn down ${label}`, () => {
            act();
            mode.cleanup(scene);
            const t = scene.time.now;
            scene.advance(20000);
            expect(scene.objectsCreatedAfter(t)).toEqual([]);
            expect(scene.liveObjects()).toEqual([]);
            expect(scene.clock.pendingTimers()).toEqual([]);
            expect(scene.clock.pendingTweens()).toEqual([]);
            expect(scene.playingSounds()).toEqual([]);
            expect(scene._useAfterDestroy).toEqual([]);
            expect(calls).toHaveLength(0);
            expect(scene.input._emitter.listenerCount('drag')).toBe(0);
            expect(scene.input._emitter.listenerCount('dragend')).toBe(0);
        });
    }

    it('only removes its own drag listeners', () => {
        let foreignCalls = 0;
        scene.input.on('drag', () => foreignCalls++);
        mode.cleanup(scene);
        scene.input._emitter.emit('drag', {}, {}, 0, 0);
        expect(foreignCalls).toBe(1);
    });
});
