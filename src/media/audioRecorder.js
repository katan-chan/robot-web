export class AudioRecorder {
  constructor({ onStart, onStop, onError } = {}) {
    this.mediaRecorder = null;
    this.chunks = [];
    this.stream = null;
    this.onStart = onStart;
    this.onStop = onStop;
    this.onError = onError;
  }

  async start() {
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      return;
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.mediaRecorder = new MediaRecorder(this.stream, {
        mimeType: 'audio/webm;codecs=opus'
      });
      this.chunks = [];

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.chunks.push(event.data);
        }
      };

      this.mediaRecorder.onstop = async () => {
        const blob = await this.exportWav();
        this.onStop?.(blob);
        this.cleanupStream();
      };

      this.mediaRecorder.start();
      this.onStart?.();
    } catch (error) {
      this.onError?.(error);
    }
  }

  stop() {
    if (!this.mediaRecorder || this.mediaRecorder.state !== 'recording') {
      return;
    }

    this.mediaRecorder.stop();
  }

  abort() {
    if (!this.mediaRecorder) {
      return;
    }

    this.mediaRecorder.onstop = null;
    this.mediaRecorder.stop();
    this.cleanupStream();
    this.chunks = [];
  }

  cleanupStream() {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
  }

  async exportWav() {
    if (!this.chunks.length) {
      return null;
    }

    const blob = new Blob(this.chunks);
    const objectUrl = window.URL.createObjectURL(blob);
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();

    try {
      const response = await fetch(objectUrl);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

      const wavBuffer = encodeWav(audioBuffer);
      return new Blob([wavBuffer], { type: 'audio/wav' });
    } finally {
      window.URL.revokeObjectURL(objectUrl);
      audioContext.close();
    }

    return null;
  }
}

function encodeWav(audioBuffer) {
  const numChannels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const channelData = [];

  let totalLength = audioBuffer.length * numChannels;
  for (let i = 0; i < numChannels; i++) {
    channelData.push(audioBuffer.getChannelData(i));
  }

  const interleaved = new Float32Array(totalLength);
  for (let sample = 0; sample < audioBuffer.length; sample++) {
    for (let channel = 0; channel < numChannels; channel++) {
      interleaved[sample * numChannels + channel] = channelData[channel][sample];
    }
  }

  return encodeWavFromInterleaved(interleaved, sampleRate, numChannels);
}

function encodeWavFromInterleaved(samples, sampleRate, numChannels) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // Subchunk1Size (PCM)
  view.setUint16(20, 1, true); // AudioFormat (PCM)
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * 2, true); // ByteRate
  view.setUint16(32, numChannels * 2, true); // BlockAlign
  view.setUint16(34, 16, true); // BitsPerSample
  writeString(view, 36, 'data');
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const sample = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }

  return buffer;
}

function writeString(view, offset, string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}
