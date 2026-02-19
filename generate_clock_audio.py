#!/usr/bin/env python3
"""
Generate Swedish clock time audio files using Edge-TTS

Creates audio files for:
- Whole hours: "Klockan ett", "Klockan två", etc. (1-12)
- Half hours: "Klockan halv två", "Klockan halv tre", etc. (1:30-12:30)

Note: Swedish "halv" convention:
- "Klockan halv två" = 1:30 (half to two)
- "Klockan halv tre" = 2:30 (half to three)
"""

import asyncio
import os
from pathlib import Path

try:
    import edge_tts
except ImportError:
    print("Error: edge-tts not installed")
    print("Install with: pip install edge-tts")
    exit(1)

# Swedish voice (choose one)
VOICE = "sv-SE-SofieNeural"  # Female voice
# VOICE = "sv-SE-MattiasNeural"  # Male voice

# Output directory
OUTPUT_DIR = Path("public/clock_audio")

# Swedish hour names (1-12)
HOUR_NAMES = {
    1: "ett",
    2: "två",
    3: "tre",
    4: "fyra",
    5: "fem",
    6: "sex",
    7: "sju",
    8: "åtta",
    9: "nio",
    10: "tio",
    11: "elva",
    12: "tolv"
}

async def generate_audio(text, filename):
    """Generate audio file using Edge-TTS"""
    filepath = OUTPUT_DIR / filename
    print(f"Generating: {filename} - '{text}'")

    communicate = edge_tts.Communicate(text, VOICE)
    await communicate.save(str(filepath))
    print(f"  ✓ Saved: {filepath}")

async def generate_all_clock_audio():
    """Generate all clock audio files"""

    # Create output directory if it doesn't exist
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Output directory: {OUTPUT_DIR}\n")

    tasks = []

    # Generate whole hours (1:00 - 12:00)
    print("=== Whole Hours ===")
    for hour in range(1, 13):
        text = f"Klockan {HOUR_NAMES[hour]}"
        filename = f"klockan_{hour:02d}.mp3"
        tasks.append(generate_audio(text, filename))

    # Generate half hours (1:30 - 12:30)
    # Swedish convention: "halv två" = 1:30, "halv tre" = 2:30, etc.
    print("\n=== Half Hours ===")
    for hour in range(1, 13):
        next_hour = (hour % 12) + 1  # 1:30 = "halv två", 12:30 = "halv ett"
        text = f"Klockan halv {HOUR_NAMES[next_hour]}"
        filename = f"klockan_{hour:02d}_30.mp3"
        tasks.append(generate_audio(text, filename))

    # Run all generations
    await asyncio.gather(*tasks)

    print(f"\n✓ Generated {len(tasks)} audio files in {OUTPUT_DIR}")
    print("\nNext steps:")
    print("1. Run trim_clock_audio.py to remove silence")
    print("2. Test audio files in the game")

if __name__ == "__main__":
    asyncio.run(generate_all_clock_audio())
