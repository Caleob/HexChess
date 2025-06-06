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

    const rotation = Math.PI / 2;
    const rows = [4, 5, 6, 7, 6, 5, 4];

    // Calculate base dimensions for scaling
    // Assuming a base apothem of 40 (from original code)
    const baseApothem = Math.min(canvasHeight/ 13, canvasWidth/14);
    const baseSideLength = (2 * baseApothem) / Math.sqrt(3);
    const baseHexHorizontalSpacing = 2 * baseApothem;
    const baseHexVerticalStagger = baseSideLength * 1.5;

    // Calculate max theoretical width and height of the board layout
    const maxRowLength = Math.max(...rows);
    const theoreticalBoardWidth = (maxRowLength - 1) * baseHexHorizontalSpacing + (2 * baseApothem);
    const theoreticalBoardHeight = (rows.length - 1) * baseHexVerticalStagger + (2 * baseSideLength); // Height includes top and bottom hexagon

    // Apply the calculated scale to the apothem and spacing
    const apothem = baseApothem * scale;
    const sideLength = (2 * apothem) / Math.sqrt(3);
    const hexHorizontalSpacing = 2 * apothem;
    const hexVerticalStagger = sideLength * 1.5;

    // Calculate the actual total width and height of the scaled board
    const actualBoardWidth = (maxRowLength - 1) * hexHorizontalSpacing + (2 * apothem);
    const actualBoardHeight = (rows.length - 1) * hexVerticalStagger + (2 * sideLength);


    // Calculate initial X and Y to center the entire arrangement on the canvas
    const initialCenterX = canvasWidth / 2;
    const initialCenterY = canvasHeight / 2;

    // The starting Y position for the first row, accounting for centering
    let currentY = initialCenterY - (actualBoardHeight / 2) + apothem; // Add apothem to account for hexagon's top edge


    let hexNum = 0;
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
        const numHexagonsInRow = rows[rowIndex];

        // Calculate the start X for the current row to center it.
        const rowWidth = (numHexagonsInRow - 1) * hexHorizontalSpacing;
        let startX = initialCenterX - (rowWidth / 2);
        
        for (let i = 0; i < numHexagonsInRow; i++) {
            const hexX = startX + i * hexHorizontalSpacing;
            const hexY = currentY;

            const [fillColor, borderColor] = getColors(state, hexNum);
            
            hexagon(canvasElement, hexX, hexY, apothem * .9, borderColor, fillColor, rotation);
            hexNum++;
        }
        currentY += hexVerticalStagger;
    }
}

function drawBench(canvasElement, state, scale, orientation = 'horizontal') {
    const ctx = canvasElement.getContext('2d');
    ctx.clearRect(0, 0, canvasElement.width, canvasElement.height);

    const canvasWidth = canvasElement.width;
    const canvasHeight = canvasElement.height;
    let baseApothem, hexVerticalSpacing, hexVHorizontalSpacing  = 0;

    // Determine baseApothem based on orientation and canvas dimension
    if (orientation === 'horizontal') {
        baseApothem = Math.min(canvasHeight / 2.3, canvasWidth/15); // Scales apothem based on canvas height for horizontal
        hexHorizontalSpacing = canvasWidth / 8;
        console.log('horizontal arrangement', hexVerticalSpacing);

    } else if (orientation === 'vertical') {
        baseApothem = Math.min(canvasWidth / 2, canvasHeight/32); // Scales apothem based on canvas width for vertical
        hexVerticalSpacing = canvasHeight / 8;
        console.log('vertical arrangement', hexVerticalSpacing );

    } else {
        console.error("Invalid orientation specified for drawBench. Use 'horizontal' or 'vertical'.");
        return; // Exit if orientation is invalid
    }
    const apothem = baseApothem * scale
    const rotation = Math.PI / 2; // Hexagons rotated by 90 degrees
    const sideLength = (2 * apothem) / Math.sqrt(3);

    const numHexagons = state.length; // Should be 8 for the bench

    let startX, startY;

    if (orientation === 'horizontal') {
        const totalWidth = (numHexagons - 1) * hexHorizontalSpacing + (2 * apothem);
        startX = (canvasWidth / 2) - (totalWidth / 2) + apothem; // Center horizontally
        startY = canvasHeight / 2; // Center vertically
        
        for (let i = 0; i < numHexagons; i++) {
            const hexX = startX + i * hexHorizontalSpacing;
            const hexY = startY;
            const [fillColor, borderColor] = getColors(state, i);
            hexagon(canvasElement, hexX, hexY, apothem * .9, borderColor, fillColor, rotation);
        }
    } else if (orientation === 'vertical') {
        const totalHeight = (numHexagons - 1) * hexVerticalSpacing + (2 * sideLength);
        startX = canvasWidth / 2; // Center horizontally
        startY = (canvasHeight / 2) - (totalHeight / 2) + sideLength; // Center vertically
        
        for (let i = 0; i < numHexagons; i++) {
            const hexX = startX;
            const hexY = startY + i * hexVerticalSpacing;
            const [fillColor, borderColor] = getColors(state, i);
            hexagon(canvasElement, hexX, hexY, apothem * .9, borderColor, fillColor, rotation);
        }
    }
}