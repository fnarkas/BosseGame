#!/usr/bin/env python3
"""
Generate Swedish TTS audio for numbers 10-99 using edge-tts
Output: public/number_audio/{number}.mp3
"""

import asyncio
import edge_tts
import os

# Swedish voice for clear pronunciation
VOICE = "sv-SE-MattiasNeural"  # Male Swedish voice

async def generate_number_audio(number):
    """Generate TTS audio for a single number"""
    filename = f"public/number_audio/{number}.mp3"

    try:
        print(f"Generating number '{number}'...", end=" ")

        # Create TTS with the number
        tts = edge_tts.Communicate(str(number), VOICE)
        await tts.save(filename)

        print(f"✓ Saved {filename}")
        return True
    except Exception as e:
        print(f"✗ Error: {e}")
        return False

async def main():
    # Create output directory if it doesn't exist
    os.makedirs("public/number_audio", exist_ok=True)

    # Generate numbers 10-99 (90 numbers total)
    numbers = range(10, 100)

    print(f"Generating Swedish TTS audio for numbers 10-99 ({len(list(numbers))} numbers)...")
    print(f"Voice: {VOICE}")
    print(f"Output: public/number_audio/\n")

    # Generate all audio files sequentially (to avoid corruption)
    results = []
    for number in range(10, 100):
        result = await generate_number_audio(number)
        results.append(result)

    successful = sum(results)
    print(f"\n✓ Successfully generated {successful}/90 audio files")
    print("Done! Audio files are ready to use in the game.")

if __name__ == "__main__":
    asyncio.run(main())
