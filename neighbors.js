/**
 * Dynamically generates the adjacency list for a hexagonal grid.
 * The grid has rows of specified lengths.
 * @param {number[]} rowLengths - An array with the number of hexes in each row.
 * @returns {Object[]} An array of adjacency objects for each hex.
 */
function generateAdjacency(rowLengths) {
  const numRows = rowLengths.length;
  const hexCount = rowLengths.reduce((a, b) => a + b, 0);

  // Calculate starting index of each row
  const rowStarts = [0];
  for (let i = 0; i < numRows - 1; i++) {
    rowStarts.push(rowStarts[i] + rowLengths[i]);
  }

  // Helper to get row and column from hex index
  function getHexInfo(hexIndex) {
    if (hexIndex < 0 || hexIndex >= hexCount) {
      return null;
    }
    for (let r = 0; r < numRows; r++) {
      if (hexIndex < rowStarts[r] + rowLengths[r]) {
        return { row: r, col: hexIndex - rowStarts[r] };
      }
    }
    return null;
  }

  // Helper to get hex index from row and column, returns null if out of bounds
  function getHexIndex(r, c) {
    if (r < 0 || r >= numRows || c < 0 || c >= rowLengths[r]) {
      return null;
    }
    return rowStarts[r] + c;
  }

  const adjacency = [];

  for (let i = 0; i < hexCount; i++) {
    const info = getHexInfo(i);
    if (!info) continue;

    const { row, col } = info;
    const neighbors = {};

    // Left and Right neighbors
    neighbors.left = getHexIndex(row, col - 1);
    neighbors.right = getHexIndex(row, col + 1);

    // Upper neighbors
    if (row > 0) {
      const isContracting = rowLengths[row] < rowLengths[row - 1];
      if (isContracting) {
        neighbors.upperLeft = getHexIndex(row - 1, col);
        neighbors.upperRight = getHexIndex(row - 1, col + 1);
      } else {
        neighbors.upperLeft = getHexIndex(row - 1, col - 1);
        neighbors.upperRight = getHexIndex(row - 1, col);
      }
    } else {
      neighbors.upperLeft = null;
      neighbors.upperRight = null;
    }

    // Lower neighbors
    if (row < numRows - 1) {
      const isExpanding = rowLengths[row + 1] > rowLengths[row];
      if (isExpanding) {
        neighbors.lowerLeft = getHexIndex(row + 1, col);
        neighbors.lowerRight = getHexIndex(row + 1, col + 1);
      } else {
        neighbors.lowerLeft = getHexIndex(row + 1, col - 1);
        neighbors.lowerRight = getHexIndex(row + 1, col);
      }
    } else {
      neighbors.lowerLeft = null;
      neighbors.lowerRight = null;
    }

    adjacency.push(neighbors);
  }

  return adjacency;
}

// Configuration for the HexChess board
const rowLengths = [4, 5, 6, 7, 6, 5, 4];
const adjacency = generateAdjacency(rowLengths);

// --- Testing ---
console.log("Adjacency for Hex 7:");
console.log(adjacency[7]);

console.log("Adjacency for Hex 20:");
console.log(adjacency[20]);

console.log("Adjacency for Hex 36:");
console.log(adjacency[36]);

console.log("Adjacency for Hex 9:");
console.log(adjacency[9]);
