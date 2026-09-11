import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FakeScene, startMode, flush } from '../helpers/fakeScene.js';
import { setTestConfig } from '../helpers/setup.js';
import { LegendaryNumbersMode } from '../../src/pokeballGameModes/LegendaryNumbersMode.js';

const SMALL_SET = '3,12,45';

function heartsText(scene) {
    return scene.findText(t => t.text.includes('❤️') || t.text.includes('🖤'));
}

describe('LegendaryNumbersMode', () => {
    let scene, mode, calls;

    const boxFor = (digit) => mode.digitBoxes.find(b => b.getData('digit') === digit);
    const dropDigit = (digit, zone) => scene.drag(boxFor(digit), zone.x, zone.y);
    // Drop the digits of `n` into the zones (tens first, then ones).
    const answer = (n) => {
        if (n >= 10) dropDigit(Math.floor(n / 10), mode.tensZone);
        dropDigit(n % 10, mode.onesZone);
    };
    const wrongAnswerFor = (n) => (n >= 10 ? (n === 99 ? 98 : n + 1) : (n === 9 ? 8 : n + 1));

    async function start(configSection) {
        setTestConfig({ legendaryNumbers: configSection });
        scene = new FakeScene();
        mode = new LegendaryNumbersMode();
        calls = [];
        mode.setAnswerCallback((ok, answer, x, y) => calls.push({ ok, answer, x, y }));
        await startMode(mode, scene);
    }

    beforeEach(async () => {
        await start({ coinReward: 100, maxErrors: 3, numbers: SMALL_SET });
    });

    describe('config', () => {
        it('parses ranges and lists, dropping numbers above 99', async () => {
            await start({ coinReward: 50, maxErrors: 2, numbers: '12-20,30,40,150' });
            expect(mode.configLoaded).toBe(true);
            expect(mode.config.coinReward).toBe(50);
            expect(mode.config.maxErrors).toBe(2);
            expect(mode.errorsRemaining).toBe(2);
            expect([...mode.activeNumbers]).toEqual([12, 13, 14, 15, 16, 17, 18, 19, 20, 30, 40]);
        });

        it('falls back to 0-99 when the numbers string is invalid', async () => {
            await start({ coinReward: 100, maxErrors: 3, numbers: '20-10' });
            expect(mode.activeNumbers.size).toBe(100);
        });

        it('uses defaults (0-99) when the config section is missing', async () => {
            await start(undefined);
            expect(mode.configLoaded).toBe(true);
            expect(mode.activeNumbers.size).toBe(100);
            expect(mode.config.maxErrors).toBe(5);
            expect(mode.errorsRemaining).toBe(5);
            expect(heartsText(scene).text).toBe('❤️'.repeat(5));
        });

        it('rejects garbage and negatives in the numbers list and dedupes it', async () => {
            await start({ coinReward: 100, maxErrors: 3, numbers: 'abc' });
            expect(mode.activeNumbers.size).toBe(100);
            await start({ coinReward: 100, maxErrors: 3, numbers: '-5' });
            expect(mode.activeNumbers.size).toBe(100);
            await start({ coinReward: 100, maxErrors: 3, numbers: '1,1,2-3' });
            expect([...mode.activeNumbers]).toEqual([1, 2, 3]);
        });
    });

    describe('challenge generation', () => {
        it('always picks an active, uncleared number and consistent digits', () => {
            for (let i = 0; i < 200; i++) {
                mode.generateChallenge();
                const n = mode.currentNumber;
                expect(mode.activeNumbers.has(n)).toBe(true);
                expect(mode.clearedNumbers.has(n)).toBe(false);
                expect(mode.challengeData).toEqual({ number: n, tens: Math.floor(n / 10), ones: n % 10 });
            }
        });

        it('never repeats a cleared number', () => {
            mode.clearedNumbers.add(3);
            mode.clearedNumbers.add(12);
            for (let i = 0; i < 50; i++) {
                mode.generateChallenge();
                expect(mode.currentNumber).toBe(45);
            }
        });

        it('covers every active number over many draws', () => {
            const seen = new Set();
            for (let i = 0; i < 300; i++) {
                mode.generateChallenge();
                seen.add(mode.currentNumber);
            }
            expect(seen).toEqual(new Set([3, 12, 45]));
        });
    });

    describe('UI', () => {
        it('creates ten draggable digit boxes, two zones, hearts and a speaker', () => {
            expect(mode.digitBoxes).toHaveLength(10);
            mode.digitBoxes.forEach(b => expect(b.input.draggable).toBe(true));
            expect(mode.tensZone).toBeTruthy();
            expect(mode.onesZone).toBeTruthy();
            expect(heartsText(scene).text).toBe('❤️❤️❤️');
            expect(scene.findText('🔊')).toBeTruthy();
        });

        it('hides the tens zone for single-digit numbers and shows it otherwise', () => {
            mode.currentNumber = 3;
            mode.updateDropZoneVisibility();
            expect(mode.tensZone.visible).toBe(false);
            expect(mode.onesZone.visible).toBe(true);
            mode.currentNumber = 45;
            mode.updateDropZoneVisibility();
            expect(mode.tensZone.visible).toBe(true);
        });

        it('plays the number audio on start and on the speaker button', () => {
            const key = `number_audio_${mode.currentNumber}`;
            expect(scene.playedAudio()).toEqual([key]);
            expect(scene._missingAudio).toEqual([]);
            scene.click(scene.findText('🔊'));
            expect(scene.playedAudio()).toEqual([key, key]);
        });

        it('has audio for every number 0-99', () => {
            for (let n = 0; n <= 99; n++) {
                mode.currentNumber = n;
                mode.playNumberAudio(scene);
            }
            expect(scene._missingAudio).toEqual([]);
            expect(scene.playedAudio()).toHaveLength(101);
        });

        it('snaps a digit box back after any drop', () => {
            const box = boxFor(7);
            scene.drag(box, 50, 50);
            scene.advance(300);
            expect(box.x).toBe(box.getData('startX'));
            expect(box.y).toBe(box.getData('startY'));
            expect(box.getData('text').x).toBe(box.getData('startX'));
        });
    });

    describe('answering', () => {
        it('clears every active number and then rewards exactly once', () => {
            const order = [];
            for (let i = 0; i < 3; i++) {
                const n = mode.currentNumber;
                order.push(n);
                answer(n);
                expect(mode.clearedNumbers.has(n)).toBe(true);
                scene.advance(600);
            }
            expect(new Set(order)).toEqual(new Set([3, 12, 45]));
            expect(calls).toEqual([{ ok: true, answer: 'legendary-numbers-complete', x: 640, y: 450 }]);
            scene.advance(10000);
            expect(calls).toHaveLength(1);
        });

        it('a two-digit number needs both digits before it is checked', () => {
            mode.currentNumber = 45;
            mode.updateDropZoneVisibility();
            dropDigit(4, mode.tensZone);
            expect(mode.isRevealing).toBe(false);
            expect(mode.tensZone.getData('label').text).toBe('4');
            dropDigit(5, mode.onesZone);
            expect(mode.isRevealing).toBe(true);
            expect(mode.clearedNumbers.has(45)).toBe(true);
        });

        it('loses a heart on a wrong answer, reveals and speaks the number, then repeats it', () => {
            const n = mode.currentNumber;
            const before = scene.playedAudio().length;
            answer(wrongAnswerFor(n));
            expect(mode.errorsRemaining).toBe(2);
            expect(heartsText(scene).text).toBe('❤️❤️🖤');
            expect(mode.clearedNumbers.size).toBe(0);
            expect(mode.onesZone.fillColor).toBe(0xFF0000);

            // After the shake the right digits are shown in gold and spoken
            scene.advance(500);
            expect(mode.onesZone.fillColor).toBe(0xFFD700);
            expect(mode.onesZone.getData('label').text).toBe(String(n % 10));
            if (n >= 10) expect(mode.tensZone.getData('label').text).toBe(String(Math.floor(n / 10)));
            expect(scene.playedAudio().slice(before)).toEqual([`number_audio_${n}`]);

            // Then the same number again on a fresh board, with the audio replayed
            scene.advance(1000);
            expect(mode.currentNumber).toBe(n);
            expect(mode.isRevealing).toBe(false);
            expect(mode.inputLocked).toBe(false);
            expect(mode.tensZone.getData('value')).toBeNull();
            expect(mode.onesZone.getData('value')).toBeNull();
            expect(mode.tensZone.getData('label').text).toBe('');
            expect(mode.onesZone.getData('label').text).toBe('');
            expect(heartsText(scene).text).toBe('❤️❤️🖤');
            expect(scene.lastAudio()).toBe(`number_audio_${n}`);
            expect(calls).toHaveLength(0);
        });

        it('ignores drops while the answer feedback is showing', () => {
            const n = mode.currentNumber;
            answer(wrongAnswerFor(n));
            expect(mode.isRevealing).toBe(true);
            scene.advance(300); // boxes have snapped back, red flash still showing
            // Try to answer correctly during the red flash
            answer(n);
            expect(mode.clearedNumbers.size).toBe(0);
            expect(mode.errorsRemaining).toBe(2);
            // The boxes did not move away from their start slots
            mode.digitBoxes.forEach(b => {
                expect(b.x).toBe(b.getData('startX'));
                expect(b.y).toBe(b.getData('startY'));
            });
            scene.advance(1500);
            expect(mode.errorsRemaining).toBe(2);
            expect(mode.isRevealing).toBe(false);
        });

        it('does not double count a correct answer dropped twice', () => {
            const n = mode.currentNumber;
            answer(n);
            answer(n);
            answer(n);
            expect(mode.clearedNumbers.size).toBe(1);
            scene.advance(600);
            expect(mode.clearedNumbers.size).toBe(1);
            expect(mode.currentNumber).not.toBe(n);
            expect(scene.clock.pendingTimers()).toEqual([]);
        });
    });

    describe('game over', () => {
        function patchSceneForGameOver(registry = {}) {
            for (const [k, v] of Object.entries(registry)) scene.registry.set(k, v);
            scene.gameMode = mode;
            scene.challengeCount = 0;
            scene.nextMode = { setAnswerCallback: vi.fn(), cleanup: vi.fn() };
            scene.selectGameMode = vi.fn(async () => {
                await new Promise(resolve => setImmediate(resolve)); // like loadModeWeights()
                scene.gameMode = scene.nextMode;
            });
            scene.showDiceRollAnimation = vi.fn();
            scene.handleAnswer = vi.fn();
        }

        it('after losing every heart, hands over to a fresh mode with its callback wired', async () => {
            patchSceneForGameOver();
            for (let i = 0; i < 3; i++) {
                answer(wrongAnswerFor(mode.currentNumber));
                scene.advance(1500);
            }
            await flush();
            expect(mode.errorsRemaining).toBe(3);
            expect(mode.clearedNumbers.size).toBe(0);
            expect(scene.liveObjects()).toEqual([]);
            expect(scene.challengeCount).toBe(1);
            expect(scene.selectGameMode).toHaveBeenCalledTimes(1);
            expect(scene.gameMode).toBe(scene.nextMode);
            // The NEW mode must get the callback, not the finished one
            expect(scene.nextMode.setAnswerCallback).toHaveBeenCalledTimes(1);
            expect(scene.showDiceRollAnimation).toHaveBeenCalledTimes(1);
            expect(calls).toHaveLength(0);
        });

        it('returns to the main scene in forced debug mode', async () => {
            patchSceneForGameOver({ pokeballGameMode: 'legendary-numbers-only' });
            for (let i = 0; i < 3; i++) {
                answer(wrongAnswerFor(mode.currentNumber));
                scene.advance(1500);
            }
            await flush();
            expect(scene.showDiceRollAnimation).not.toHaveBeenCalled();
            expect(scene.sceneCalls).toEqual([{ method: 'start', key: 'MainGameScene', data: undefined }]);
        });
    });

    describe('cleanup', () => {
        it('after a correct answer leaves no timers, objects or callbacks behind', () => {
            answer(mode.currentNumber);
            mode.cleanup(scene);
            const t = scene.time.now;
            expect(() => scene.advance(10000)).not.toThrow();
            expect(scene.objectsCreatedAfter(t)).toEqual([]);
            expect(scene.liveObjects()).toEqual([]);
            expect(scene.clock.pendingTimers()).toEqual([]);
            expect(scene._useAfterDestroy).toEqual([]);
            expect(calls).toHaveLength(0);
        });

        it('after a wrong answer leaves no timers, objects or callbacks behind', () => {
            answer(wrongAnswerFor(mode.currentNumber));
            mode.cleanup(scene);
            const t = scene.time.now;
            expect(() => scene.advance(10000)).not.toThrow();
            expect(scene.objectsCreatedAfter(t)).toEqual([]);
            expect(scene.liveObjects()).toEqual([]);
            expect(scene.clock.pendingTimers()).toEqual([]);
            expect(scene._useAfterDestroy).toEqual([]);
            expect(calls).toHaveLength(0);
        });

        it('cancels the completion callback if cleaned up during the final flash', () => {
            mode.clearedNumbers.add(3);
            mode.clearedNumbers.add(12);
            mode.currentNumber = 45;
            mode.updateDropZoneVisibility();
            answer(45);
            mode.cleanup(scene);
            scene.advance(10000);
            expect(calls).toHaveLength(0);
            expect(scene.playingSounds()).toEqual([]);
        });
    });
});
