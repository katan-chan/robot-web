const cache = new Map();

function generateZigzag(size) {
  const entries = [];

  for (let row = 0; row < size; row++) {
    if (row % 2 === 0) {
      for (let col = 0; col < size; col++) {
        entries.push({ row, col });
      }
    } else {
      for (let col = size - 1; col >= 0; col--) {
        entries.push({ row, col });
      }
    }
  }

  return entries;
}

export function getZigzagIndices(size) {
  if (!cache.has(size)) {
    cache.set(size, generateZigzag(size));
  }
  return cache.get(size);
}

export function zigzagToMatrix(values, size) {
  const indices = getZigzagIndices(size);
  const matrix = Array.from({ length: size }, () => Array(size).fill(0));

  for (let i = 0; i < indices.length; i++) {
    const destRow = Math.floor(i / size);
    const destCol = i % size;
    const { row, col } = indices[i];
    matrix[destRow][destCol] = values[row][col];
  }

  return matrix;
}
