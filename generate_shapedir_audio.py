#!/usr/bin/env python3
"""
Generate Swedish TTS audio components for Shape Directions game
Output: public/shapedir_audio/{component}.mp3

Components:
- 2 prefix files (höger/vänster)
- 24 color-shape combinations
Total: 26 files
"""

import asyncio
import edge_tts
import os

# Swedish voice for clear pronunciation
VOICE = "sv-SE-MattiasNeural"  # Male Swedish voice

# Prefix phrases
PREFIXES = {
    'hoger': 'Tryck på formen till höger om den',
    'vanster': 'Tryck på formen till vänster om den'
}

# Color-shape combinations (definite form with grammatical agreement)
COLOR_SHAPES = [
    # Blue (blå → blåa)
    ('blue', 'circle', 'blåa cirkeln'),
    ('blue', 'square', 'blåa fyrkanten'),
    ('blue', 'triangle', 'blåa triangeln'),
    ('blue', 'star', 'blåa stjärnan'),

    # Red (röd → röda)
    ('red', 'circle', 'röda cirkeln'),
    ('red', 'square', 'röda fyrkanten'),
    ('red', 'triangle', 'röda triangeln'),
    ('red', 'star', 'röda stjärnan'),

    # Yellow (gul → gula)
    ('yellow', 'circle', 'gula cirkeln'),
    ('yellow', 'square', 'gula fyrkanten'),
    ('yellow', 'triangle', 'gula triangeln'),
    ('yellow', 'star', 'gula stjärnan'),

    # Green (grön → gröna)
    ('green', 'circle', 'gröna cirkeln'),
    ('green', 'square', 'gröna fyrkanten'),
    ('green', 'triangle', 'gröna triangeln'),
    ('green', 'star', 'gröna stjärnan'),

    # Orange (orange → orange, no change)
    ('orange', 'circle', 'orange cirkeln'),
    ('orange', 'square', 'orange fyrkanten'),
    ('orange', 'triangle', 'orange triangeln'),
    ('orange', 'star', 'orange stjärnan'),

    # Purple (lila → lila, no change)
    ('purple', 'circle', 'lila cirkeln'),
    ('purple', 'square', 'lila fyrkanten'),
    ('purple', 'triangle', 'lila triangeln'),
    ('purple', 'star', 'lila stjärnan'),
]

async def generate_audio(key, text, filename):
    """Generate TTS audio for a single phrase"""
    try:
        print(f"Generating '{key}': '{text}'...", end=" ")

        tts = edge_tts.Communicate(text, VOICE)
        await tts.save(filename)

        print(f"✓ Saved {filename}")
        return True
    except Exception as e:
        print(f"✗ Error: {e}")
        return False

async def main():
    # Create output directory
    os.makedirs("public/shapedir_audio", exist_ok=True)

    print(f"Generating Swedish TTS audio for Shape Directions game...")
    print(f"Voice: {VOICE}")
    print(f"Output: public/shapedir_audio/\n")

    results = []

    # Generate prefix files
    print("=== Generating Prefixes ===")
    for direction, text in PREFIXES.items():
        filename = f"public/shapedir_audio/shapedir_prefix_{direction}.mp3"
        result = await generate_audio(f"prefix_{direction}", text, filename)
        results.append(result)

    print("\n=== Generating Color-Shape Combinations ===")
    # Generate color-shape combinations
    for color, shape, text in COLOR_SHAPES:
        filename = f"public/shapedir_audio/shapedir_{color}_{shape}.mp3"
        key = f"{color}_{shape}"
        result = await generate_audio(key, text, filename)
        results.append(result)

    successful = sum(results)
    total = len(results)
    print(f"\n✓ Successfully generated {successful}/{total} audio files")
    print(f"Saved to: public/shapedir_audio/")
    print("Done! Audio components ready for runtime stitching.")

if __name__ == "__main__":
    asyncio.run(main())
