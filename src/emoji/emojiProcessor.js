import config from '@/config.js';
import { zigzagToMatrix } from '@/utils/zigzag.js';

const DEFAULT_SIZE = 16;
const COLOR_QUANTIZATION_STEP = 32;
const MAX_PALETTE_SIZE = 12;
const emojiManifest = import.meta.glob('../../all_emoji/**/*.png', {
  as: 'url',
  eager: true
});

const manifestEntries = Object.entries(emojiManifest).map(([path, url]) => {
  const fileName = path.split('/').pop() || '';
  const name = ensureName(fileName);
  return {
    name,
    label: name,
    url
  };
});

function ensureName(name) {
  if (!name) {
    throw new Error('Tên emoji không hợp lệ');
  }
  return name.replace(/\.png$/i, '');
}

function getEmojiUrl(name) {
  const cleanName = ensureName(name);
  // Sử dụng URL tương đối từ public dir của Vite
  // Vite serve từ publicDir: 'all_emoji'
  return `/all_emoji/${cleanName}.png`;
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Không thể tải emoji: ${url}`));
    image.src = url;
  });
}

function quantizeValue(value, step = COLOR_QUANTIZATION_STEP) {
  const quantized = Math.round(value / step) * step;
  return Math.min(255, Math.max(0, quantized));
}

function quantizeChannel(channel, step = COLOR_QUANTIZATION_STEP) {
  return channel.map((row) => row.map((value) => quantizeValue(value, step)));
}

function buildPalette(matrices, maxSize = MAX_PALETTE_SIZE) {
  const counts = new Map();
  const size = matrices.r.length;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const key = `${matrices.r[y][x]},${matrices.g[y][x]},${matrices.b[y][x]}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, Math.max(1, maxSize))
    .map(([key]) => key.split(',').map((value) => Number.parseInt(value, 10)));
}

function findNearestColor(color, palette) {
  let best = palette[0];
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let i = 0; i < palette.length; i++) {
    const candidate = palette[i];
    const distance =
      (color[0] - candidate[0]) ** 2 +
      (color[1] - candidate[1]) ** 2 +
      (color[2] - candidate[2]) ** 2;

    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }

  return best;
}

function applyPalette(matrices, palette) {
  const size = matrices.r.length;
  const result = {
    r: Array.from({ length: size }, () => Array(size).fill(0)),
    g: Array.from({ length: size }, () => Array(size).fill(0)),
    b: Array.from({ length: size }, () => Array(size).fill(0))
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nearest = findNearestColor(
        [matrices.r[y][x], matrices.g[y][x], matrices.b[y][x]],
        palette
      );
      result.r[y][x] = nearest[0];
      result.g[y][x] = nearest[1];
      result.b[y][x] = nearest[2];
    }
  }

  return result;
}

function toChannelMatrices(image, size = DEFAULT_SIZE) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, size, size);
  ctx.drawImage(image, 0, 0, size, size);

  const imageData = ctx.getImageData(0, 0, size, size);
  const { data } = imageData;
  const r = Array.from({ length: size }, () => Array(size).fill(0));
  const g = Array.from({ length: size }, () => Array(size).fill(0));
  const b = Array.from({ length: size }, () => Array(size).fill(0));

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const index = (y * size + x) * 4;
      r[y][x] = data[index];
      g[y][x] = data[index + 1];
      b[y][x] = data[index + 2];
    }
  }

  return { r, g, b };
}

function applyZigzag({ r, g, b }, size = DEFAULT_SIZE) {
  const matrices = {
    r: zigzagToMatrix(r, size),
    g: zigzagToMatrix(g, size),
    b: zigzagToMatrix(b, size)
  };

  const quantized = {
    r: quantizeChannel(matrices.r),
    g: quantizeChannel(matrices.g),
    b: quantizeChannel(matrices.b)
  };

  const palette = buildPalette(quantized);
  return applyPalette(quantized, palette);
}

function buildColorMatrix(matrix) {
  const size = matrix.r.length;
  const color = Array.from({ length: size }, () => Array(size).fill('#000000'));

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const r = matrix.r[y][x];
      const g = matrix.g[y][x];
      const b = matrix.b[y][x];
      color[y][x] = `rgb(${r}, ${g}, ${b})`;
    }
  }
  return color;
}

export async function loadEmojiByName(name, size = DEFAULT_SIZE) {
  const cleanName = ensureName(name);
  const url = getEmojiUrl(cleanName);
  const image = await loadImage(url);
  const baseChannels = toChannelMatrices(image, size);
  const matrix = applyZigzag(baseChannels, size);
  const colors = buildColorMatrix(matrix);

  return {
    name: cleanName,
    url,
    matrix,
    colors
  };
}

export function listPredefinedEmojis() {
  const configured = (config.emoji.predefined || []).map((item) => {
    if (typeof item === 'string') {
      const name = ensureName(item);
      return {
        name,
        label: name,
        url: getEmojiUrl(name)
      };
    }

    return {
      name: ensureName(item.name || item.label || ''),
      label: item.label || item.name || item,
      url: item.url || getEmojiUrl(item.name || item.label || '')
    };
  });

  if (configured.length) {
    return configured;
  }

  return manifestEntries;
}

export function buildMatrixPayload(matrix) {
  return {
    r: matrix.r,
    g: matrix.g,
    b: matrix.b
  };
}

export function createColorMatrix(matrix) {
  return buildColorMatrix(matrix);
}

export function getEmojiUrlByName(name) {
  return getEmojiUrl(name);
}
