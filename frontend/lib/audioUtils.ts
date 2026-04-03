/**
 * Audio-Preprocessing für Whisper-Transkription.
 * - WebRTC-Filter: Noise Suppression, Echo Cancellation, Auto Gain Control
 * - Konvertierung zu 16kHz Mono WAV (Whispers natives Format)
 */

/** getUserMedia-Constraints mit aktivierten WebRTC-Filtern */
export const AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  channelCount: { ideal: 1 },       // Mono reduziert Dateigrösse und Verarbeitungszeit
  sampleRate: { ideal: 16000 },     // Hint — Browser können abweichen, wird nachher resamplet
};

/**
 * Konvertiert einen Audio-Blob (webm, mp4, ogg, ...) zu 16kHz Mono WAV.
 * Whisper erwartet intern 16kHz/16bit/Mono — dieses Format überspringt
 * die Konvertierung im Backend und verbessert die Erkennungsqualität.
 */
export async function convertToWav(blob: Blob): Promise<Blob> {
  const arrayBuffer = await blob.arrayBuffer();

  // Decode mit nativer Sample-Rate des Browsers
  const decodeCtx = new AudioContext();
  let decoded: AudioBuffer;
  try {
    decoded = await decodeCtx.decodeAudioData(arrayBuffer);
  } finally {
    await decodeCtx.close();
  }

  // Resample auf 16kHz, Mix auf Mono
  const TARGET_RATE = 16000;
  const numFrames = Math.ceil(decoded.duration * TARGET_RATE);
  const offlineCtx = new OfflineAudioContext(1, numFrames, TARGET_RATE);

  const source = offlineCtx.createBufferSource();
  source.buffer = decoded;

  // Wenn Stereo: ChannelMerger auf Mono mixen
  if (decoded.numberOfChannels > 1) {
    const merger = offlineCtx.createChannelMerger(1);
    source.connect(merger);
    merger.connect(offlineCtx.destination);
  } else {
    source.connect(offlineCtx.destination);
  }

  source.start(0);
  const resampled = await offlineCtx.startRendering();
  const pcm = resampled.getChannelData(0);

  return encodeWav(pcm, TARGET_RATE);
}

/** Kodiert Float32-PCM-Daten als 16-bit WAV-Blob */
function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  // Float32 → Int16 PCM
  const int16 = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    int16[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
  }

  const dataLen = int16.byteLength;
  const buf = new ArrayBuffer(44 + dataLen);
  const view = new DataView(buf);

  const str = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };

  // RIFF-Header
  str(0,  "RIFF");
  view.setUint32(4,  36 + dataLen, true);   // Chunk-Grösse
  str(8,  "WAVE");
  str(12, "fmt ");
  view.setUint32(16, 16, true);             // Sub-Chunk-Grösse (PCM = 16)
  view.setUint16(20, 1,  true);             // Audio-Format (1 = PCM)
  view.setUint16(22, 1,  true);             // Kanäle (Mono)
  view.setUint32(24, sampleRate, true);     // Sample-Rate
  view.setUint32(28, sampleRate * 2, true); // Byte-Rate (rate * channels * bits/8)
  view.setUint16(32, 2,  true);             // Block-Align (channels * bits/8)
  view.setUint16(34, 16, true);             // Bits per Sample
  str(36, "data");
  view.setUint32(40, dataLen, true);

  new Uint8Array(buf, 44).set(new Uint8Array(int16.buffer));

  return new Blob([buf], { type: "audio/wav" });
}
