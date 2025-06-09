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

function reDraw() {
    const container = document.getElementById('grid-container');
    if (!container) {
        console.error("Grid container not found.");
        return;
    }

    const aspectRatio = window.innerWidth / window.innerHeight;
    const threshold = 1.0; // If width < height (aspect < 1.0), it's "tall"

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

    // Use requestAnimationFrame to ensure sizing happens after layout is applied
    requestAnimationFrame(resizeAllCanvases);
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

    const rotation = Math.PI / 2; // Standard rotation for flat-top hexagons
    const rows = [4, 5, 6, 7, 6, 5, 4]; // Number of hexagons in each row

    // Calculate base dimensions for scaling, ensuring responsiveness
    // apothem is the distance from the center to the midpoint of a side
    const baseApothem = Math.min(canvasHeight / 13, canvasWidth / 14);
    const baseSideLength = (2 * baseApothem) / Math.sqrt(3); // side length of the hexagon
    const baseHexHorizontalSpacing = 2 * baseApothem; // Distance between centers of adjacent hexagons in a row
    const baseHexVerticalStagger = baseSideLength * 1.5; // Vertical distance between centers of hexagons in staggered rows

    // Apply the calculated scale to the apothem and spacing
    const apothem = baseApothem * scale;
    const sideLength = (2 * apothem) / Math.sqrt(3);
    const hexHorizontalSpacing = 2 * apothem;
    const hexVerticalStagger = sideLength * 1.5;

    // Calculate max theoretical width and height of the board layout for centering
    const maxRowLength = Math.max(...rows);
    // The actual width is determined by the widest row's hexagons
    const actualBoardWidth = (maxRowLength - 1) * hexHorizontalSpacing + (2 * apothem);
    // The actual height is determined by the total vertical stagger plus top/bottom hexagon height
    const actualBoardHeight = (rows.length - 1) * hexVerticalStagger + (2 * sideLength);


    // Calculate initial X and Y to center the entire arrangement on the canvas
    const initialCenterX = canvasWidth / 2;
    const initialCenterY = canvasHeight / 2;

    // The starting Y position for the first row, accounting for centering
    // We subtract half the board height and add apothem to position the center of the first row's hexagons correctly
    let currentY = initialCenterY - (actualBoardHeight / 2) + apothem;

    const hexLocations = []; // Array to store the x, y coordinates and hex number

    let hexNum = 0; // Counter for hexagon index
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
        const numHexagonsInRow = rows[rowIndex];

        // Calculate the start X for the current row to center it horizontally.
        const rowWidth = (numHexagonsInRow - 1) * hexHorizontalSpacing;
        let startX = initialCenterX - (rowWidth / 2);

        for (let i = 0; i < numHexagonsInRow; i++) {
            const hexX = startX + i * hexHorizontalSpacing;
            const hexY = currentY;

            // Store the location and index
            hexLocations.push({ x: hexX, y: hexY, hexNum: hexNum });
            hexNum++;
        }
        // Move to the next row's starting Y position
        currentY += hexVerticalStagger;
    }

    // --- Separate Loop for Drawing Hexagons ---
    hexLocations.forEach(location => {
        const [fillColor, borderColor] = getColors(state, location.hexNum);
        // The apothem * .9 reduces the size slightly to create a gap between hexagons
        hexagon(canvasElement, location.x, location.y, apothem * .9, borderColor, fillColor, rotation);
    });

    return hexLocations;
}

function drawBench(canvasElement, state, scale, orientation = 'horizontal') {
    // Assuming canvasElement is passed, similar to drawBoard
    const ctx = canvasElement.getContext('2d'); // Get context to clear canvas, similar to drawBoard
    ctx.clearRect(0, 0, canvasElement.width, canvasElement.height); // Clear the canvas

    const canvasWidth = canvasElement.width;
    const canvasHeight = canvasElement.height;

    let baseApothem;
    let hexHorizontalSpacing = 0;
    let hexVerticalSpacing = 0;

    // Determine baseApothem and spacing based on orientation and canvas dimensions
    if (orientation === 'horizontal') {
        baseApothem = Math.min(canvasHeight / 2.3, canvasWidth / 15);
        hexHorizontalSpacing = canvasWidth / 8;
    } else if (orientation === 'vertical') {
        baseApothem = Math.min(canvasWidth / 2, canvasHeight / 25);
        hexVerticalSpacing = canvasHeight / 8;
    } else {
        console.error("Invalid orientation specified for drawBench. Use 'horizontal' or 'vertical'.");
        return []; // Return empty array if orientation is invalid
    }

    const apothem = baseApothem * scale;
    const rotation = Math.PI / 2; // Hexagons rotated by 90 degrees (flat-top)
    const sideLength = (2 * apothem) / Math.sqrt(3);

    const numHexagons = state.length; // Number of hexagons for the bench

    let startX, startY;
    const hexLocations = []; // Array to store the x, y coordinates and hex number

    if (orientation === 'horizontal') {
        // Calculate total width of the arranged hexagons
        const totalWidth = (numHexagons - 1) * hexHorizontalSpacing + (2 * apothem);
        // Calculate starting X to center the arrangement horizontally
        startX = (canvasWidth / 2) - (totalWidth / 2) + apothem;
        // Vertically center the hexagons
        startY = canvasHeight / 2;

        for (let i = 0; i < numHexagons; i++) {
            const hexX = startX + i * hexHorizontalSpacing;
            const hexY = startY;
            // Store the location and index
            hexLocations.push({ x: hexX, y: hexY, hexNum: i });
        }
    } else if (orientation === 'vertical') {
        // Calculate total height of the arranged hexagons
        const totalHeight = (numHexagons - 1) * hexVerticalSpacing + (2 * sideLength);
        // Horizontally center the hexagons
        startX = canvasWidth / 2;
        // Calculate starting Y to center the arrangement vertically
        startY = (canvasHeight / 2) - (totalHeight / 2) + sideLength;

        for (let i = 0; i < numHexagons; i++) {
            const hexX = startX;
            const hexY = startY + i * hexVerticalSpacing;
            // Store the location and index
            hexLocations.push({ x: hexX, y: hexY, hexNum: i });
        }
    }

    // --- Separate Loop for Drawing Hexagons ---
    hexLocations.forEach(location => {
        // getColors and hexagon functions are assumed to be defined elsewhere,
        // similar to their usage in drawBoard.
        const [fillColor, borderColor] = getColors(state, location.hexNum);

        // CORRECTED: Use 'location.x' and 'location.y' which are properties of the current 'location' object,
        // instead of trying to access 'x' and 'y' directly from the 'hexLocations' array.
        // The apothem * .9 reduces the size slightly to create a gap between hexagons
        hexagon(canvasElement, location.x, location.y, apothem * .9, borderColor, fillColor, rotation);
    });
    
    return hexLocations;
}