#!/usr/bin/env python3
"""
Generate Swedish word audio files for the word spelling minigame
Requires: pip install gtts
"""

from gtts import gTTS
import os

# All words from speechVocabulary.js
WORDS = [
    # Easy
    'sol', 'katt', 'hund', 'bok', 'boll', 'hus', 'bil', 'båt',
    'öga', 'arm', 'ben', 'bi', 'ost', 'ko', 'mus',
    # Medium
    'äpple', 'blomma', 'träd', 'fågel', 'vatten', 'penna',
    'lejon', 'bröd', 'glass', 'måne',
    # Hard
    'elefant', 'giraff', 'present', 'drake', 'regnbåge',
    'kanin', 'tiger', 'tomat'
]

def generate_word_audio():
    """Generate MP3 audio files for all Swedish words"""

    # Create output directory if it doesn't exist
    output_dir = 'public/word_audio'
    os.makedirs(output_dir, exist_ok=True)

    print(f"Generating {len(WORDS)} Swedish word audio files...")

    for word in WORDS:
        output_path = os.path.join(output_dir, f'{word}.mp3')

        try:
            # Generate Swedish TTS audio
            tts = gTTS(text=word, lang='sv', slow=False)
            tts.save(output_path)
            print(f"✓ Generated: {word}.mp3")
        except Exception as e:
            print(f"✗ Failed to generate {word}.mp3: {e}")

    print(f"\nDone! Generated audio files in {output_dir}/")

if __name__ == '__main__':
    generate_word_audio()
