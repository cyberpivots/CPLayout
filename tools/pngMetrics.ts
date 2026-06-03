import { deflateSync, inflateSync } from "node:zlib";

export interface PngPixelMetrics {
  width: number;
  height: number;
  sampleCount: number;
  nonBlankPixelRatio: number;
  grayMean: number;
  grayVariance: number;
  minGray: number;
  maxGray: number;
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
const CRC_TABLE = makeCrcTable();

export function analyzePngPixels(data: Uint8Array): PngPixelMetrics {
  const buffer = Buffer.from(data);
  if (buffer.length < 33 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error("PNG data must start with the PNG signature.");
  }

  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idatChunks: Buffer[] = [];
  for (const chunk of readChunks(buffer)) {
    if (chunk.type === "IHDR") {
      width = chunk.data.readUInt32BE(0);
      height = chunk.data.readUInt32BE(4);
      bitDepth = chunk.data.readUInt8(8);
      colorType = chunk.data.readUInt8(9);
      if (chunk.data.readUInt8(10) !== 0 || chunk.data.readUInt8(11) !== 0 || chunk.data.readUInt8(12) !== 0) {
        throw new Error("PNG compression, filter, and interlace methods must be the baseline values.");
      }
    } else if (chunk.type === "IDAT") {
      idatChunks.push(chunk.data);
    }
  }

  if (width <= 0 || height <= 0) throw new Error("PNG IHDR must define positive dimensions.");
  if (bitDepth !== 8) throw new Error(`Only 8-bit PNG images are supported for proof metrics, not bitDepth ${bitDepth}.`);
  const bytesPerPixel = bytesPerPixelForColorType(colorType);
  const inflated = inflateSync(Buffer.concat(idatChunks));
  const rowBytes = width * bytesPerPixel;
  const expectedLength = (rowBytes + 1) * height;
  if (inflated.length < expectedLength) {
    throw new Error(`PNG IDAT payload is too short for ${width}x${height} image data.`);
  }

  const rows = new Uint8Array(rowBytes * height);
  let sourceOffset = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[sourceOffset];
    sourceOffset += 1;
    const rowOffset = y * rowBytes;
    for (let x = 0; x < rowBytes; x += 1) {
      const raw = inflated[sourceOffset + x];
      const left = x >= bytesPerPixel ? rows[rowOffset + x - bytesPerPixel] : 0;
      const up = y > 0 ? rows[rowOffset + x - rowBytes] : 0;
      const upperLeft = y > 0 && x >= bytesPerPixel ? rows[rowOffset + x - rowBytes - bytesPerPixel] : 0;
      rows[rowOffset + x] = unfilterByte(filter, raw, left, up, upperLeft);
    }
    sourceOffset += rowBytes;
  }

  let nonBlank = 0;
  let graySum = 0;
  let graySumSquared = 0;
  let minGray = Number.POSITIVE_INFINITY;
  let maxGray = Number.NEGATIVE_INFINITY;
  const sampleCount = width * height;
  for (let pixel = 0; pixel < sampleCount; pixel += 1) {
    const offset = pixel * bytesPerPixel;
    const r = colorType === 0 ? rows[offset] : rows[offset];
    const g = colorType === 0 ? rows[offset] : rows[offset + 1];
    const b = colorType === 0 ? rows[offset] : rows[offset + 2];
    const gray = Math.round((r + g + b) / 3);
    if (gray > 4) nonBlank += 1;
    graySum += gray;
    graySumSquared += gray * gray;
    minGray = Math.min(minGray, gray);
    maxGray = Math.max(maxGray, gray);
  }
  const grayMean = graySum / sampleCount;
  return {
    width,
    height,
    sampleCount,
    nonBlankPixelRatio: nonBlank / sampleCount,
    grayMean,
    grayVariance: graySumSquared / sampleCount - grayMean * grayMean,
    minGray,
    maxGray,
  };
}

export function createNativeMapLibreProofTilePng(width = 256, height = 256): Uint8Array {
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const diagonal = Math.abs(x - y) < 5 || Math.abs(x + y - width) < 5;
      const grid = x % 32 < 2 || y % 32 < 2;
      rgba[offset] = diagonal ? 240 : grid ? 212 : 32 + ((x * 7) % 80);
      rgba[offset + 1] = diagonal ? 196 : grid ? 224 : 84 + ((y * 5) % 120);
      rgba[offset + 2] = diagonal ? 54 : grid ? 118 : 104 + (((x + y) * 3) % 90);
      rgba[offset + 3] = 255;
    }
  }
  return encodeRgbaPng(width, height, rgba);
}

export function encodeRgbaPng(width: number, height: number, rgba: Uint8Array): Uint8Array {
  if (rgba.length !== width * height * 4) throw new Error("RGBA payload length does not match PNG dimensions.");
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (width * 4 + 1);
    raw[rowStart] = 0;
    Buffer.from(rgba.subarray(y * width * 4, (y + 1) * width * 4)).copy(raw, rowStart + 1);
  }
  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk("IHDR", ihdr(width, height)),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function* readChunks(buffer: Buffer): Generator<{ type: string; data: Buffer }> {
  let offset = 8;
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    yield { type, data };
    offset += 12 + length;
    if (type === "IEND") return;
  }
}

function bytesPerPixelForColorType(colorType: number): number {
  if (colorType === 0) return 1;
  if (colorType === 2) return 3;
  if (colorType === 6) return 4;
  throw new Error(`Unsupported PNG color type for proof metrics: ${colorType}.`);
}

function unfilterByte(filter: number, raw: number, left: number, up: number, upperLeft: number): number {
  if (filter === 0) return raw;
  if (filter === 1) return (raw + left) & 0xff;
  if (filter === 2) return (raw + up) & 0xff;
  if (filter === 3) return (raw + Math.floor((left + up) / 2)) & 0xff;
  if (filter === 4) return (raw + paeth(left, up, upperLeft)) & 0xff;
  throw new Error(`Unsupported PNG filter type: ${filter}.`);
}

function paeth(left: number, up: number, upperLeft: number): number {
  const p = left + up - upperLeft;
  const pa = Math.abs(p - left);
  const pb = Math.abs(p - up);
  const pc = Math.abs(p - upperLeft);
  if (pa <= pb && pa <= pc) return left;
  return pb <= pc ? up : upperLeft;
}

function ihdr(width: number, height: number): Buffer {
  const data = Buffer.alloc(13);
  data.writeUInt32BE(width, 0);
  data.writeUInt32BE(height, 4);
  data.writeUInt8(8, 8);
  data.writeUInt8(6, 9);
  data.writeUInt8(0, 10);
  data.writeUInt8(0, 11);
  data.writeUInt8(0, 12);
  return data;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBuffer = Buffer.from(type, "ascii");
  const output = Buffer.alloc(12 + data.length);
  output.writeUInt32BE(data.length, 0);
  typeBuffer.copy(output, 4);
  data.copy(output, 8);
  output.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 8 + data.length);
  return output;
}

function makeCrcTable(): number[] {
  const table: number[] = [];
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
}

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
