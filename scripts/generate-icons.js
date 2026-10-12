const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// Creates a valid uncompressed PNG file using Node.js built-in zlib
function createGradientPNG(width, height, outputPath) {
  // PNG Signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData.writeUInt8(8, 8); // bit depth 8
  ihdrData.writeUInt8(6, 9); // RGBA color type
  ihdrData.writeUInt8(0, 10); // compression method 0
  ihdrData.writeUInt8(0, 11); // filter method 0
  ihdrData.writeUInt8(0, 12); // interlace method 0

  const ihdrChunk = makeChunk('IHDR', ihdrData);

  // Raw image data: filter byte (0) + width * 4 bytes per scanline
  const scanlineLength = 1 + width * 4;
  const rawData = Buffer.alloc(height * scanlineLength);

  const centerX = width / 2;
  const centerY = height / 2;
  const radius = width * 0.45;

  for (let y = 0; y < height; y++) {
    const rowOffset = y * scanlineLength;
    rawData[rowOffset] = 0; // Filter byte 0 (None)

    for (let x = 0; x < width; x++) {
      const pxOffset = rowOffset + 1 + x * 4;
      const dx = x - centerX;
      const dy = y - centerY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Deep dark violet base (#09090b to #1c1c24)
      const grad = y / height;
      let r = Math.floor(15 + grad * 20);
      let g = Math.floor(10 + grad * 15);
      let b = Math.floor(25 + grad * 40);
      let a = 255;

      // Inner glowing icon circle
      if (dist < radius) {
        const factor = (radius - dist) / radius;
        // Electric Violet accent: #7c3aed
        r = Math.floor(r + 110 * factor);
        g = Math.floor(g + 50 * factor);
        b = Math.floor(b + 220 * factor);

        // Center music note / wave emblem representation
        const noteDist = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2);
        if (noteDist < radius * 0.35) {
          r = 245;
          g = 240;
          b = 255;
        }
      }

      rawData[pxOffset] = Math.min(255, r);
      rawData[pxOffset + 1] = Math.min(255, g);
      rawData[pxOffset + 2] = Math.min(255, b);
      rawData[pxOffset + 3] = a;
    }
  }

  const compressedData = zlib.deflateSync(rawData);
  const idatChunk = makeChunk('IDAT', compressedData);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  const pngBuffer = Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
  fs.writeFileSync(outputPath, pngBuffer);
}

function makeChunk(type, data) {
  const length = data.length;
  const chunk = Buffer.alloc(12 + length);
  chunk.writeUInt32BE(length, 0);
  chunk.write(type, 4, 4, 'ascii');
  data.copy(chunk, 8);

  const crc = crc32(chunk.slice(4, 8 + length));
  chunk.writeUInt32BE(crc, 8 + length);
  return chunk;
}

// Standard PNG CRC32 table
const crcTable = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[n] = c;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

const dir = path.join(__dirname, '..', 'public', 'icons');
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

createGradientPNG(192, 192, path.join(dir, 'icon-192x192.png'));
createGradientPNG(512, 512, path.join(dir, 'icon-512x512.png'));
createGradientPNG(180, 180, path.join(dir, 'apple-touch-icon.png'));
createGradientPNG(300, 300, path.join(dir, 'default-artwork.png'));

console.log('Successfully generated PWA icons.');
