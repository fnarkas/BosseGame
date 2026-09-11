import { describe, it, expect } from 'vitest';
import { PIANO_SONGS, PIANO_KEYS, getRandomSong, getPianoKey } from '../src/pianoSongs.js';
import { getAssetRegistry } from './helpers/assets.js';

// Data invariants for the piano learning game: every song must be playable on
// the two-octave keyboard (C3..C5), every measure must be a full 4/4 bar, and
// every note must have a BootScene-loaded sample.
describe('pianoSongs data', () => {
    const registry = getAssetRegistry();
    const keyNotes = new Set(PIANO_KEYS.map(k => k.note));

    it('has at least one song, each with a unique id and a name', () => {
        expect(PIANO_SONGS.length).toBeGreaterThan(0);
        const ids = PIANO_SONGS.map(s => s.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const song of PIANO_SONGS) {
            expect(typeof song.name).toBe('string');
            expect(song.name.length).toBeGreaterThan(0);
            expect(song.timeSignature).toBe('4/4');
            expect(song.measures.length).toBeGreaterThan(0);
        }
    });

    it('every measure sums to exactly 4 beats', () => {
        const bad = [];
        for (const song of PIANO_SONGS) {
            song.measures.forEach((measure, i) => {
                expect(measure.length).toBeGreaterThan(0);
                const beats = measure.reduce((sum, n) => sum + n.duration, 0);
                if (Math.abs(beats - 4) > 1e-9) bad.push(`${song.id} measure ${i + 1}: ${beats} beats`);
            });
        }
        expect(bad).toEqual([]);
    });

    it('every note has a positive duration and lies on the keyboard (C3..C5)', () => {
        const bad = [];
        for (const song of PIANO_SONGS) {
            song.measures.forEach((measure, i) => {
                for (const n of measure) {
                    if (!(n.duration > 0)) bad.push(`${song.id} measure ${i + 1}: duration ${n.duration}`);
                    if (!keyNotes.has(n.note)) bad.push(`${song.id} measure ${i + 1}: note ${n.note} has no key`);
                }
            });
        }
        expect(bad).toEqual([]);
    });

    it('every keyboard note has a BootScene audio sample piano-<note>', () => {
        const missing = PIANO_KEYS.map(k => `piano-${k.note}`).filter(key => !registry.audio.has(key));
        expect(missing).toEqual([]);
    });

    it('every song note has a BootScene audio sample', () => {
        const missing = new Set();
        for (const song of PIANO_SONGS) {
            for (const measure of song.measures) {
                for (const n of measure) {
                    if (!registry.audio.has(`piano-${n.note}`)) missing.add(n.note);
                }
            }
        }
        expect([...missing]).toEqual([]);
    });

    it('keyboard layout is consistent: unique notes, consecutive white indices, black keys between white keys', () => {
        expect(keyNotes.size).toBe(PIANO_KEYS.length);
        const whites = PIANO_KEYS.filter(k => k.type === 'white');
        expect(whites.map(k => k.whiteIndex)).toEqual(whites.map((_, i) => i));
        for (const k of PIANO_KEYS) {
            expect(['white', 'black']).toContain(k.type);
            expect(k.type === 'black').toBe(k.note.includes('#'));
            if (k.type === 'black') {
                // A black key sits to the right of its white key, which must exist and not be the last one
                expect(k.whiteIndex).toBeLessThan(whites.length - 1);
                expect(whites[k.whiteIndex].note[0]).toBe(k.note[0]);
            }
        }
        expect(whites[0].note).toBe('C3');
        expect(whites[whites.length - 1].note).toBe('C5');
    });

    it('getRandomSong returns a song from the list and getPianoKey resolves notes', () => {
        for (let i = 0; i < 100; i++) {
            expect(PIANO_SONGS).toContain(getRandomSong());
        }
        expect(getPianoKey('C4')).toEqual({ note: 'C4', type: 'white', whiteIndex: 7 });
        expect(getPianoKey('H9')).toBeUndefined();
    });
});
