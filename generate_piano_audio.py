#!/usr/bin/env python3
"""
Generate piano note audio files using pydub and synthesized tones
Creates audio files for two octaves: C3 to C5

Requires: pydub, numpy
Install: pip3 install pydub numpy
"""

import os
import math
import numpy as np
from pydub import AudioSegment
from pydub.generators import Sine

# Note frequencies in Hz (A4 = 440Hz standard)
# Formula: f = 440 * 2^((n-49)/12) where n is piano key number (A4 = 49)
NOTE_FREQUENCIES = {
    # Octave 3
    'C3': 130.81,
    'C#3': 138.59,
    'D3': 146.83,
    'D#3': 155.56,
    'E3': 164.81,
    'F3': 174.61,
    'F#3': 185.00,
    'G3': 196.00,
    'G#3': 207.65,
    'A3': 220.00,
    'A#3': 233.08,
    'B3': 246.94,

    # Octave 4 (middle C)
    'C4': 261.63,
    'C#4': 277.18,
    'D4': 293.66,
    'D#4': 311.13,
    'E4': 329.63,
    'F4': 349.23,
    'F#4': 369.99,
    'G4': 392.00,
    'G#4': 415.30,
    'A4': 440.00,
    'A#4': 466.16,
    'B4': 493.88,

    # Octave 5
    'C5': 523.25
}

def create_piano_note(frequency, duration_ms=800):
    """
    Create a piano-like tone using multiple harmonics
    Piano sound has fundamental + harmonics with envelope
    """
    # Generate sine wave at fundamental frequency
    fundamental = Sine(frequency).to_audio_segment(duration=duration_ms)

    # Add harmonics (makes it sound more piano-like)
    # Piano has strong 2nd and 3rd harmonics
    harmonic2 = Sine(frequency * 2).to_audio_segment(duration=duration_ms) - 12  # -12dB
    harmonic3 = Sine(frequency * 3).to_audio_segment(duration=duration_ms) - 18  # -18dB

    # Mix harmonics
    note = fundamental.overlay(harmonic2).overlay(harmonic3)

    # Apply envelope (attack, decay, sustain, release)
    # Piano has quick attack, medium decay
    attack_ms = 10
    decay_ms = 100
    release_ms = 200

    # Fade in (attack)
    note = note.fade_in(attack_ms)

    # Fade out (release)
    note = note.fade_out(release_ms)

    # Reduce volume of decay portion to simulate piano
    if duration_ms > decay_ms:
        sustain_reduction = -6  # Reduce sustain by 6dB
        note = note[:decay_ms] + (note[decay_ms:] + sustain_reduction)

    return note

def generate_piano_audio_files(output_dir='public/piano_audio'):
    """Generate all piano note audio files"""
    os.makedirs(output_dir, exist_ok=True)

    print(f"Generating {len(NOTE_FREQUENCIES)} piano notes...")

    for note_name, frequency in NOTE_FREQUENCIES.items():
        output_file = os.path.join(output_dir, f'{note_name}.mp3')

        print(f"  Generating {note_name} ({frequency:.2f} Hz)...")

        # Create the note
        note_audio = create_piano_note(frequency, duration_ms=800)

        # Export as MP3
        note_audio.export(output_file, format='mp3', bitrate='128k')

    print(f"✓ Generated {len(NOTE_FREQUENCIES)} piano notes in {output_dir}")

if __name__ == '__main__':
    generate_piano_audio_files()
