#!/usr/bin/env python3
"""
Trim silence from all number audio files using ffmpeg
"""

import subprocess
import os
from pathlib import Path

def trim_audio_file(filepath):
    """Trim silence from start and end of audio file"""
    temp_file = str(filepath) + ".trimmed.mp3"

    # Use ffmpeg to remove silence
    cmd = [
        'ffmpeg',
        '-i', str(filepath),
        '-af', 'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.05:stop_periods=-1:stop_threshold=-50dB:stop_silence=0.05',
        '-y',
        temp_file
    ]

    try:
        # Run ffmpeg, suppress output
        subprocess.run(cmd, capture_output=True, check=True)

        # Replace original with trimmed version
        os.replace(temp_file, filepath)
        print(f"✓ Trimmed {filepath.name}")
        return True
    except subprocess.CalledProcessError as e:
        print(f"✗ Failed to trim {filepath.name}: {e}")
        # Clean up temp file if it exists
        if os.path.exists(temp_file):
            os.remove(temp_file)
        return False

def main():
    audio_dir = Path('public/number_audio')

    # Only trim files 0-9
    audio_files = [audio_dir / f"{i}.mp3" for i in range(10)]

    print(f"Trimming silence from numbers 0-9...")
    print()

    success_count = 0
    for audio_file in audio_files:
        if trim_audio_file(audio_file):
            success_count += 1

    print()
    print(f"✓ Successfully trimmed {success_count}/{len(audio_files)} files")

if __name__ == "__main__":
    main()
