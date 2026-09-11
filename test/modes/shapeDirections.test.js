import { describe, it, expect, beforeEach } from 'vitest';
import { FakeScene, startMode } from '../helpers/fakeScene.js';
import { ShapeDirectionsMode } from '../../src/pokeballGameModes/ShapeDirectionsMode.js';
import { getStreak, incrementStreak } from '../../src/streak.js';

const VALID_COLORS = ['blue', 'red', 'yellow', 'green', 'orange', 'purple'];
const VALID_SHAPES = ['circle', 'square', 'triangle', 'star'];

function shapeContainers(scene) {
    return scene.liveObjectsOfType('Container')
        .filter(c => c.getData('index') !== undefined)
        .sort((a, b) => a.getData('index') - b.getData('index'));
}
function containerAt(scene, index) {
    return shapeContainers(scene).find(c => c.getData('index') === index);
}
function targetContainer(scene, mode) {
    return containerAt(scene, mode.challengeData.targetIndex);
}
function wrongContainer(scene, mode) {
    const { targetIndex } = mode.challengeData;
    return shapeContainers(scene).find(c => c.getData('index') !== targetIndex);
}
function bgOf(container) { return container.list[0]; }
function graphicOf(container) { return container.list[1]; }
function expectedKeys(mode) {
    const { direction, referenceShape } = mode.challengeData;
    return [`shapedir_prefix_${direction}`, `shapedir_${referenceShape.colorId}_${referenceShape.shapeType}`];
}

