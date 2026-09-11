import { describe, it, expect, beforeEach } from 'vitest';
import { FakeScene, startMode } from '../helpers/fakeScene.js';
import { LetterDragMatchMode } from '../../src/pokeballGameModes/LetterDragMatchMode.js';
import { getStreak, incrementStreak } from '../../src/streak.js';

describe('LetterDragMatchMode', () => {
    let scene, mode, calls;
    const boxFor = (letter) => mode.draggableBoxes.find(b => b.getData('letter') === letter);
    const zoneFor = (letter) => mode.dropZones.find(z => z.getData('letter') === letter);

    beforeEach(async () => {
        scene = new FakeScene();
        mode = new LetterDragMatchMode();
        calls = [];
        mode.setAnswerCallback((ok, answer) => calls.push({ ok, answer }));
        await startMode(mode, scene);
    });

    it('creates four distinct letters with a zone and a draggable box each', () => {
        expect(mode.currentLetters).toHaveLength(4);
        expect(new Set(mode.currentLetters).size).toBe(4);
        expect(mode.dropZones).toHaveLength(4);
        expect(mode.draggableBoxes).toHaveLength(4);
        mode.draggableBoxes.forEach(b => expect(b.input.draggable).toBe(true));
    });

    it('rewards after all four letters are matched', () => {
        for (const letter of mode.currentLetters) {
            const z = zoneFor(letter);
            scene.drag(boxFor(letter), z.x, z.y);
            scene.advance(300);
            expect(scene.lastAudio()).toBe(`letter_audio_${letter.toLowerCase()}`);
        }
        scene.advance(1000);
        expect(calls).toEqual([{ ok: true, answer: 'all-matched' }]);
    });

    it('snaps a box back when dropped outside every zone', () => {
        const letter = mode.currentLetters[0];
        const box = boxFor(letter);
        const startX = box.getData('startX');
        scene.drag(box, 50, 850);
        scene.advance(500);
        expect(box.x).toBe(startX);
        expect(mode.correctMatches).toBe(0);
    });

    it('reveals the correct zone after a wrong drop, then restarts with new letters', () => {
        incrementStreak();
        const [a, b] = mode.currentLetters;
        const zb = zoneFor(b);
        scene.drag(boxFor(a), zb.x, zb.y);
        scene.advance(100);
        // Other letters are frozen while the answer is being revealed
        const zc = zoneFor(mode.currentLetters[2]);
        const dragged = scene.drag(boxFor(mode.currentLetters[2]), zc.x, zc.y);
        scene.advance(100);
        expect(mode.correctMatches).toBe(0);
        scene.advance(6000);
        expect(getStreak()).toBe(0);
        expect(calls).toHaveLength(0);
        expect(mode.correctMatches).toBe(0);
        expect(mode.isRevealing).toBe(false);
        expect(mode.dropZones).toHaveLength(4);
        expect(scene.liveObjectsOfType('Rectangle').length).toBeGreaterThan(0);
    });

    it('cleans up without leaving orphaned UI', () => {
        const [a, b] = mode.currentLetters;
        const zb = zoneFor(b);
        scene.drag(boxFor(a), zb.x, zb.y);
        scene.advance(100);
        mode.cleanup(scene);
        const t = scene.time.now;
        scene.advance(10000);
        expect(scene.objectsCreatedAfter(t)).toEqual([]);
        expect(scene.liveObjects()).toEqual([]);
        expect(calls).toHaveLength(0);
    });
});
