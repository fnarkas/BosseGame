import { describe, it, expect, beforeEach } from 'vitest';
import { FakeScene, startMode } from '../helpers/fakeScene.js';
import { setTestConfig } from '../helpers/setup.js';
import { DayMatchMode } from '../../src/pokeballGameModes/DayMatchMode.js';
import { getStreak, incrementStreak } from '../../src/streak.js';

const DAY_AUDIO = {
    1: 'day_1_mandag', 2: 'day_2_tisdag', 3: 'day_3_onsdag', 4: 'day_4_torsdag',
    5: 'day_5_fredag', 6: 'day_6_lordag', 7: 'day_7_sondag'
};

function heartsText(scene) {
    return scene.findText(t => t.text.includes('❤️') || t.text.includes('🖤'));
}

describe('DayMatchMode', () => {
    let scene, mode, calls;
    const boxFor = (n) => mode.draggableBoxes.find(b => b.getData('dayNumber') === n);
    const zoneFor = (n) => mode.dropZones.find(z => z.getData('dayNumber') === n);
    const dropOn = (boxNumber, zoneNumber) => {
        const z = zoneFor(zoneNumber);
        return scene.drag(boxFor(boxNumber), z.x, z.y);
    };
    const matchAll = () => {
        for (let n = 1; n <= 7; n++) {
            dropOn(n, n);
            scene.advance(450);
        }
    };

    async function start(configSection) {
        setTestConfig({ dayMatch: configSection });
        scene = new FakeScene();
        mode = new DayMatchMode();
        calls = [];
        mode.setAnswerCallback((ok, answer, x, y) => calls.push({ ok, answer, x, y }));
        await startMode(mode, scene);
    }

    beforeEach(async () => {
        await start({ maxErrors: 3 });
    });

    describe('config', () => {
        it('reads maxErrors from the config', async () => {
            await start({ maxErrors: 5 });
            expect(mode.configLoaded).toBe(true);
            expect(mode.config.maxErrors).toBe(5);
            expect(mode.errorsRemaining).toBe(5);
            expect(heartsText(scene).text).toBe('❤️'.repeat(5));
        });

        it('falls back to defaults when the section is missing', async () => {
            await start(undefined);
            expect(mode.configLoaded).toBe(true);
            expect(mode.config.maxErrors).toBe(3);
            expect(mode.errorsRemaining).toBe(3);
        });
    });

    describe('challenge generation', () => {
        it('always uses all seven days with unique numbers 1-7', () => {
            for (let i = 0; i < 50; i++) {
                mode.generateChallenge();
                const numbers = mode.challengeData.days.map(d => d.number).sort();
                expect(numbers).toEqual([1, 2, 3, 4, 5, 6, 7]);
                expect(mode.challengeData.days.every(d => d.name && d.audio)).toBe(true);
            }
        });

        it('shuffles the draggable boxes over many rounds', () => {
            const orders = new Set();
            for (let i = 0; i < 40; i++) {
                mode.cleanup(scene);
                mode.generateChallenge();
                mode.createChallengeUI(scene);
                orders.add(mode.draggableBoxes.map(b => b.getData('dayNumber')).join(''));
            }
            expect(orders.size).toBeGreaterThan(1);
        });
    });

    describe('UI', () => {
        it('creates seven zones, seven draggable boxes and hearts', () => {
            expect(mode.dropZones).toHaveLength(7);
            expect(mode.draggableBoxes).toHaveLength(7);
            mode.draggableBoxes.forEach(b => expect(b.input.draggable).toBe(true));
            const zoneNumbers = mode.dropZones.map(z => z.getData('dayNumber'));
            expect(zoneNumbers).toEqual([1, 2, 3, 4, 5, 6, 7]);
            expect(heartsText(scene).text).toBe('❤️❤️❤️');
            // Zones do not overlap
            for (let i = 1; i < mode.dropZones.length; i++) {
                expect(mode.dropZones[i].getBounds().x).toBeGreaterThanOrEqual(mode.dropZones[i - 1].getBounds().right);
            }
        });

        it('shows learning text (day names, numbers) only', () => {
            const texts = scene.liveTexts().map(t => t.text);
            const allowed = new Set(['1', '2', '3', '4', '5', '6', '7', 'Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lördag', 'Söndag']);
            texts.forEach(t => {
                if (!t.includes('❤️') && !t.includes('🖤')) expect(allowed.has(t)).toBe(true);
            });
        });

        it('snaps a box back when dropped outside every zone', () => {
            const box = boxFor(4);
            scene.drag(box, 50, 850);
            scene.advance(400);
            expect(box.x).toBe(box.getData('startX'));
            expect(box.y).toBe(box.getData('startY'));
            expect(box.getData('dayText').x).toBe(box.getData('startX'));
            expect(mode.correctMatches).toBe(0);
            expect(mode.errorsRemaining).toBe(3);
        });
    });

    describe('correct matches', () => {
        it('plays the day audio and locks the box on a correct match', () => {
            dropOn(3, 3);
            expect(scene.lastAudio()).toBe(DAY_AUDIO[3]);
            expect(scene._missingAudio).toEqual([]);
            expect(mode.correctMatches).toBe(1);
            expect(zoneFor(3).getData('matched')).toBe(true);
            expect(boxFor(3).input.enabled).toBe(false);
            scene.advance(450);
            expect(boxFor(3).visible).toBe(false);
            expect(zoneFor(3).getData('numberText').text).toBe('Onsdag');
        });

        it('has a loaded audio key for every day', () => {
            for (let n = 1; n <= 7; n++) {
                dropOn(n, n);
                scene.advance(450);
            }
            expect(scene.playedAudio()).toEqual(Object.values(DAY_AUDIO));
            expect(scene._missingAudio).toEqual([]);
        });

        it('rewards exactly once after all seven are matched', () => {
            matchAll();
            expect(calls).toHaveLength(0);
            scene.advance(800);
            expect(calls).toEqual([{ ok: true, answer: 'all-matched', x: 640, y: 450 }]);
            scene.advance(10000);
            expect(calls).toHaveLength(1);
        });

        it('does nothing when a box is dropped on an already matched zone', () => {
            dropOn(2, 2);
            scene.advance(450);
            dropOn(5, 2);
            scene.advance(400);
            expect(mode.correctMatches).toBe(1);
            expect(mode.errorsRemaining).toBe(3);
            expect(boxFor(5).x).toBe(boxFor(5).getData('startX'));
        });
    });

    describe('wrong drops', () => {
        it('loses a heart, resets the streak and returns the box', () => {
            incrementStreak();
            incrementStreak();
            dropOn(1, 2);
            expect(mode.errorsRemaining).toBe(2);
            expect(heartsText(scene).text).toBe('❤️❤️🖤');
            expect(getStreak()).toBe(0);
            expect(mode.correctMatches).toBe(0);
            expect(zoneFor(2).getData('matched')).toBe(false);
            scene.advance(1000);
            expect(boxFor(1).x).toBe(boxFor(1).getData('startX'));
            expect(boxFor(1).isTinted).toBe(false);
            expect(boxFor(1).input.enabled).toBe(true);
            expect(calls).toHaveLength(0);
        });

        it('ignores drops while the wrong-drop feedback is animating', () => {
            dropOn(1, 2);
            // Same box again and another box, both during the shake
            dropOn(1, 3);
            dropOn(4, 4);
            expect(mode.errorsRemaining).toBe(2);
            expect(mode.correctMatches).toBe(0);
            expect(zoneFor(4).getData('matched')).toBe(false);
            expect(boxFor(4).x).toBe(boxFor(4).getData('startX'));
            scene.advance(1000);
            // Feedback over: play continues normally
            expect(mode.isRevealing).toBe(false);
            dropOn(4, 4);
            expect(mode.correctMatches).toBe(1);
        });

        it('can still finish the round after a wrong drop', () => {
            dropOn(6, 1);
            scene.advance(1000);
            matchAll();
            scene.advance(800);
            expect(calls).toHaveLength(1);
            expect(calls[0].ok).toBe(true);
        });
    });

    describe('game over', () => {
        function loseAllHearts() {
            dropOn(1, 3); scene.advance(1000);
            dropOn(1, 4); scene.advance(1000);
            dropOn(1, 5); // third error: hearts hit zero
        }

        it('rebuilds a fresh round with full hearts after the last heart is lost', () => {
            incrementStreak();
            dropOn(2, 2);
            scene.advance(450);
            const oldZones = mode.dropZones;
            loseAllHearts();
            expect(mode.errorsRemaining).toBe(0);
            expect(heartsText(scene).text).toBe('🖤🖤🖤');
            const t = scene.time.now;
            scene.advance(2500);
            expect(mode.errorsRemaining).toBe(3);
            expect(mode.correctMatches).toBe(0);
            expect(mode.isRevealing).toBe(false);
            expect(getStreak()).toBe(0);
            expect(heartsText(scene).text).toBe('❤️❤️❤️');
            expect(mode.dropZones).toHaveLength(7);
            expect(mode.dropZones).not.toBe(oldZones);
            oldZones.forEach(z => expect(z.destroyed).toBe(true));
            mode.dropZones.forEach(z => expect(z.getData('matched')).toBe(false));
            mode.draggableBoxes.forEach(b => expect(b.input.enabled).toBe(true));
            expect(scene.objectsCreatedAfter(t).length).toBeGreaterThan(0);
            expect(calls).toHaveLength(0);
            // The new round is playable
            dropOn(5, 5);
            expect(mode.correctMatches).toBe(1);
        });

        it('does not accept matches in the window between the last error and the restart', () => {
            for (let n = 1; n <= 5; n++) { dropOn(n, n); scene.advance(450); }
            dropOn(6, 7); scene.advance(1000);
            dropOn(6, 7); scene.advance(1000);
            dropOn(6, 7);
            expect(mode.errorsRemaining).toBe(0);
            scene.advance(750); // shake + return finished, restart pending
            dropOn(7, 7);
            dropOn(6, 6);
            expect(mode.correctMatches).toBe(5);
            scene.advance(5000);
            expect(calls).toHaveLength(0);
            expect(mode.correctMatches).toBe(0);
            expect(mode.errorsRemaining).toBe(3);
        });
    });

    describe('cleanup', () => {
        it('after a full match cancels the pending reward', () => {
            matchAll();
            mode.cleanup(scene);
            const t = scene.time.now;
            expect(() => scene.advance(10000)).not.toThrow();
            expect(scene.objectsCreatedAfter(t)).toEqual([]);
            expect(scene.liveObjects()).toEqual([]);
            expect(scene.clock.pendingTimers()).toEqual([]);
            expect(scene._useAfterDestroy).toEqual([]);
            expect(calls).toHaveLength(0);
        });

        it('after the last heart is lost does not rebuild the UI later', () => {
            dropOn(1, 2); scene.advance(1000);
            dropOn(1, 3); scene.advance(1000);
            dropOn(1, 4);
            mode.cleanup(scene);
            const t = scene.time.now;
            expect(() => scene.advance(10000)).not.toThrow();
            expect(scene.objectsCreatedAfter(t)).toEqual([]);
            expect(scene.liveObjects()).toEqual([]);
            expect(scene.clock.pendingTimers()).toEqual([]);
            expect(scene.clock.pendingTweens()).toEqual([]);
            expect(scene._useAfterDestroy).toEqual([]);
            expect(calls).toHaveLength(0);
        });

        it('mid-shake cleanup leaves nothing behind', () => {
            dropOn(3, 5);
            scene.advance(100);
            mode.cleanup(scene);
            const t = scene.time.now;
            expect(() => scene.advance(10000)).not.toThrow();
            expect(scene.objectsCreatedAfter(t)).toEqual([]);
            expect(scene.liveObjects()).toEqual([]);
            expect(scene._useAfterDestroy).toEqual([]);
        });
    });
});
