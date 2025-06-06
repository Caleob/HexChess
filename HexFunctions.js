function sizeCanvas(canvasElement) {
    if (!canvasElement) {
        console.error("sizeCanvas: Provided canvasElement is null or undefined.");
        return;
    }
    canvasElement.width = canvasElement.clientWidth;
    canvasElement.height = canvasElement.clientHeight;

    if (canvasElement.width === 0 || canvasElement.height === 0) {
        console.warn(`Canvas ${canvasElement.id || 'unnamed'} has zero dimension, skipping sizing.`);
        return;
    }
    const parentDiv = canvasElement.parentElement;
    const name = canvasElement.id || (parentDiv ? parentDiv.dataset.name : 'Unnamed Canvas');
    console.log(`Sized: ${name}, Dimensions: (${canvasElement.width.toFixed(2)}, ${canvasElement.height.toFixed(2)})`);
}

/**
 * Resizes all canvas elements in the document.
 */

function resizeAllCanvases() {
    document.querySelectorAll('canvas').forEach(canvas => {
        if (canvas.offsetParent !== null && canvas.clientWidth > 0 && canvas.clientHeight > 0) {
            sizeCanvas(canvas);
            // Draw the board on the board canvas element
            if (canvas.id === 'board-canvas') {
                drawBoard(canvas, boardState);
            }
            if (canvas.id === 'bench1-canvas') {
                drawBench(canvas, benchState1,.9, benchOrientation);
            }
            if (canvas.id === 'bench2-canvas') {
                drawBench(canvas, benchState2,.9, benchOrientation);
            }
        }
    });
}

/**
 * Updates the layout class on the grid container based on window aspect ratio
 * and then triggers a resize of all canvases.
 */

async function reDraw() {
    const container = document.getElementById('grid-container');
    if (!container) {
        console.error("Grid container not found.");
        return;
    }

    const aspectRatio = window.innerWidth / window.innerHeight;
    const threshold = 1.0;

    container.classList.remove('layout-tall', 'layout-wide');

    let newLayoutClass = '';
    if (aspectRatio < threshold) {
        newLayoutClass = 'layout-tall';
        benchOrientation = 'horizontal';
    } else {
        newLayoutClass = 'layout-wide';
        benchOrientation = 'vertical';
    }
    container.classList.add(newLayoutClass);
    console.log(`Applied layout: ${newLayoutClass} (Aspect Ratio: ${aspectRatio.toFixed(2)})`);

    return new Promise(resolve => {
    requestAnimationFrame(() => {
      const hexLocations = {
        board: [],
        bench1: [],
        bench2: [],
      };

      document.querySelectorAll('canvas').forEach(canvas => {
        if (canvas.offsetParent !== null && canvas.clientWidth > 0 && canvas.clientHeight > 0) {
          sizeCanvas(canvas);

          if (canvas.id === 'board-canvas') {
            hexLocations.board = drawBoard(canvas, boardState, 1.0, true);
          } else if (canvas.id === 'bench1-canvas') {
            hexLocations.bench1 = drawBench(canvas, benchState1, 0.9, benchOrientation, true);
          } else if (canvas.id === 'bench2-canvas') {
            hexLocations.bench2 = drawBench(canvas, benchState2, 0.9, benchOrientation, true);
          }
        }
      });

      resolve(hexLocations); // <--- This line is required
    });
  });
}


function hexagon(canvasElement, x, y, apothem, borderColor, fillColor, rotation = 0) {
    const ctx = canvasElement.getContext('2d');
    ctx.beginPath();

    const sideLength = (2 * apothem) / Math.sqrt(3);
    const radius = sideLength;

    for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i - rotation;
        const vertexX = x + radius * Math.cos(angle);
        const vertexY = y + radius * Math.sin(angle);
        if (i === 0) {
            ctx.moveTo(vertexX, vertexY);
        } else {
            ctx.lineTo(vertexX, vertexY);
        }
    }

    ctx.closePath();
    ctx.fillStyle = fillColor;
    ctx.fill();
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 4 * (apothem / 40); // Scale line width with apothem
    ctx.stroke();
}

function getColors(boardState, hexNumber) {
    switch(boardState[hexNumber]) {
        case 'P1':
            return ['rgb(23, 114, 69)', 'rgb(15, 75, 45)']; // dark green with darker green border
        case 'P2':
            return ['rgb(250, 250, 0)', 'rgb(150, 150, 100)']; // red with darker red border (note: comment says red, but color is yellow, I'll follow the color)
        case 'SF':
            return ['rgb(100, 180, 255)', 'rgb(60, 140, 215)']; // sky blue with darker blue border
        case 'IM':
            return ['rgb(25, 25, 25)', 'rgb(120, 120, 120)']; // yellow with darker yellow border (note: comment says yellow, but color is very dark, I'll follow the color)
        case 'CE':
            return ['rgb(75, 200, 80)', 'rgb(40, 160, 45)']; // green with darker green border
        case 'OO':
            return ['rgb(255, 255, 255)', 'rgb(100, 10, 100)']; // white with light gray border (note: comment says light gray, but color is purple, I'll follow the color)
        default:
            return ['rgb(0, 0, 0)', 'rgb(50, 50, 50)']; // black with dark gray border
    }
}

