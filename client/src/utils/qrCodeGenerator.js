/**
 * Bộ mã hóa mã QR chuẩn ISO/IEC 18004 (Byte Mode, ECC Level L, Version 1–10)
 * Thuần JavaScript, không cần thư viện ngoài, hoạt động hoàn toàn offline
 * và quét trực tiếp bằng camera iPhone / Android.
 */

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);

(() => {
  let x = 1;
  for (let i = 0; i < 255; i += 1) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i += 1) {
    GF_EXP[i] = GF_EXP[i - 255];
  }
})();

const gfMul = (a, b) => (a === 0 || b === 0 ? 0 : GF_EXP[GF_LOG[a] + GF_LOG[b]]);

const rsGeneratorPoly = (degree) => {
  let poly = [1];
  for (let i = 0; i < degree; i += 1) {
    const next = new Array(poly.length + 1).fill(0);
    const factor = GF_EXP[i];
    for (let j = 0; j < poly.length; j += 1) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], factor);
    }
    poly = next;
  }
  return poly;
};

const rsComputeEc = (data, ecCount) => {
  const gen = rsGeneratorPoly(ecCount);
  const rem = new Uint8Array(ecCount);
  for (let i = 0; i < data.length; i += 1) {
    const factor = data[i] ^ rem[0];
    for (let j = 0; j < ecCount - 1; j += 1) {
      rem[j] = rem[j + 1];
    }
    rem[ecCount - 1] = 0;
    if (factor !== 0) {
      for (let j = 0; j < ecCount; j += 1) {
        rem[j] ^= gfMul(gen[j + 1], factor);
      }
    }
  }
  return Array.from(rem);
};

// [version, totalDataCodewords, ecPerBlock, [[blockCount, dataBytesPerBlock], ...]] - ECC Level L
const VERSION_SPECS_L = [
  null,
  [1, 19, 7, [[1, 19]]],
  [2, 34, 10, [[1, 34]]],
  [3, 55, 15, [[1, 55]]],
  [4, 80, 20, [[1, 80]]],
  [5, 108, 26, [[1, 108]]],
  [6, 136, 18, [[2, 68]]],
  [7, 156, 20, [[2, 78]]],
  [8, 194, 24, [[2, 97]]],
  [9, 232, 30, [[2, 116]]],
  [10, 274, 18, [[2, 68], [2, 69]]],
];

const ALIGNMENT_POSITIONS = [
  null,
  [],
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50],
];

const computeFormatBitsL = (maskPattern) => {
  // ECC Level L = 01 (binary)
  const data = (0b01 << 3) | (maskPattern & 0b111);
  let rem = data << 10;
  for (let bit = 14; bit >= 10; bit -= 1) {
    if ((rem >> bit) & 1) {
      rem ^= 0x537 << (bit - 10);
    }
  }
  return ((data << 10) | rem) ^ 0x5412;
};

const computeVersionBits = (version) => {
  let rem = version << 12;
  for (let bit = 17; bit >= 12; bit -= 1) {
    if ((rem >> bit) & 1) {
      rem ^= 0x1f25 << (bit - 12);
    }
  }
  return (version << 12) | rem;
};

