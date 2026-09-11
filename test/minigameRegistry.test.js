import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
    MINIGAMES, getMinigameByForced, getMinigameByPath, getMinigameForMode,
    isLegendaryMode, pickWeightedMinigame
} from '../src/minigameRegistry.js';
import { WHEEL_SLICES, DEFAULT_MODE_WEIGHTS } from '../src/minigameWheel.js';
import { BasePokeballGameMode } from '../src/pokeballGameModes/BasePokeballGameMode.js';

const unique = (arr) => new Set(arr).size === arr.length;

describe('minigame registry', () => {
    it('has unique keys, paths, forced values and mode classes', () => {
        expect(unique(MINIGAMES.map(g => g.key))).toBe(true);
        expect(unique(MINIGAMES.map(g => g.path))).toBe(true);
        expect(unique(MINIGAMES.map(g => g.forced))).toBe(true);
        expect(unique(MINIGAMES.map(g => g.Mode))).toBe(true);
        expect(unique(MINIGAMES.map(g => g.Mode.name))).toBe(true);
    });

    it('every entry is complete and its class is a pokeball game mode', () => {
        for (const g of MINIGAMES) {
            expect(g.key, g.key).toMatch(/^[a-z][A-Za-z]+$/);
            expect(g.path, g.key).toMatch(/^\/[a-z]+$/);
            expect(g.forced, g.key).toMatch(/-only$/);
            expect(g.name, g.key).toBeTruthy();
            expect(g.icon, g.key).toMatch(/^game-mode-/);
            expect(typeof g.color, g.key).toBe('number');
            expect(g.defaultWeight, g.key).toBeGreaterThanOrEqual(0);
            expect(Object.getPrototypeOf(g.Mode.prototype), g.key).toBeInstanceOf(Object);
            expect(new g.Mode()).toBeInstanceOf(BasePokeballGameMode);
        }
    });

    it('every icon file exists on disk', () => {
        const missing = MINIGAMES
            .map(g => g.iconFile)
            .filter(file => !fs.existsSync(path.resolve(__dirname, '../public', file)));
        expect(missing).toEqual([]);
    });

    it('every mode class in src/pokeballGameModes is registered', () => {
        const dir = path.resolve(__dirname, '../src/pokeballGameModes');
        const classes = fs.readdirSync(dir)
            .filter(f => f.endsWith('Mode.js') && f !== 'BasePokeballGameMode.js')
            .map(f => f.replace('.js', ''));
        const registered = new Set(MINIGAMES.map(g => g.Mode.name));
        expect(classes.filter(c => !registered.has(c))).toEqual([]);
    });

    it('every weight key in the shipped config is a registered mode', () => {
        const config = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../public/config/minigames.json'), 'utf8'));
        const keys = new Set(MINIGAMES.map(g => g.key));
        expect(Object.keys(config.weights).filter(k => !keys.has(k))).toEqual([]);
        expect(Object.keys(DEFAULT_MODE_WEIGHTS).sort()).toEqual([...keys].sort());
    });

    it('derives the wheel: shared slices group their modes, every mode is on exactly one slice', () => {
        const all = WHEEL_SLICES.flatMap(s => s.classNames);
        expect(unique(all)).toBe(true);
        expect(all.sort()).toEqual(MINIGAMES.map(g => g.Mode.name).sort());
        const numbers = WHEEL_SLICES.find(s => s.name === 'numbers');
        expect(numbers.classNames).toEqual(['NumberListeningMode', 'NumberReadingMode']);
        expect(numbers.weightKeys).toEqual(['numberListening', 'numberReading']);
        const clock = WHEEL_SLICES.find(s => s.name === 'clock');
        expect(clock.classNames).toEqual(['ClockListeningMode', 'ClockReadingMode']);
    });

    it('looks up entries by forced value, path and mode instance', () => {
        const letters = getMinigameByForced('letter-only');
        expect(letters.key).toBe('letterListening');
        expect(getMinigameByPath('/letters')).toBe(letters);
        expect(getMinigameByPath('/letters/')).toBe(letters);
        expect(getMinigameForMode(new letters.Mode())).toBe(letters);
        expect(getMinigameForMode('LetterListeningMode')).toBe(letters);
        expect(getMinigameByForced('nope-only')).toBeNull();
        expect(getMinigameForMode('NoSuchMode')).toBeNull();
    });

    it('flags exactly the two legendary modes', () => {
        const legendary = MINIGAMES.filter(g => g.legendary).map(g => g.key).sort();
        expect(legendary).toEqual(['legendary', 'legendaryNumbers']);
        expect(isLegendaryMode(new (getMinigameByForced('legendary-only').Mode)())).toBe(true);
        expect(isLegendaryMode(new (getMinigameByForced('addition-only').Mode)())).toBe(false);
    });

    it('weighted pick respects weights and never returns a zero-weight mode', () => {
        const weights = Object.fromEntries(MINIGAMES.map(g => [g.key, 0]));
        weights.addition = 1;
        weights.multiplication = 3;
        const counts = { addition: 0, multiplication: 0 };
        for (let i = 0; i < 400; i++) {
            counts[pickWeightedMinigame(weights, () => i / 400).key]++;
        }
        expect(counts.addition).toBe(100);
        expect(counts.multiplication).toBe(300);
    });

    it('weighted pick falls back to word spelling when everything is disabled', () => {
        const weights = Object.fromEntries(MINIGAMES.map(g => [g.key, 0]));
        expect(pickWeightedMinigame(weights).key).toBe('wordSpelling');
        expect(pickWeightedMinigame({}).key).toBe('wordSpelling');
    });
});
