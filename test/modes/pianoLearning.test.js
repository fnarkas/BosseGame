import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FakeScene, startMode, flush } from '../helpers/fakeScene.js';
import { setTestConfig } from '../helpers/setup.js';
import { PianoLearningMode } from '../../src/pokeballGameModes/PianoLearningMode.js';
import { PIANO_SONGS, PIANO_KEYS } from '../../src/pianoSongs.js';

const TWINKLE = PIANO_SONGS.findIndex(s => s.id === 'twinkle');
const HAPPY_BIRTHDAY = PIANO_SONGS.findIndex(s => s.id === 'happybirthday');

// The demo playback is an async loop awaiting mode-owned timers, so the
// virtual clock has to be advanced in small steps with promise flushes in
// between for the continuation of each note to run.
async function run(scene, ms, step = 50) {
    for (let t = 0; t < ms; t += step) {
        scene.advance(Math.min(step, ms - t));
        await flush();
    }
}

function flatNotes(song) {
    return song.measures.flatMap(m => m.map(n => n.note));
}

function errorFlashes(scene) {
    return scene.liveObjectsOfType('Rectangle').filter(r => r.depth === 1000);
}

describe('PianoLearningMode', () => {
    let scene, mode, calls;

    // Start the mode on a specific song (getRandomSong uses Math.random once).
    async function start(songIndex = TWINKLE, config) {
        if (config) setTestConfig({ pianoLearning: config });
        scene = new FakeScene();
        mode = new PianoLearningMode();
        calls = [];
        mode.setAnswerCallback((ok, answer, x, y) => calls.push({ ok, answer, x, y }));
        const spy = vi.spyOn(Math, 'random').mockReturnValue(songIndex / PIANO_SONGS.length);
        try {
            await startMode(mode, scene);
        } finally {
            spy.mockRestore();
        }
    }

    const keyFor = (note) => mode.pianoKeys[note].graphic;
    const patternNotes = () => mode.getCurrentPatternNotes().map(n => n.note);

    // Press every key of the current pattern in order.
    function playPattern() {
        for (const note of patternNotes()) scene.click(keyFor(note));
    }

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('config', () => {
        it('loads the checked-in defaults', async () => {
            await start();
            expect(mode.configLoaded).toBe(true);
            expect(mode.measuresPerPattern).toBe(1);
            expect(mode.showNotes).toBe(true);
        });

        it('respects measuresPerPattern and showNotes', async () => {
            await start(TWINKLE, { measuresPerPattern: 2, showNotes: false });
            expect(mode.measuresPerPattern).toBe(2);
            expect(mode.showNotes).toBe(false);
            expect(mode.challengeData.totalPatterns).toBe(6);
            expect(mode.getCurrentPatternNotes()).toHaveLength(7);
            // No note markers when showNotes is off (only the 12 progress balls)
            expect(scene.liveObjectsOfType('Arc')).toHaveLength(6);
        });

        it('falls back to 1 measure per pattern on invalid values', async () => {
            for (const bad of [0, -1, 1.5, 'abc', null]) {
                await start(TWINKLE, { measuresPerPattern: bad });
                expect(mode.measuresPerPattern).toBe(1);
                expect(mode.challengeData.totalPatterns).toBe(12);
            }
        });

        it('uses defaults and still marks the config loaded when the section is missing', async () => {
            setTestConfig({ pianoLearning: undefined });
            scene = new FakeScene();
            mode = new PianoLearningMode();
            await mode.loadConfig();
            expect(mode.configLoaded).toBe(true);
            expect(mode.measuresPerPattern).toBe(1);
            expect(mode.showNotes).toBe(true);
        });

        it('uses defaults when the config fetch fails', async () => {
            fetch.mockImplementationOnce(async () => { throw new Error('offline'); });
            mode = new PianoLearningMode();
            await mode.loadConfig();
            expect(mode.configLoaded).toBe(true);
            expect(mode.measuresPerPattern).toBe(1);
            expect(mode.showNotes).toBe(true);
        });
    });

    describe('challenge generation', () => {
        it('picks a song, splits it into patterns covering every measure exactly once', async () => {
            await start();
            for (const measures of [1, 2, 3, 5]) {
                mode.measuresPerPattern = measures;
                for (let i = 0; i < 100; i++) {
                    const data = mode.generateChallenge();
                    expect(PIANO_SONGS).toContain(data.song);
                    expect(data.totalPatterns).toBe(Math.ceil(data.song.measures.length / measures));
                    expect(mode.currentPatternIndex).toBe(0);
                    expect(mode.playerNotes).toEqual([]);
                    const covered = [];
                    for (let p = 0; p < data.totalPatterns; p++) {
                        mode.currentPatternIndex = p;
                        const notes = mode.getCurrentPatternNotes();
                        expect(notes.length).toBeGreaterThan(0);
                        covered.push(...notes.map(n => n.note));
                    }
                    expect(covered).toEqual(flatNotes(data.song));
                }
            }
        });

        it('reaches every song over many draws', async () => {
            await start();
            const seen = new Set();
            for (let i = 0; i < 500; i++) seen.add(mode.generateChallenge().song.id);
            expect(seen.size).toBe(PIANO_SONGS.length);
        });
    });

    describe('keyboard layout', () => {
        beforeEach(async () => { await start(); });

        it('creates one interactive key per keyboard note, tagged with its note', () => {
            const keys = scene.interactives().filter(o => o.type === 'Rectangle' && o.getData('note'));
            expect(keys).toHaveLength(PIANO_KEYS.length);
            expect(new Set(keys.map(k => k.getData('note')))).toEqual(new Set(PIANO_KEYS.map(k => k.note)));
            expect(scene.findText('🔊')).not.toBeNull();
        });

        it('keys of the same colour never overlap and all keys fit on screen', () => {
            const overlaps = (a, b) => a.x < b.right && b.x < a.right && a.y < b.bottom && b.y < a.bottom;
            for (const type of ['white', 'black']) {
                const rects = PIANO_KEYS.filter(k => k.type === type).map(k => keyFor(k.note).getBounds());
                for (let i = 0; i < rects.length; i++) {
                    for (let j = i + 1; j < rects.length; j++) {
                        expect(overlaps(rects[i], rects[j])).toBe(false);
                    }
                }
            }
            for (const k of PIANO_KEYS) {
                const b = keyFor(k.note).getBounds();
                expect(b.x).toBeGreaterThanOrEqual(0);
                expect(b.right).toBeLessThanOrEqual(scene.width);
                expect(b.y).toBeGreaterThanOrEqual(0);
                expect(b.bottom).toBeLessThanOrEqual(scene.height);
            }
        });

        it('draws black keys above white keys, straddling the boundary between two white keys', () => {
            for (const k of PIANO_KEYS.filter(k => k.type === 'black')) {
                const black = keyFor(k.note);
                const left = keyFor(PIANO_KEYS.filter(w => w.type === 'white')[k.whiteIndex].note).getBounds();
                const right = keyFor(PIANO_KEYS.filter(w => w.type === 'white')[k.whiteIndex + 1].note).getBounds();
                const b = black.getBounds();
                expect(black.depth).toBeGreaterThan(0);
                expect(b.x).toBeGreaterThan(left.x);
                expect(b.right).toBeLessThan(right.right);
                expect(b.height).toBeLessThan(left.height);
            }
        });

        it('has a loaded sound for every keyboard note and never asks for an unknown key', () => {
            for (const k of PIANO_KEYS) expect(mode.audioCache[k.note]).toBeDefined();
            expect(scene._missingAudio).toEqual([]);
        });

        it('every note of every song has a key and a sound', () => {
            for (const song of PIANO_SONGS) {
                for (const note of flatNotes(song)) {
                    expect(mode.pianoKeys[note]).toBeDefined();
                    expect(mode.audioCache[note]).toBeDefined();
                }
            }
        });

        it('shows one progress ball per pattern with the first one marked current', () => {
            const balls = mode.ballIndicators;
            expect(balls).toHaveLength(mode.challengeData.totalPatterns);
            expect(balls[0].fillColor).toBe(0xFFEB3B);
            balls.slice(1).forEach(b => expect(b.fillColor).toBe(0xCCCCCC));
            // Balls sit above the keyboard, not on it
            const pianoTop = Math.min(...PIANO_KEYS.map(k => keyFor(k.note).getBounds().y));
            balls.forEach(b => expect(b.getBounds().bottom).toBeLessThan(pianoTop));
        });

        it('creates hidden note markers inside the keys of the current pattern', () => {
            const notes = patternNotes();
            expect(mode.noteMarkers).toHaveLength(notes.length);
            mode.noteMarkers.forEach((m, i) => {
                expect(m.alpha).toBe(0);
                expect(m.getData('index')).toBe(i);
                expect(m.getData('note')).toBe(notes[i]);
                const key = keyFor(notes[i]).getBounds();
                expect(m.x).toBeGreaterThan(key.x);
                expect(m.x).toBeLessThan(key.right);
                expect(m.y).toBeGreaterThan(key.y);
                expect(m.y).toBeLessThan(key.bottom);
            });
        });
    });

    describe('demo playback', () => {
        beforeEach(async () => { await start(); });

        it('does not play anything until the speaker is pressed', () => {
            expect(scene.playedAudio()).toEqual([]);
        });

        it('plays the current pattern from the speaker and reveals its markers', async () => {
            scene.click(scene.findText('🔊'));
            await run(scene, 3000);
            expect(scene.playedAudio()).toEqual(patternNotes().map(n => `piano-${n}`));
            expect(mode.isPlayingDemo).toBe(false);
            mode.noteMarkers.forEach(m => expect(m.alpha).toBe(1));
            // Keys return to their original colour
            for (const k of PIANO_KEYS) {
                expect(keyFor(k.note).fillColor).toBe(k.type === 'white' ? 0xFFFFFF : 0x000000);
            }
        });

        it('ignores key presses and repeated speaker taps while the demo is playing', async () => {
            scene.click(scene.findText('🔊'));
            await run(scene, 200);
            scene.click(scene.findText('🔊'));
            scene.click(keyFor(patternNotes()[0]));
            await run(scene, 3000);
            expect(mode.playerNotes).toEqual([]);
            expect(scene.playedAudio()).toEqual(patternNotes().map(n => `piano-${n}`));
        });
    });

    describe('answering', () => {
        beforeEach(async () => { await start(); });

        it('plays the pressed key and consumes its marker on a correct press', () => {
            const notes = patternNotes();
            scene.click(keyFor(notes[0]));
            expect(scene.playedAudio()).toEqual([`piano-${notes[0]}`]);
            expect(mode.playerNotes).toEqual([notes[0]]);
            expect(mode.noteMarkers.map(m => m.getData('index'))).toEqual(notes.map((_, i) => i).slice(1));
            expect(keyFor(notes[0]).fillColor).toBe(0xFFFF00);
            scene.advance(300);
            expect(keyFor(notes[0]).fillColor).toBe(0xFFFFFF);
        });

        it('completes a pattern, advances the progress balls and auto-plays the next pattern', async () => {
            playPattern();
            expect(mode.currentPatternIndex).toBe(1);
            expect(mode.ballIndicators[0].fillColor).toBe(0x4CAF50);
            expect(mode.ballIndicators[1].fillColor).toBe(0xFFEB3B);
            expect(mode.inputLocked).toBe(true);
            const before = scene.playedAudio().length;
            await run(scene, 3000);
            expect(scene.playedAudio().slice(before)).toEqual(patternNotes().map(n => `piano-${n}`));
            expect(mode.inputLocked).toBe(false);
            expect(mode.noteMarkers).toHaveLength(patternNotes().length);
        });

        it('ignores taps between a completed pattern and the next demo', async () => {
            playPattern();
            const next = patternNotes()[0];
            scene.click(keyFor(next));
            scene.click(keyFor(next));
            expect(mode.playerNotes).toEqual([]);
            expect(errorFlashes(scene)).toHaveLength(0);
            await run(scene, 3000);
            scene.click(keyFor(next));
            expect(mode.playerNotes).toEqual([next]);
        });

        it('plays the whole song and pays out exactly once', async () => {
            const total = mode.challengeData.totalPatterns;
            for (let p = 0; p < total; p++) {
                expect(mode.currentPatternIndex).toBe(p);
                playPattern();
                await run(scene, 3000);
            }
            expect(mode.currentPatternIndex).toBe(total);
            mode.ballIndicators.forEach(b => expect(b.fillColor).toBe(0x4CAF50));
            expect(calls).toHaveLength(0);
            // Full melody replays at 2x tempo (12 bars * 4 beats * 250ms = 12s)
            await run(scene, 15000, 100);
            expect(calls).toEqual([{ ok: true, answer: 'complete', x: scene.width / 2, y: scene.height / 2 }]);
            // Every note of the song was heard during the finale
            const finale = scene.playedAudio().slice(-flatNotes(mode.currentSong).length);
            expect(finale).toEqual(flatNotes(mode.currentSong).map(n => `piano-${n}`));
            // Extra taps and time after the payout change nothing
            scene.click(keyFor('C4'));
            scene.click(scene.findText('🔊'));
            await run(scene, 5000, 500);
            expect(calls).toHaveLength(1);
            expect(errorFlashes(scene)).toHaveLength(0);
            expect(scene._useAfterDestroy).toEqual([]);
            expect(scene._missingAudio).toEqual([]);
        });

        it('handles a song with eighth notes and sharps-free black key layout (Happy Birthday)', async () => {
            await start(HAPPY_BIRTHDAY, { measuresPerPattern: 3 });
            expect(mode.challengeData.totalPatterns).toBe(2);
            for (let p = 0; p < 2; p++) {
                playPattern();
                await run(scene, 8000, 25);
            }
            await run(scene, 10000, 100);
            expect(calls).toHaveLength(1);
        });
    });

    describe('wrong notes', () => {
        beforeEach(async () => { await start(); });

        it('flashes red, resets the pattern progress and replays the pattern', async () => {
            const notes = patternNotes();
            scene.click(keyFor(notes[0]));
            expect(mode.playerNotes).toHaveLength(1);
            scene.click(keyFor('B4'));
            expect(scene.lastAudio()).toBe('piano-B4');
            expect(keyFor('B4').fillColor).toBe(0xFF0000);
            expect(errorFlashes(scene)).toHaveLength(1);
            expect(mode.playerNotes).toEqual([]);
            expect(mode.currentPatternIndex).toBe(0);
            expect(mode.noteMarkers).toHaveLength(notes.length);
            scene.advance(300);
            expect(keyFor('B4').fillColor).toBe(0xFFFFFF);
            expect(errorFlashes(scene)).toHaveLength(0);
            const before = scene.playedAudio().length;
            await run(scene, 3000);
            expect(scene.playedAudio().slice(before)).toEqual(notes.map(n => `piano-${n}`));
            expect(mode.inputLocked).toBe(false);
            expect(calls).toHaveLength(0);
        });

        it('ignores taps while the error is shown and until the replay has finished', async () => {
            const notes = patternNotes();
            scene.click(keyFor('B4'));
            scene.click(keyFor(notes[0]));
            scene.advance(500);
            scene.click(keyFor(notes[0]));
            expect(mode.playerNotes).toEqual([]);
            await run(scene, 3000);
            playPattern();
            expect(mode.currentPatternIndex).toBe(1);
        });

        it('does not stack error feedback or replays on a double tap', async () => {
            scene.click(keyFor('B4'));
            scene.click(keyFor('B4'));
            scene.click(keyFor('A#3'));
            expect(errorFlashes(scene)).toHaveLength(1);
            expect(scene.playedAudio()).toEqual(['piano-B4']);
            await run(scene, 3000);
            expect(scene.playedAudio()).toEqual(['piano-B4', ...patternNotes().map(n => `piano-${n}`)]);
            expect(mode.isPlayingDemo).toBe(false);
        });

        it('still completes the pattern after recovering from a mistake', async () => {
            scene.click(keyFor('D3'));
            await run(scene, 3000);
            playPattern();
            expect(mode.currentPatternIndex).toBe(1);
            await run(scene, 3000);
            expect(mode.inputLocked).toBe(false);
        });
    });

    describe('cleanup', () => {
        beforeEach(async () => { await start(); });

        it('destroys everything and leaves no timers, tweens or sounds behind', () => {
            mode.cleanup(scene);
            expect(scene.liveObjects()).toEqual([]);
            expect(scene.clock.pendingTimers()).toEqual([]);
            expect(scene.clock.pendingTweens()).toEqual([]);
            expect(scene.sound.sounds).toEqual([]);
            expect(scene.interactives()).toEqual([]);
        });

        it('cancels a running demo', async () => {
            scene.click(scene.findText('🔊'));
            await run(scene, 300);
            mode.cleanup(scene);
            const t = scene.time.now;
            await run(scene, 10000, 500);
            expect(scene.objectsCreatedAfter(t)).toEqual([]);
            expect(scene.liveObjects()).toEqual([]);
            expect(scene._useAfterDestroy).toEqual([]);
            expect(scene.playingSounds()).toEqual([]);
        });

        it('cancels error feedback and its replay', async () => {
            scene.click(keyFor('B4'));
            scene.advance(100);
            mode.cleanup(scene);
            const t = scene.time.now;
            const played = scene.playedAudio().length;
            await run(scene, 10000, 500);
            expect(scene.objectsCreatedAfter(t)).toEqual([]);
            expect(scene.playedAudio()).toHaveLength(played);
            expect(scene._useAfterDestroy).toEqual([]);
            expect(calls).toHaveLength(0);
        });

        it('never reports the reward after being torn down mid-finale', async () => {
            const total = mode.challengeData.totalPatterns;
            for (let p = 0; p < total; p++) {
                playPattern();
                await run(scene, 3000);
            }
            await run(scene, 1500);
            expect(mode.isPlayingDemo).toBe(true);
            mode.cleanup(scene);
            const t = scene.time.now;
            await run(scene, 20000, 500);
            expect(calls).toHaveLength(0);
            expect(scene.objectsCreatedAfter(t)).toEqual([]);
            expect(scene._useAfterDestroy).toEqual([]);
        });

        it('cancels the pending next-pattern demo after a completed pattern', async () => {
            playPattern();
            mode.cleanup(scene);
            const played = scene.playedAudio().length;
            await run(scene, 5000, 500);
            expect(scene.playedAudio()).toHaveLength(played);
            expect(scene.liveObjects()).toEqual([]);
        });
    });
});