function drawBoard(canvasElement, state, scale = 1.0) {
    const ctx = canvasElement.getContext('2d');
    ctx.clearRect(0, 0, canvasElement.width, canvasElement.height);

    const canvasWidth = canvasElement.width;
    const canvasHeight = canvasElement.height;
    const rotation = Math.PI / 2;
    const rows = [4, 5, 6, 7, 6, 5, 4];

    const baseApothem = Math.min(canvasHeight / 13, canvasWidth / 14);
    const baseSideLength = (2 * baseApothem) / Math.sqrt(3);
    const baseHexHorizontalSpacing = 2 * baseApothem;
    const baseHexVerticalStagger = baseSideLength * 1.5;

    const maxRowLength = Math.max(...rows);
    const apothem = baseApothem * scale;
    const sideLength = (2 * apothem) / Math.sqrt(3);
    const hexHorizontalSpacing = 2 * apothem;
    const hexVerticalStagger = sideLength * 1.5;

    const actualBoardWidth = (maxRowLength - 1) * hexHorizontalSpacing + (2 * apothem);
    const actualBoardHeight = (rows.length - 1) * hexVerticalStagger + (2 * sideLength);

    const initialCenterX = canvasWidth / 2;
    const initialCenterY = canvasHeight / 2;

    let currentY = initialCenterY - (actualBoardHeight / 2) + apothem;
    const hexLocations = [];

    let hexNum = 0;
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
        const numHexagonsInRow = rows[rowIndex];
        const rowWidth = (numHexagonsInRow - 1) * hexHorizontalSpacing;
        let startX = initialCenterX - (rowWidth / 2);
        
        for (let i = 0; i < numHexagonsInRow; i++) {
            const hexX = startX + i * hexHorizontalSpacing;
            const hexY = currentY;

            const [fillColor, borderColor] = getColors(state, hexNum);
            hexagon(canvasElement, hexX, hexY, apothem * 0.9, borderColor, fillColor, rotation);

            hexLocations.push({ x: hexX, y: hexY, apothem, rotation });
            hexNum++;
        }
        currentY += hexVerticalStagger;
    }

    return hexLocations;
}


function drawBench(canvasElement, state, scale, orientation = 'horizontal') {
    const ctx = canvasElement.getContext('2d');
    ctx.clearRect(0, 0, canvasElement.width, canvasElement.height);

    const canvasWidth = canvasElement.width;
    const canvasHeight = canvasElement.height;

    let baseApothem, hexHorizontalSpacing, hexVerticalSpacing;
    if (orientation === 'horizontal') {
        baseApothem = Math.min(canvasHeight / 2.3, canvasWidth / 15);
        hexHorizontalSpacing = canvasWidth / 8;
    } else if (orientation === 'vertical') {
        baseApothem = Math.min(canvasWidth / 2, canvasHeight / 32);
        hexVerticalSpacing = canvasHeight / 8;
    } else {
        console.error("Invalid orientation specified for drawBench.");
        return [];
    }

    const apothem = baseApothem * scale;
    const sideLength = (2 * apothem) / Math.sqrt(3);
    const rotation = Math.PI / 2;
    const numHexagons = state.length;
    const hexLocations = [];

    let startX, startY;
    if (orientation === 'horizontal') {
        const totalWidth = (numHexagons - 1) * hexHorizontalSpacing + (2 * apothem);
        startX = (canvasWidth / 2) - (totalWidth / 2) + apothem;
        startY = canvasHeight / 2;

        for (let i = 0; i < numHexagons; i++) {
            const hexX = startX + i * hexHorizontalSpacing;
            const hexY = startY;
            const [fillColor, borderColor] = getColors(state, i);
            hexagon(canvasElement, hexX, hexY, apothem * 0.9, borderColor, fillColor, rotation);
            hexLocations.push({ x: hexX, y: hexY, apothem, rotation });
        }
    } else {
        const totalHeight = (numHexagons - 1) * hexVerticalSpacing + (2 * sideLength);
        startX = canvasWidth / 2;
        startY = (canvasHeight / 2) - (totalHeight / 2) + sideLength;

        for (let i = 0; i < numHexagons; i++) {
            const hexX = startX;
            const hexY = startY + i * hexVerticalSpacing;
            const [fillColor, borderColor] = getColors(state, i);
            hexagon(canvasElement, hexX, hexY, apothem * 0.9, borderColor, fillColor, rotation);
            hexLocations.push({ x: hexX, y: hexY, apothem, rotation });
        }
    }

    return hexLocations;
}

function drawHover(canvas, hex) {
    reDraw().then(() => {
        hexagon(
            canvas,
            hex.x,
            hex.y,
            hex.apothem * 0.95,
            'rgba(0, 0, 0, 0.25)', // border
            'rgba(0, 0, 0, 0.15)', // fill
            hex.rotation
        );
    });
}
