// Minimal stand-in for the Web Speech API's SpeechRecognition.
//
// Nothing happens on its own: the browser fires onstart/onresult/onerror/onend
// asynchronously, so the test fires them explicitly with the fire*() helpers
// at the moment it wants to observe. start() throws when called on a running
// session, exactly like the real thing.
import { vi } from 'vitest';

export class FakeSpeechRecognition {
    static instances = [];
    static reset() { FakeSpeechRecognition.instances = []; }
    static last() {
        const list = FakeSpeechRecognition.instances;
        return list.length ? list[list.length - 1] : null;
    }

    constructor() {
        this.lang = '';
        this.continuous = false;
        this.interimResults = false;
        this.maxAlternatives = 1;
        this.onstart = null;
        this.onresult = null;
        this.onerror = null;
        this.onend = null;
        this.onspeechend = null;
        this.started = false;
        this.startCalls = 0;
        this.stopCalls = 0;
        this.abortCalls = 0;
        FakeSpeechRecognition.instances.push(this);
    }

    start() {
        if (this.started) {
            throw new Error("Failed to execute 'start' on 'SpeechRecognition': recognition has already started.");
        }
        this.started = true;
        this.startCalls++;
    }
    stop() { this.stopCalls++; this.started = false; }
    abort() { this.abortCalls++; this.started = false; }

    // --- test drivers -----------------------------------------------------
    fireStart() { if (this.onstart) this.onstart(); }
    fireSpeechEnd() { if (this.onspeechend) this.onspeechend(); }
    // `transcripts` are the alternatives of one result, best first.
    fireResult(transcripts, { isFinal = true } = {}) {
        const list = Array.isArray(transcripts) ? transcripts : [transcripts];
        const result = Object.assign(list.map(t => ({ transcript: t, confidence: 0.9 })), { isFinal });
        if (this.onresult) this.onresult({ results: [result], resultIndex: 0 });
    }
    fireError(error) { if (this.onerror) this.onerror({ error, message: '', type: 'error' }); }
    fireEnd() { this.started = false; if (this.onend) this.onend(); }
}

// Installs the fake on window and a getUserMedia spy that must stay unused:
// any getUserMedia call flips the iOS audio session into its attenuated
// play-and-record mode (the "iPad volume drop" bug).
export function installFakeSpeechRecognition() {
    FakeSpeechRecognition.reset();
    window.SpeechRecognition = FakeSpeechRecognition;
    const getUserMedia = vi.fn(async () => {
        throw new Error('getUserMedia must never be called by a speech mode');
    });
    navigator.mediaDevices = { getUserMedia };
    return { getUserMedia };
}

export function uninstallFakeSpeechRecognition() {
    delete window.SpeechRecognition;
    delete window.webkitSpeechRecognition;
    delete navigator.mediaDevices;
}
