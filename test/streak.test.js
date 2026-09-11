import { describe, it, expect, beforeEach } from 'vitest';
import { resetStorage } from '../src/storage.js';
import { getStreak, incrementStreak, resetStreak, getMultiplier, milestoneBonus, MAX_STREAK, STREAK_EXPIRY_MS } from '../src/streak.js';
import { playChime } from '../src/sfx.js';
import { FakeScene } from './helpers/fakeScene.js';

describe('streak', () => {
    beforeEach(() => resetStorage());

    it('counts up to the cap and multiplies from 1', () => {
        expect(getStreak()).toBe(0);
        expect(getMultiplier()).toBe(1);
        for (let i = 0; i < 8; i++) incrementStreak();
        expect(getStreak()).toBe(MAX_STREAK);
        expect(getMultiplier()).toBe(MAX_STREAK);
        expect(resetStreak()).toBe(0);
        expect(getStreak()).toBe(0);
    });

    it('pays a milestone bonus only when a milestone is crossed', () => {
        expect(milestoneBonus(2, 3)).toBe(5);
        expect(milestoneBonus(4, 5)).toBe(15);
        expect(milestoneBonus(5, 5)).toBe(0);
        expect(milestoneBonus(0, 1)).toBe(0);
        expect(milestoneBonus(3, 4)).toBe(0);
    });

    it('expires a streak left for more than half a day', () => {
        const t0 = 1_700_000_000_000;
        incrementStreak(t0);
        incrementStreak(t0 + 1000);
        expect(getStreak(t0 + 60_000)).toBe(2);
        expect(getStreak(t0 + STREAK_EXPIRY_MS + 5000)).toBe(0);
        // and stays reset afterwards
        expect(getStreak(t0 + STREAK_EXPIRY_MS + 6000)).toBe(0);
        expect(incrementStreak(t0 + STREAK_EXPIRY_MS + 7000)).toBe(1);
    });
});

describe('sfx', () => {
    it('is a no-op without a Web Audio context and never throws', () => {
        const scene = new FakeScene();
        expect(playChime(scene, 'correct')).toBe(false);
        expect(playChime(null, 'wrong')).toBe(false);
        expect(playChime(scene, 'nope')).toBe(false);
    });

    it('schedules oscillators when a running context exists', () => {
        const scene = new FakeScene();
        const started = [];
        scene.sound.context = {
            state: 'running',
            currentTime: 0,
            destination: {},
            createOscillator: () => ({ type: '', frequency: { value: 0 }, connect() {}, start: (t) => started.push(t), stop() {} }),
            createGain: () => ({ gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} })
        };
        expect(playChime(scene, 'correct')).toBe(true);
        expect(started).toHaveLength(3);
        scene.sound.mute = true;
        expect(playChime(scene, 'correct')).toBe(false);
    });
});
