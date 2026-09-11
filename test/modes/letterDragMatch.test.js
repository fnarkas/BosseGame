import { describe, it, expect, beforeEach } from 'vitest';
import { FakeScene, startMode } from '../helpers/fakeScene.js';
import { setTestConfig } from '../helpers/setup.js';
import { LetterDragMatchMode } from '../../src/pokeballGameModes/LetterDragMatchMode.js';
import { CONFUSABLE_LETTERS } from '../../src/adaptive.js';
import { getStreak, incrementStreak } from '../../src/streak.js';

const SHAKE = 400;
const SNAP_BACK = 300;
const REVEAL = 2000;

function hasConfusablePair(letters) {
    const up = letters.map(l => l.toUpperCase());
    return CONFUSABLE_LETTERS.some(([a, b]) => up.includes(a) && up.includes(b));
}

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
        expect(mode.currentLetters).not.toContain(undefined);
    });

    it('uses the configured letters, falling back to the whole alphabet below four', async () => {
        setTestConfig({ letters: { letters: 'a-d' } });
        const m = new LetterDragMatchMode();
        await startMode(m, new FakeScene());
        expect([...m.currentLetters].sort()).toEqual(['a', 'b', 'c', 'd']);

        setTestConfig({ letters: { letters: 'a,b' } });
        const m2 = new LetterDragMatchMode();
        await startMode(m2, new FakeScene());
        expect(m2.availableLetters).toHaveLength(29);
        expect(m2.currentLetters).toHaveLength(4);
    });

    it('puts a confusable partner next to the target letter', () => {
        mode.queueRetry('b');
        mode.generateChallenge();
        expect(mode.currentLetters).toContain('b');
        expect(mode.currentLetters.some(l => ['d', 'p'].includes(l))).toBe(true);

        let withPair = 0;
        for (let i = 0; i < 200; i++) {
            mode.generateChallenge();
            expect(new Set(mode.currentLetters).size).toBe(4);
            if (hasConfusablePair(mode.currentLetters)) withPair++;
        }
        expect(withPair).toBeGreaterThan(100);
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
        scene.drag(boxFor(mode.currentLetters[2]), zc.x, zc.y);
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

    it('speaks the missed letter over its gold zone and re-asks it in the next round', () => {
        const [a, b] = mode.currentLetters;
        const box = boxFor(a);
        const startX = box.getData('startX');
        const zb = zoneFor(b);
        scene.drag(box, zb.x, zb.y);
        scene.advance(SHAKE + SNAP_BACK + 10);
        expect(box.x).toBe(startX);
        expect(scene.lastAudio()).toBe(`letter_audio_${a.toLowerCase()}`);
        expect(zoneFor(a).fillColor).toBe(0xFFD700);
        mode.draggableBoxes.forEach(bx => expect(bx.input.enabled).toBe(false));
        scene.advance(REVEAL);
        expect(mode.currentLetters).toContain(a);
        expect(mode.draggableBoxes).toHaveLength(4);
        // ...and once more after one further round
        mode.generateChallenge();
        mode.generateChallenge();
        expect(mode.currentLetters).toContain(a);
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

    it('never plays an audio key that BootScene did not load', () => {
        const [a, b] = mode.currentLetters;
        scene.drag(boxFor(a), zoneFor(b).x, zoneFor(b).y);
        scene.advance(5000);
        expect(scene._missingAudio).toEqual([]);
    });
});
