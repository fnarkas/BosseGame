/**
 * Piano Songs Data
 * Songs for the piano learning game
 * Each song is organized into measures (bars)
 * Duration: 1 = quarter note, 2 = half note, 4 = whole note
 * In 4/4 time, each measure should sum to 4 beats
 */

export const PIANO_SONGS = [
    {
        id: 'twinkle',
        name: 'Twinkle Twinkle Little Star',
        timeSignature: '4/4',
        measures: [
            // Twinkle twinkle little star
            [
                { note: 'C4', duration: 1 },
                { note: 'C4', duration: 1 },
                { note: 'G4', duration: 1 },
                { note: 'G4', duration: 1 }
            ],
            [
                { note: 'A4', duration: 1 },
                { note: 'A4', duration: 1 },
                { note: 'G4', duration: 2 }
            ],
            // How I wonder what you are
            [
                { note: 'F4', duration: 1 },
                { note: 'F4', duration: 1 },
                { note: 'E4', duration: 1 },
                { note: 'E4', duration: 1 }
            ],
            [
                { note: 'D4', duration: 1 },
                { note: 'D4', duration: 1 },
                { note: 'C4', duration: 2 }
            ],
            // Up above the world so high
            [
                { note: 'G4', duration: 1 },
                { note: 'G4', duration: 1 },
                { note: 'F4', duration: 1 },
                { note: 'F4', duration: 1 }
            ],
            [
                { note: 'E4', duration: 1 },
                { note: 'E4', duration: 1 },
                { note: 'D4', duration: 2 }
            ],
            // Like a diamond in the sky
            [
                { note: 'G4', duration: 1 },
                { note: 'G4', duration: 1 },
                { note: 'F4', duration: 1 },
                { note: 'F4', duration: 1 }
            ],
            [
                { note: 'E4', duration: 1 },
                { note: 'E4', duration: 1 },
                { note: 'D4', duration: 2 }
            ],
            // Twinkle twinkle little star
            [
                { note: 'C4', duration: 1 },
                { note: 'C4', duration: 1 },
                { note: 'G4', duration: 1 },
                { note: 'G4', duration: 1 }
            ],
            [
                { note: 'A4', duration: 1 },
                { note: 'A4', duration: 1 },
                { note: 'G4', duration: 2 }
            ],
            // How I wonder what you are
            [
                { note: 'F4', duration: 1 },
                { note: 'F4', duration: 1 },
                { note: 'E4', duration: 1 },
                { note: 'E4', duration: 1 }
            ],
            [
                { note: 'D4', duration: 1 },
                { note: 'D4', duration: 1 },
                { note: 'C4', duration: 2 }
            ]
        ]
    },
    {
        id: 'baabaa',
        name: 'Baa Baa Black Sheep',
        timeSignature: '4/4',
        measures: [
            // Baa baa black sheep
            [
                { note: 'C4', duration: 1 },
                { note: 'C4', duration: 1 },
                { note: 'G4', duration: 1 },
                { note: 'G4', duration: 1 }
            ],
            [
                { note: 'A4', duration: 1 },
                { note: 'A4', duration: 1 },
                { note: 'G4', duration: 2 }
            ],
            // Have you any wool
            [
                { note: 'F4', duration: 1 },
                { note: 'F4', duration: 1 },
                { note: 'E4', duration: 1 },
                { note: 'E4', duration: 1 }
            ],
            [
                { note: 'D4', duration: 1 },
                { note: 'D4', duration: 1 },
                { note: 'C4', duration: 2 }
            ],
            // Yes sir yes sir
            [
                { note: 'G4', duration: 1 },
                { note: 'G4', duration: 1 },
                { note: 'F4', duration: 1 },
                { note: 'F4', duration: 1 }
            ],
            [
                { note: 'E4', duration: 1 },
                { note: 'E4', duration: 1 },
                { note: 'D4', duration: 2 }
            ],
            // Three bags full
            [
                { note: 'G4', duration: 1 },
                { note: 'G4', duration: 1 },
                { note: 'F4', duration: 1 },
                { note: 'F4', duration: 1 }
            ],
            [
                { note: 'E4', duration: 1 },
                { note: 'E4', duration: 1 },
                { note: 'D4', duration: 2 }
            ],
            // One for my master
            [
                { note: 'C4', duration: 1 },
                { note: 'C4', duration: 1 },
                { note: 'G4', duration: 1 },
                { note: 'G4', duration: 1 }
            ],
            [
                { note: 'A4', duration: 1 },
                { note: 'A4', duration: 1 },
                { note: 'G4', duration: 2 }
            ],
            // One for my dame
            [
                { note: 'F4', duration: 1 },
                { note: 'F4', duration: 1 },
                { note: 'E4', duration: 1 },
                { note: 'E4', duration: 1 }
            ],
            [
                { note: 'D4', duration: 1 },
                { note: 'D4', duration: 1 },
                { note: 'C4', duration: 2 }
            ]
        ]
    },
    {
        id: 'mary',
        name: 'Mary Had a Little Lamb',
        timeSignature: '4/4',
        measures: [
            // Mary had a little lamb
            [
                { note: 'E4', duration: 1 },
                { note: 'D4', duration: 1 },
                { note: 'C4', duration: 1 },
                { note: 'D4', duration: 1 }
            ],
            [
                { note: 'E4', duration: 1 },
                { note: 'E4', duration: 1 },
                { note: 'E4', duration: 2 }
            ],
            // Little lamb little lamb
            [
                { note: 'D4', duration: 1 },
                { note: 'D4', duration: 1 },
                { note: 'D4', duration: 2 }
            ],
            [
                { note: 'E4', duration: 1 },
                { note: 'G4', duration: 1 },
                { note: 'G4', duration: 2 }
            ],
            // Mary had a little lamb
            [
                { note: 'E4', duration: 1 },
                { note: 'D4', duration: 1 },
                { note: 'C4', duration: 1 },
                { note: 'D4', duration: 1 }
            ],
            [
                { note: 'E4', duration: 1 },
                { note: 'E4', duration: 1 },
                { note: 'E4', duration: 2 }
            ],
            // Its fleece was white as snow
            [
                { note: 'E4', duration: 1 },
                { note: 'D4', duration: 1 },
                { note: 'D4', duration: 1 },
                { note: 'E4', duration: 1 }
            ],
            [
                { note: 'D4', duration: 1 },
                { note: 'C4', duration: 3 }
            ]
        ]
    }
];

