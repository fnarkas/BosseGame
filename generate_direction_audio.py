#!/usr/bin/env python3
"""
Generate Swedish TTS audio for left/right directions using edge-tts
Output: public/direction_audio/hoger.mp3 and public/direction_audio/vanster.mp3
"""

import asyncio
import edge_tts
import os

# Swedish directions
DIRECTIONS = {
    'hoger': 'Höger',      # Right
    'vanster': 'Vänster'   # Left
}

# Swedish voice for clear pronunciation
VOICE = "sv-SE-MattiasNeural"  # Male Swedish voice

async def generate_direction_audio(key, word):
    """Generate TTS audio for a single direction word"""
    filename = f"public/direction_audio/{key}.mp3"

    try:
        print(f"Generating '{word}'...", end=" ")

        # Create TTS with direction word
        tts = edge_tts.Communicate(word, VOICE)
        await tts.save(filename)

        print(f"✓ Saved {filename}")
        return True
    except Exception as e:
        print(f"✗ Error: {e}")
        return False

async def main():
    # Create output directory if it doesn't exist
    os.makedirs("public/direction_audio", exist_ok=True)

    print(f"Generating Swedish TTS audio for directions...")
    print(f"Voice: {VOICE}")
    print(f"Output: public/direction_audio/\n")

    # Generate all audio files
    results = []
    for key, word in DIRECTIONS.items():
        result = await generate_direction_audio(key, word)
        results.append(result)

    successful = sum(results)
    print(f"\n✓ Successfully generated {successful}/{len(DIRECTIONS)} audio files")
    print("Done! Audio files are ready to use in the game.")

if __name__ == "__main__":
    asyncio.run(main())