const MASK_FNS = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (_r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

const encodeUtf8Bytes = (text) => {
  if (typeof TextEncoder !== 'undefined') {
    return Array.from(new TextEncoder().encode(text));
  }
  return Array.from(Buffer.from(text, 'utf8'));
};

const selectVersion = (byteLen) => {
  for (let v = 1; v <= 10; v += 1) {
    const totalData = VERSION_SPECS_L[v][1];
    const headerBits = 4 + (v <= 9 ? 8 : 16);
    const maxBytes = Math.floor((totalData * 8 - headerBits) / 8);
    if (byteLen <= maxBytes) return v;
  }
  throw new Error('Nội dung mã QR vượt quá dung lượng hỗ trợ (tối đa 271 byte).');
};

const buildCodewords = (bytes, version) => {
  const [, totalDataCodewords, ecPerBlock, groups] = VERSION_SPECS_L[version];
  const bits = [];
  const pushBits = (val, len) => {
    for (let i = len - 1; i >= 0; i -= 1) {
      bits.push((val >> i) & 1);
    }
  };

  // Byte mode (0100)
  pushBits(0b0100, 4);
  pushBits(bytes.length, version <= 9 ? 8 : 16);
  for (const b of bytes) pushBits(b, 8);

  const totalDataBits = totalDataCodewords * 8;
  const termLen = Math.min(4, totalDataBits - bits.length);
  pushBits(0, termLen);
  while (bits.length % 8 !== 0) bits.push(0);

  const dataBytes = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j += 1) byte = (byte << 1) | bits[i + j];
    dataBytes.push(byte);
  }

  let padToggle = 0;
  while (dataBytes.length < totalDataCodewords) {
    dataBytes.push(padToggle === 0 ? 0xec : 0x11);
    padToggle ^= 1;
  }

  // Chia block & tính Reed-Solomon EC cho từng block
  const dataBlocks = [];
  const ecBlocks = [];
  let offset = 0;
  for (const [count, size] of groups) {
    for (let b = 0; b < count; b += 1) {
      const slice = dataBytes.slice(offset, offset + size);
      offset += size;
      dataBlocks.push(slice);
      ecBlocks.push(rsComputeEc(slice, ecPerBlock));
    }
  }

  // Interleave data codewords rồi đến EC codewords
  const finalCodewords = [];
  const maxDataLen = Math.max(...dataBlocks.map((b) => b.length));
  for (let i = 0; i < maxDataLen; i += 1) {
    for (const blk of dataBlocks) {
      if (i < blk.length) finalCodewords.push(blk[i]);
    }
  }
  for (let i = 0; i < ecPerBlock; i += 1) {
    for (const blk of ecBlocks) {
      if (i < blk.length) finalCodewords.push(blk[i]);
    }
  }
  return finalCodewords;
};

const drawFunctionPatterns = (size, version) => {
  const modules = Array.from({ length: size }, () => new Uint8Array(size));
  const isFunc = Array.from({ length: size }, () => new Uint8Array(size));

  const setFunc = (r, c, dark) => {
    if (r >= 0 && r < size && c >= 0 && c < size) {
      modules[r][c] = dark ? 1 : 0;
      isFunc[r][c] = 1;
    }
  };

  const drawFinder = (topR, topC) => {
    for (let dr = -1; dr <= 7; dr += 1) {
      for (let dc = -1; dc <= 7; dc += 1) {
        const r = topR + dr;
        const c = topC + dc;
        if (r < 0 || r >= size || c < 0 || c >= size) continue;
        const isBorder = dr === -1 || dr === 7 || dc === -1 || dc === 7;
        const dist = Math.max(Math.abs(dr - 3), Math.abs(dc - 3));
        setFunc(r, c, !isBorder && dist !== 2);
      }
    }
  };

  drawFinder(0, 0);
  drawFinder(0, size - 7);
  drawFinder(size - 7, 0);

  // Timing patterns
  for (let i = 8; i < size - 8; i += 1) {
    setFunc(6, i, i % 2 === 0);
    setFunc(i, 6, i % 2 === 0);
  }

  // Alignment patterns
  const centers = ALIGNMENT_POSITIONS[version];
  for (const r of centers) {
    for (const c of centers) {
      if (isFunc[r][c]) continue;
      for (let dr = -2; dr <= 2; dr += 1) {
        for (let dc = -2; dc <= 2; dc += 1) {
          const dist = Math.max(Math.abs(dr), Math.abs(dc));
          setFunc(r + dr, c + dc, dist !== 1);
        }
      }
    }
  }

  // Dark module cố định
  setFunc(4 * version + 9, 8, true);

  // Reserve Format Info slots
  for (let i = 0; i <= 8; i += 1) {
    if (!isFunc[8][i]) setFunc(8, i, false);
    if (!isFunc[i][8]) setFunc(i, 8, false);
  }
  for (let i = size - 8; i < size; i += 1) {
    if (!isFunc[8][i]) setFunc(8, i, false);
    if (!isFunc[i][8]) setFunc(i, 8, false);
  }

  // Version Info (Version >= 7)
  if (version >= 7) {
    const vBits = computeVersionBits(version);
    for (let i = 0; i < 18; i += 1) {
      const bit = ((vBits >> i) & 1) === 1;
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      setFunc(a, b, bit);
      setFunc(b, a, bit);
    }
  }

  return { modules, isFunc };
};

