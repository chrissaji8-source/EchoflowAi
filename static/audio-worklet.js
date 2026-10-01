"use strict";

class EchoFlowPcmCapture extends AudioWorkletProcessor {
    constructor() {
        super();
        this.targetRate = 16000;
        this.frameSize = 480;
        this.frame = new Float32Array(this.frameSize);
        this.frameOffset = 0;
        this.sourcePosition = 0;
    }

    process(inputs, outputs) {
        const input = inputs[0];
        const output = outputs[0];
        if (output) {
            for (const channel of output) channel.fill(0);
        }
        if (!input || !input.length || !input[0].length) return true;

        const sampleCount = input[0].length;
        const channelCount = input.length;
        const ratio = sampleRate / this.targetRate;
        while (this.sourcePosition < sampleCount) {
            const index = Math.floor(this.sourcePosition);
            const nextIndex = Math.min(index + 1, sampleCount - 1);
            const mix = this.sourcePosition - index;
            let sample = 0;
            for (let channel = 0; channel < channelCount; channel += 1) {
                const data = input[channel];
                sample += data[index] + (data[nextIndex] - data[index]) * mix;
            }
            this.frame[this.frameOffset] = sample / channelCount;
            this.frameOffset += 1;
            this.sourcePosition += ratio;

            if (this.frameOffset === this.frameSize) {
                const pcm = new Int16Array(this.frameSize);
                for (let i = 0; i < this.frameSize; i += 1) {
                    const clipped = Math.max(-1, Math.min(1, this.frame[i]));
                    pcm[i] = clipped < 0 ? clipped * 32768 : clipped * 32767;
                }
                this.port.postMessage(pcm.buffer, [pcm.buffer]);
                this.frameOffset = 0;
            }
        }
        this.sourcePosition -= sampleCount;
        return true;
    }
}

registerProcessor("echoflow-pcm-capture", EchoFlowPcmCapture);
