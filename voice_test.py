import asyncio
import edge_tts

texts = [
    ("Hello world", "en-US-GuyNeural", "en_01.mp3"),
    ("How are you?", "en-US-AriaNeural", "en_02.mp3"),
    ("Välkommen hit", "sv-SE-MattiasNeural", "sv_01.mp3"),
    ("God morgon", "sv-SE-SofieNeural", "sv_02.mp3"),
]

async def generate(text, voice, filename):
    tts = edge_tts.Communicate(text, voice)
    await tts.save(filename)
    print(f"Saved {filename}")

async def main():
    await asyncio.gather(*[generate(t, v, f) for t, v, f in texts])

asyncio.run(main())
