const fs = require('fs');
const path = require('path');

// Generates a valid PCM RIFF WAV audio file (sine chord tone)
function generateWavFile(outputPath, sampleRate, bitDepth, durationSeconds, frequency) {
  const numChannels = 2;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const numSamples = Math.floor(sampleRate * durationSeconds);
  const dataSize = numSamples * blockAlign;

  const header = Buffer.alloc(44);
  // RIFF chunk descriptor
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);

  // "fmt " sub-chunk
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
  header.writeUInt16LE(1, 20); // AudioFormat (1 = PCM)
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitDepth, 34);

  // "data" sub-chunk
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);

  // Generate PCM harmonic samples (soothing chord)
  const data = Buffer.alloc(dataSize);
  let offset = 0;

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    // Envelope for gentle attack and release
    const env = Math.sin((Math.PI * i) / numSamples);
    // Chord (root + minor 3rd + 5th harmonic)
    const wave =
      0.5 * Math.sin(2 * Math.PI * frequency * t) +
      0.3 * Math.sin(2 * Math.PI * frequency * 1.25 * t) +
      0.2 * Math.sin(2 * Math.PI * frequency * 1.5 * t);

    const val = wave * env;

    if (bitDepth === 16) {
      const sampleVal = Math.max(-32768, Math.min(32767, Math.floor(val * 32767)));
      // Left channel
      data.writeInt16LE(sampleVal, offset);
      // Right channel
      data.writeInt16LE(sampleVal, offset + 2);
      offset += 4;
    } else if (bitDepth === 24) {
      const sampleVal = Math.max(-8388608, Math.min(8388607, Math.floor(val * 8388607)));
      // 24-bit 3 bytes per channel (little endian)
      const b0 = sampleVal & 0xff;
      const b1 = (sampleVal >> 8) & 0xff;
      const b2 = (sampleVal >> 16) & 0xff;

      // Left
      data.writeUInt8(b0, offset);
      data.writeUInt8(b1, offset + 1);
      data.writeUInt8(b2, offset + 2);
      // Right
      data.writeUInt8(b0, offset + 3);
      data.writeUInt8(b1, offset + 4);
      data.writeUInt8(b2, offset + 5);
      offset += 6;
    }
  }

  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(outputPath, Buffer.concat([header, data]));
  console.log(`Generated: ${outputPath} (${bitDepth}-bit, ${sampleRate}Hz, ${(dataSize / 1024).toFixed(1)} KB)`);
}

const storageDir = path.join(__dirname, '..', 'storage', 'audio');
generateWavFile(path.join(storageDir, 'sample-hires-96k-24b.wav'), 96000, 24, 8, 440);
generateWavFile(path.join(storageDir, 'sample-lossless-44k-16b.wav'), 44100, 16, 10, 523.25);