describe('ShapeDirectionsMode', () => {
    let scene, mode, calls;
    beforeEach(async () => {
        scene = new FakeScene();
        mode = new ShapeDirectionsMode();
        calls = [];
        mode.setAnswerCallback((ok, answer, x, y) => calls.push({ ok, answer, x, y }));
        await startMode(mode, scene);
    });

    describe('challenge generation', () => {
        it('always produces a valid, solvable challenge', () => {
            for (let i = 0; i < 500; i++) {
                mode.generateChallenge();
                const { shapes, direction, referenceIndex, targetIndex, referenceShape, targetShape } = mode.challengeData;
                expect(shapes.length).toBeGreaterThanOrEqual(6);
                expect(shapes.length).toBeLessThanOrEqual(8);
                // all shapes unique (colour+shape combination)
                const keys = shapes.map(s => `${s.colorId}_${s.shapeType}`);
                expect(new Set(keys).size).toBe(keys.length);
                for (const s of shapes) {
                    expect(VALID_COLORS).toContain(s.colorId);
                    expect(VALID_SHAPES).toContain(s.shapeType);
                }
                expect(['hoger', 'vanster']).toContain(direction);
                expect(referenceIndex).toBeGreaterThanOrEqual(0);
                expect(referenceIndex).toBeLessThan(shapes.length);
                // target is the neighbour in the spoken direction and exists
                expect(targetIndex).toBe(direction === 'hoger' ? referenceIndex + 1 : referenceIndex - 1);
                expect(targetIndex).toBeGreaterThanOrEqual(0);
                expect(targetIndex).toBeLessThan(shapes.length);
                expect(referenceShape).toBe(shapes[referenceIndex]);
                expect(targetShape).toBe(shapes[targetIndex]);
                expect(targetShape).not.toBe(referenceShape);
            }
        });

        it('uses both directions and both edges over many challenges', () => {
            const seen = new Set();
            for (let i = 0; i < 400; i++) {
                mode.generateChallenge();
                const { direction, referenceIndex, shapes } = mode.challengeData;
                seen.add(direction);
                if (direction === 'hoger' && referenceIndex === 0) seen.add('leftmost-ref');
                if (direction === 'vanster' && referenceIndex === shapes.length - 1) seen.add('rightmost-ref');
            }
            expect(seen.has('hoger')).toBe(true);
            expect(seen.has('vanster')).toBe(true);
            expect(seen.has('leftmost-ref')).toBe(true);
            expect(seen.has('rightmost-ref')).toBe(true);
        });
    });

    describe('UI', () => {
        it('draws one interactive container per shape, ordered left to right by index', () => {
            const containers = shapeContainers(scene);
            expect(containers).toHaveLength(mode.challengeData.shapes.length);
            for (let i = 1; i < containers.length; i++) {
                expect(containers[i].x).toBeGreaterThan(containers[i - 1].x);
            }
            containers.forEach(c => expect(c.input && c.input.enabled).toBe(true));
        });

        it('draws every shape with the colour and geometry matching its data', () => {
            const containers = shapeContainers(scene);
            containers.forEach((c, i) => {
                const data = mode.challengeData.shapes[i];
                const g = graphicOf(c);
                expect(g.type).toBe('Graphics');
                const fill = g.commands.find(cmd => cmd[0] === 'fillStyle');
                expect(fill[1]).toBe(data.colorHex);
                const names = g.commands.map(cmd => cmd[0]);
                if (data.shapeType === 'circle') expect(names).toContain('fillCircle');
                else if (data.shapeType === 'square') expect(names).toContain('fillRect');
                else expect(names).toContain('fillPath'); // triangle + star are paths
            });
        });

        it('the target shape is physically to the spoken side of the reference shape', () => {
            const { direction, referenceIndex, targetIndex } = mode.challengeData;
            const ref = containerAt(scene, referenceIndex);
            const target = containerAt(scene, targetIndex);
            if (direction === 'hoger') expect(target.x).toBeGreaterThan(ref.x);
            else expect(target.x).toBeLessThan(ref.x);
        });

        it('shows a progress indicator for each required answer plus a gift', () => {
            expect(scene.liveObjectsOfType('Arc')).toHaveLength(mode.requiredCorrect);
            expect(scene.findText('🎁')).not.toBeNull();
        });
    });

    describe('audio', () => {
        it('plays the direction prefix and then the reference colour+shape of the challenge', () => {
            const [prefixKey, comboKey] = expectedKeys(mode);
            expect(scene.playedAudio()).toEqual([prefixKey]);
            scene.advance(600); // prefix duration (0.5s) elapses
            expect(scene.playedAudio()).toEqual([prefixKey, comboKey]);
            expect(scene._missingAudio).toEqual([]);
        });

        it('replays without queueing duplicate combo playback when the speaker is tapped repeatedly', () => {
            const [prefixKey, comboKey] = expectedKeys(mode);
            const speaker = scene.findText('🔊');
            scene.click(speaker);
            scene.click(speaker);
            scene.click(speaker);
            scene.advance(2000);
            const plays = scene.playedAudio();
            expect(plays.filter(k => k === comboKey)).toHaveLength(1);
            expect(plays.filter(k => k === prefixKey)).toHaveLength(4);
        });

        it('every colour/shape/direction combination maps to a loaded audio key', () => {
            for (let i = 0; i < 200; i++) {
                mode.cleanup(scene);
                mode.generateChallenge();
                mode.createChallengeUI(scene);
                scene.advance(600);
            }
            expect(scene._missingAudio).toEqual([]);
        });

        it('stops both audio parts on cleanup and does not leak sound objects', () => {
            mode.cleanup(scene);
            expect(scene.playingSounds()).toEqual([]);
            expect(scene.sound.sounds).toEqual([]);
        });
    });

    describe('happy path', () => {
        it('gives the reward after three correct answers in a row (exactly one callback)', () => {
            for (let i = 0; i < 3; i++) {
                expect(scene.click(targetContainer(scene, mode))).toBe(true);
                scene.advance(1000);
            }
            expect(calls).toHaveLength(1);
            expect(calls[0].ok).toBe(true);
            scene.advance(10000);
            expect(calls).toHaveLength(1);
        });

        it('marks progress indicators green as answers accumulate', () => {
            scene.click(targetContainer(scene, mode));
            scene.advance(1000);
            const balls = scene.liveObjectsOfType('Arc');
            expect(balls[0].fillColor).toBe(0x27AE60);
            expect(balls[1].fillColor).toBe(0xffffff);
        });

        it('keeps the correct shape green during feedback (pointerout must not reset it)', () => {
            const target = targetContainer(scene, mode);
            scene.click(target);
            expect(bgOf(target).fillColor).toBe(0x27AE60);
        });

        it('ignores extra taps while the next challenge is loading', () => {
            const target = targetContainer(scene, mode);
            scene.click(target);
            scene.click(target);
            scene.click(wrongContainer(scene, mode));
            scene.advance(1000);
            expect(mode.correctInRow).toBe(1);
            expect(calls).toHaveLength(0);
            // exactly one fresh challenge was built
            expect(shapeContainers(scene)).toHaveLength(mode.challengeData.shapes.length);
        });
    });

    describe('wrong answer', () => {
        it('resets progress and the streak, reveals the answer and then moves on', () => {
            incrementStreak();
            scene.click(targetContainer(scene, mode));
            scene.advance(1000);
            expect(mode.correctInRow).toBe(1);

            const wrong = wrongContainer(scene, mode);
            const target = targetContainer(scene, mode);
            scene.click(wrong);
            expect(bgOf(wrong).fillColor).toBe(0xFF0000);
            expect(mode.correctInRow).toBe(0);
            expect(getStreak()).toBe(0);
            scene.advance(500);
            expect(bgOf(target).fillColor).toBe(0xFFD700);
            scene.advance(2500);
            expect(calls).toHaveLength(0);
            expect(wrong.destroyed).toBe(true);
            expect(shapeContainers(scene)).toHaveLength(mode.challengeData.shapes.length);
            expect(mode.inputLocked).toBe(false);
        });

        it('does not accept a correct tap while the answer is being revealed', () => {
            scene.click(wrongContainer(scene, mode));
            scene.advance(100);
            scene.click(targetContainer(scene, mode));
            scene.advance(5000);
            expect(mode.correctInRow).toBe(0);
            expect(calls).toHaveLength(0);
        });

        it('does not double count a second wrong tap', () => {
            scene.click(wrongContainer(scene, mode));
            scene.click(wrongContainer(scene, mode));
            const t = scene.time.now;
            scene.advance(2600);
            // only one rebuild happened: one set of containers alive
            expect(shapeContainers(scene)).toHaveLength(mode.challengeData.shapes.length);
            expect(scene.liveObjectsOfType('Text').filter(t => t.text === '🔊')).toHaveLength(1);
            expect(scene.objectsCreatedAfter(t).length).toBeGreaterThan(0);
        });
    });

    describe('cleanup', () => {
        it('cancels pending feedback and leaves nothing behind after a wrong answer', () => {
            scene.click(wrongContainer(scene, mode));
            scene.advance(100);
            mode.cleanup(scene);
            const t = scene.time.now;
            scene.advance(10000);
            expect(scene.objectsCreatedAfter(t)).toEqual([]);
            expect(scene.liveObjects()).toEqual([]);
            expect(scene.clock.pendingTimers()).toEqual([]);
            expect(scene.clock.pendingTweens()).toEqual([]);
            expect(calls).toHaveLength(0);
            expect(scene._useAfterDestroy).toEqual([]);
        });

        it('cancels a pending next-challenge timer after a correct answer', () => {
            scene.click(targetContainer(scene, mode));
            mode.cleanup(scene);
            const t = scene.time.now;
            scene.advance(10000);
            expect(scene.objectsCreatedAfter(t)).toEqual([]);
            expect(scene.liveObjects()).toEqual([]);
            expect(calls).toHaveLength(0);
        });

        it('never fires the reward callback if cleaned up before the final timer', () => {
            for (let i = 0; i < 2; i++) {
                scene.click(targetContainer(scene, mode));
                scene.advance(1000);
            }
            scene.click(targetContainer(scene, mode));
            mode.cleanup(scene);
            scene.advance(10000);
            expect(calls).toHaveLength(0);
        });
    });

    it('never plays an audio key that BootScene did not load', () => {
        expect(scene._missingAudio).toEqual([]);
    });
});