/**
 * Piano keyboard layout
 * Maps note names to visual positions on the keyboard
 * Two octaves: C3 to C5
 */
export const PIANO_KEYS = [
    // Octave 3
    { note: 'C3', type: 'white', whiteIndex: 0 },
    { note: 'C#3', type: 'black', whiteIndex: 0 }, // Between C and D
    { note: 'D3', type: 'white', whiteIndex: 1 },
    { note: 'D#3', type: 'black', whiteIndex: 1 }, // Between D and E
    { note: 'E3', type: 'white', whiteIndex: 2 },
    { note: 'F3', type: 'white', whiteIndex: 3 },
    { note: 'F#3', type: 'black', whiteIndex: 3 }, // Between F and G
    { note: 'G3', type: 'white', whiteIndex: 4 },
    { note: 'G#3', type: 'black', whiteIndex: 4 }, // Between G and A
    { note: 'A3', type: 'white', whiteIndex: 5 },
    { note: 'A#3', type: 'black', whiteIndex: 5 }, // Between A and B
    { note: 'B3', type: 'white', whiteIndex: 6 },

    // Octave 4 (middle C)
    { note: 'C4', type: 'white', whiteIndex: 7 },
    { note: 'C#4', type: 'black', whiteIndex: 7 }, // Between C and D
    { note: 'D4', type: 'white', whiteIndex: 8 },
    { note: 'D#4', type: 'black', whiteIndex: 8 }, // Between D and E
    { note: 'E4', type: 'white', whiteIndex: 9 },
    { note: 'F4', type: 'white', whiteIndex: 10 },
    { note: 'F#4', type: 'black', whiteIndex: 10 }, // Between F and G
    { note: 'G4', type: 'white', whiteIndex: 11 },
    { note: 'G#4', type: 'black', whiteIndex: 11 }, // Between G and A
    { note: 'A4', type: 'white', whiteIndex: 12 },
    { note: 'A#4', type: 'black', whiteIndex: 12 }, // Between A and B
    { note: 'B4', type: 'white', whiteIndex: 13 },

    // Octave 5
    { note: 'C5', type: 'white', whiteIndex: 14 }
];

/**
 * Get a random song
 */
export function getRandomSong() {
    const randomIndex = Math.floor(Math.random() * PIANO_SONGS.length);
    return PIANO_SONGS[randomIndex];
}

/**
 * Get piano key data by note name
 */
export function getPianoKey(noteName) {
    return PIANO_KEYS.find(key => key.note === noteName);
}