const writeFormatInfo = (modules, size, maskPattern) => {
  const fmt = computeFormatBitsL(maskPattern);
  const bitAt = (idx) => ((fmt >> idx) & 1);

  // Copy 1 (quanh góc trên trái)
  for (let i = 0; i <= 5; i += 1) modules[8][i] = bitAt(14 - i);
  modules[8][7] = bitAt(8);
  modules[8][8] = bitAt(7);
  modules[7][8] = bitAt(6);
  for (let i = 0; i <= 5; i += 1) modules[5 - i][8] = bitAt(5 - i);

  // Copy 2 (dưới trái & trên phải)
  for (let i = 0; i <= 6; i += 1) modules[size - 1 - i][8] = bitAt(14 - i);
  for (let i = 0; i <= 7; i += 1) modules[8][size - 8 + i] = bitAt(7 - i);
};

const placeDataBits = (modules, isFunc, size, codewords) => {
  const bitStream = [];
  for (const cw of codewords) {
    for (let b = 7; b >= 0; b -= 1) bitStream.push((cw >> b) & 1);
  }

  let bitIdx = 0;
  let upward = true;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert += 1) {
      const r = upward ? size - 1 - vert : vert;
      for (let j = 0; j < 2; j += 1) {
        const c = right - j;
        if (!isFunc[r][c]) {
          modules[r][c] = bitIdx < bitStream.length ? bitStream[bitIdx] : 0;
          bitIdx += 1;
        }
      }
    }
    upward = !upward;
  }
};

const computePenalty = (modules, size) => {
  let penalty = 0;

  // Rule 1: chuỗi liên tiếp cùng màu >= 5
  for (let r = 0; r < size; r += 1) {
    let runColor = modules[r][0];
    let runLen = 1;
    for (let c = 1; c < size; c += 1) {
      if (modules[r][c] === runColor) {
        runLen += 1;
        if (runLen === 5) penalty += 3;
        else if (runLen > 5) penalty += 1;
      } else {
        runColor = modules[r][c];
        runLen = 1;
      }
    }
  }
  for (let c = 0; c < size; c += 1) {
    let runColor = modules[0][c];
    let runLen = 1;
    for (let r = 1; r < size; r += 1) {
      if (modules[r][c] === runColor) {
        runLen += 1;
        if (runLen === 5) penalty += 3;
        else if (runLen > 5) penalty += 1;
      } else {
        runColor = modules[r][c];
        runLen = 1;
      }
    }
  }

  // Rule 2: khối 2x2 đồng màu
  for (let r = 0; r < size - 1; r += 1) {
    for (let c = 0; c < size - 1; c += 1) {
      const v = modules[r][c];
      if (v === modules[r][c + 1] && v === modules[r + 1][c] && v === modules[r + 1][c + 1]) {
        penalty += 3;
      }
    }
  }

  // Rule 4: cân bằng tỷ lệ đen/trắng
  let darkCount = 0;
  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) darkCount += modules[r][c];
  }
  const total = size * size;
  const k = Math.floor(Math.abs(darkCount * 20 - total * 10) / total);
  penalty += k * 10;

  return penalty;
};

/**
 * Tạo ma trận QR (2D boolean array) từ chuỗi URL/text
 */
export const generateQrMatrix = (text) => {
  const bytes = encodeUtf8Bytes(String(text || ''));
  const version = selectVersion(bytes.length);
  const size = version * 4 + 17;
  const codewords = buildCodewords(bytes, version);

  const { modules: baseModules, isFunc } = drawFunctionPatterns(size, version);
  placeDataBits(baseModules, isFunc, size, codewords);

  let bestMask = 0;
  let bestScore = Infinity;
  let bestMatrix = null;

  for (let mask = 0; mask < 8; mask += 1) {
    const candidate = baseModules.map((row) => new Uint8Array(row));
    const maskFn = MASK_FNS[mask];
    for (let r = 0; r < size; r += 1) {
      for (let c = 0; c < size; c += 1) {
        if (!isFunc[r][c] && maskFn(r, c)) {
          candidate[r][c] ^= 1;
        }
      }
    }
    writeFormatInfo(candidate, size, mask);
    const score = computePenalty(candidate, size);
    if (score < bestScore) {
      bestScore = score;
      bestMask = mask;
      bestMatrix = candidate;
    }
  }

  return {
    version,
    size,
    mask: bestMask,
    matrix: bestMatrix.map((row) => Array.from(row, (v) => v === 1)),
  };
};

export default generateQrMatrix;
