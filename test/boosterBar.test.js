import { describe, it, expect } from 'vitest';
import { FakeScene } from './helpers/fakeScene.js';
import { createBoosterBar, updateBoosterBar, destroyBoosterBar } from '../src/boosterBar.js';

const LEVEL = { 1: 0x3498DB, 2: 0x2ECC71, 3: 0xF39C12, 4: 0xE74C3C, 5: 0x9B59B6 };

describe('boosterBar', () => {
    it('lights one segment per streak step, recolouring the already lit ones (regression: froze the reward)', () => {
        const scene = new FakeScene();
        const bar = createBoosterBar(scene, 640, 60);
        for (let streak = 1; streak <= 5; streak++) {
            // Real time passes between answers, so earlier segments are fully lit
            expect(() => updateBoosterBar(bar, streak, scene)).not.toThrow();
            scene.advance(1000);
            for (let i = 0; i < 5; i++) {
                expect(bar.fills[i].alpha).toBe(i < streak ? 1 : 0);
                if (i < streak) expect(bar.fills[i].fillColor).toBe(LEVEL[streak]);
            }
            expect(bar.multiplierText.text).toBe(`x${streak}`);
        }
        // Reset after a miss, then a streak beyond the bar's five levels
        expect(() => updateBoosterBar(bar, 0, scene)).not.toThrow();
        scene.advance(1000);
        expect(bar.fills.every(f => f.alpha === 0)).toBe(true);
        expect(bar.multiplierText.text).toBe('x1');
        expect(() => updateBoosterBar(bar, 9, scene)).not.toThrow();
        destroyBoosterBar(bar);
        expect(scene.liveObjects()).toEqual([]);
    });
});
