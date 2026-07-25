// Single source of truth for the minigame wheel.
//
// Each entry is one slice on the spin wheel, in draw order (slice 0 at the top,
// proceeding clockwise). A slice maps to one or more game-mode classes and to
// one or more weight keys in public/config/minigames.json. A slice only appears
// on the wheel when the combined weight of its keys is greater than 0, so a mode
// set to probability 0 disappears from the wheel entirely.
//
// Some slices are shared by two closely related modes (e.g. number listening /
// reading, clock listening / reading); those list both class names and both
// weight keys.

export const WHEEL_SLICES = [
    { classNames: ['LetterListeningMode'],                       iconKey: 'game-mode-letter',            color: 0xFF6B6B, weightKeys: ['letterListening'] },
    { classNames: ['WordEmojiMatchMode'],                        iconKey: 'game-mode-word',              color: 0x4ECDC4, weightKeys: ['wordEmoji'] },
    { classNames: ['EmojiWordMatchMode'],                        iconKey: 'game-mode-emojiword',         color: 0xFFE66D, weightKeys: ['emojiWord'] },
    { classNames: ['LeftRightMode'],                             iconKey: 'game-mode-directions',        color: 0x95E1D3, weightKeys: ['leftRight'] },
    { classNames: ['LetterDragMatchMode'],                       iconKey: 'game-mode-lettermatch',       color: 0xA78BFA, weightKeys: ['letterDragMatch'] },
    { classNames: ['SpeechRecognitionMode'],                     iconKey: 'game-mode-speech',            color: 0xFF8C42, weightKeys: ['speechRecognition'] },
    { classNames: ['NumberListeningMode', 'NumberReadingMode'],  iconKey: 'game-mode-numbers',           color: 0x26A69A, weightKeys: ['numberListening', 'numberReading'] },
    { classNames: ['WordSpellingMode'],                          iconKey: 'game-mode-spelling',          color: 0xFFC107, weightKeys: ['wordSpelling'] },
    { classNames: ['LegendaryAlphabetMatchMode'],                iconKey: 'game-mode-legendary',         color: 0xFFD700, weightKeys: ['legendary'] },
    { classNames: ['LegendaryNumbersMode'],                      iconKey: 'game-mode-legendary-numbers', color: 0x00BCD4, weightKeys: ['legendaryNumbers'] },
    { classNames: ['DayMatchMode'],                              iconKey: 'game-mode-dayofweek',         color: 0xE91E63, weightKeys: ['dayMatch'] },
    { classNames: ['AdditionMode'],                              iconKey: 'game-mode-addition',          color: 0x4CAF50, weightKeys: ['addition'] },
    { classNames: ['ShapeDirectionsMode'],                       iconKey: 'game-mode-shapedirections',   color: 0xFF5722, weightKeys: ['shapeDirections'] },
    { classNames: ['ClockListeningMode', 'ClockReadingMode'],    iconKey: 'game-mode-clock',             color: 0x9C27B0, weightKeys: ['clockListening', 'clockReading'] },
    { classNames: ['PianoLearningMode'],                         iconKey: 'game-mode-piano',             color: 0x9b59b6, weightKeys: ['pianoLearning'] }
];

// Default weight for every mode key. Config values in minigames.json are merged
// over these, so any key omitted from the config keeps its default here.
export const DEFAULT_MODE_WEIGHTS = {
    letterListening: 10,
    wordEmoji: 10,
    emojiWord: 10,
    leftRight: 10,
    letterDragMatch: 10,
    speechRecognition: 10,
    numberListening: 10,
    numberReading: 10,
    wordSpelling: 40,
    legendary: 10,
    legendaryNumbers: 10,
    dayMatch: 10,
    addition: 10,
    shapeDirections: 10,
    clockListening: 10,
    clockReading: 10,
    pianoLearning: 3
};

// Fetch the configured weights, merged over the defaults. Never throws.
export async function loadModeWeights() {
    let weights = { ...DEFAULT_MODE_WEIGHTS };
    try {
        const response = await fetch('/config/minigames.json');
        if (response.ok) {
            const config = await response.json();
            if (config.weights) {
                weights = { ...DEFAULT_MODE_WEIGHTS, ...config.weights };
            }
        }
    } catch (error) {
        console.warn('Failed to load weights from config, using defaults:', error);
    }
    return weights;
}

// Combined weight of a slice (sum of its weight keys).
export function sliceWeight(slice, weights) {
    return slice.weightKeys.reduce((sum, key) => sum + (weights[key] || 0), 0);
}

// The slices to show on the wheel: those with a combined weight > 0, in draw
// order. Falls back to every slice if the config would leave the wheel empty
// (all weights 0) so the wheel is never blank.
export function getEnabledSlices(weights) {
    const enabled = WHEEL_SLICES.filter(slice => sliceWeight(slice, weights) > 0);
    return enabled.length > 0 ? enabled : WHEEL_SLICES;
}
