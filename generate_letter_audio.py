#!/usr/bin/env python3
"""
Generate Swedish TTS audio for all Swedish alphabet letters using edge-tts
Output: public/letter_audio/{letter}.mp3
"""

import asyncio
import edge_tts
import os

# Swedish alphabet (29 letters)
SWEDISH_LETTERS = [
    'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M',
    'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z',
    'Å', 'Ä', 'Ö'
]

# Swedish voice for clear pronunciation
VOICE = "sv-SE-MattiasNeural"  # Male Swedish voice

async def generate_letter_audio(letter):
    """Generate TTS audio for a single letter"""
    filename = f"public/letter_audio/{letter.lower()}.mp3"

    try:
        print(f"Generating letter '{letter}'...", end=" ")

        # Create TTS
        tts = edge_tts.Communicate(letter, VOICE)
        await tts.save(filename)

        print(f"✓ Saved {filename}")
        return True
    except Exception as e:
        print(f"✗ Error: {e}")
        return False

async def main():
    # Create output directory if it doesn't exist
    os.makedirs("public/letter_audio", exist_ok=True)

    print(f"Generating Swedish TTS audio for all {len(SWEDISH_LETTERS)} letters...")
    print(f"Voice: {VOICE}")
    print(f"Output: public/letter_audio/\n")

    # Generate all audio files sequentially (to avoid corruption)
    results = []
    for letter in SWEDISH_LETTERS:
        result = await generate_letter_audio(letter)
        results.append(result)

    successful = sum(results)
    print(f"\n✓ Successfully generated {successful}/{len(SWEDISH_LETTERS)} audio files")
    print("Done! Audio files are ready to use in the game.")

if __name__ == "__main__":
    asyncio.run(main())
