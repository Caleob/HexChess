// Global variables to store hex locations
let boardHexLocations = [];
let bench1HexLocations = [];
let bench2HexLocations = [];

// You'll also need to define radius globally or calculate it
let radius = 30; // Adjust based on your hex size

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
async function resizeAllCanvases() {
    const canvases = document.querySelectorAll('canvas');
    
    for (const canvas of canvases) {
        if (canvas.offsetParent !== null && canvas.clientWidth > 0 && canvas.clientHeight > 0) {
            sizeCanvas(canvas);
            
            // Draw and store hex locations for each canvas
            if (canvas.id === 'board-canvas') {
                boardHexLocations = await drawBoard(canvas, boardState);
            }
            if (canvas.id === 'bench1-canvas') {
                bench1HexLocations = await drawBench(canvas, benchState1, .9, benchOrientation);
            }
            if (canvas.id === 'bench2-canvas') {
                bench2HexLocations = await drawBench(canvas, benchState2, .9, benchOrientation);
            }
        }
    }
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

/**
 * Asynchronously loads an image and returns a Promise that resolves with the Image object.
 * @param {string} src The source URL of the image.
 * @returns {Promise<HTMLImageElement>} A Promise that resolves with the loaded Image object.
 */
function loadImage(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
    });
}

/**
 * Returns the file path of the appropriate hexagon image based on the board state.
 * @param {Array<string>} boardState An array representing the state of the board.
 * @param {number} hexNumber The index of the hexagon.
 * @returns {string} The file path of the hexagon image.
 */
function getImageFileName(boardState, hexNumber) {
    const state = boardState[hexNumber];
    switch (state) {
        case 'P1':
            return 'images/green-border.png';
        case 'P2':
            return 'images/yellow-border.png';
        case 'SF':
            return 'images/blue-border.png';
        case 'IM':
            return 'images/grey-border.png';
        case 'CE':
            return 'images/grey_veined_marble_hex.png';
        case 'OO':
            return 'images/whiter_marble_hex.png';
        default:
            return 'images/white_marble_hex.png';
    }
}

/**
 * Draws the game board with hexagons using images.
 * @param {HTMLCanvasElement} canvasElement The canvas element to draw on.
 * @param {Array<string>} state An array representing the state of each hexagon.
 * @param {number} scale The scaling factor for the hexagons.
 * @returns {Promise<Array<{x: number, y: number, hexNum: number}>>} A Promise that resolves with an array of hexagon locations.
 */
async function drawBoard(canvasElement, state, scale = 1.0) {
    const ctx = canvasElement.getContext('2d');
    ctx.clearRect(0, 0, canvasElement.width, canvasElement.height);

    const canvasWidth = canvasElement.width;
    const canvasHeight = canvasElement.height;

    const rows = [4, 5, 6, 7, 6, 5, 4];

    // Determine a base size for the square hexagon image.
    const baseHexImageSize = Math.min(canvasHeight / 5.5, canvasWidth / 6.5);

    // Apply the overall scale factor
    const hexImageDrawSize = baseHexImageSize * scale;
    
    // Update global radius based on hex size
    radius = hexImageDrawSize / 2;

    const hexHorizontalSpacing = hexImageDrawSize * 0.9;
    const hexVerticalStagger = hexImageDrawSize * 0.75;

    // Calculate total board dimensions for centering
    const maxRowLength = Math.max(...rows);
    const actualBoardWidth = (maxRowLength - 1) * hexHorizontalSpacing + hexImageDrawSize;
    const actualBoardHeight = (rows.length - 1) * hexVerticalStagger + hexImageDrawSize;

    // Calculate initial X and Y to center the entire arrangement
    const initialCenterX = canvasWidth / 2;
    const initialCenterY = canvasHeight / 2;

    let currentY = initialCenterY - (actualBoardHeight / 2) + (hexImageDrawSize / 2);

    const hexLocations = [];
    let hexNum = 0;

    for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
        const numHexagonsInRow = rows[rowIndex];

        const rowWidth = (numHexagonsInRow - 1) * hexHorizontalSpacing;
        let startX = initialCenterX - (rowWidth / 2);

        for (let i = 0; i < numHexagonsInRow; i++) {
            const hexX = startX + i * hexHorizontalSpacing;
            const hexY = currentY;

            hexLocations.push({ x: hexX, y: hexY, hexNum: hexNum });
            hexNum++;
        }
        currentY += hexVerticalStagger;
    }

    const imagePromises = hexLocations.map(async (location) => {
        const imagePath = getImageFileName(state, location.hexNum);
        const img = await loadImage(imagePath);

        ctx.drawImage(img, location.x - hexImageDrawSize / 2, location.y - hexImageDrawSize / 2, hexImageDrawSize, hexImageDrawSize);
    });

    await Promise.all(imagePromises); 
    return hexLocations;
}

/**
 * Draws the bench with hexagons using images.
 * @param {HTMLCanvasElement} canvasElement The canvas element to draw on.
 * @param {Array<string>} state An array representing the state of each hexagon on the bench.
 * @param {number} scale The scaling factor for the hexagons.
 * @param {'horizontal' | 'vertical'} orientation The orientation of the bench.
 * @returns {Promise<Array<{x: number, y: number, hexNum: number}>>} A Promise that resolves with an array of hexagon locations.
 */
async function drawBench(canvasElement, state, scale, orientation = 'horizontal') {
    const ctx = canvasElement.getContext('2d');
    ctx.clearRect(0, 0, canvasElement.width, canvasElement.height);

    const canvasWidth = canvasElement.width;
    const canvasHeight = canvasElement.height;

    let baseHexImageSize;
    let hexSpacing;

    if (orientation === 'horizontal') {
        baseHexImageSize = canvasWidth / (state.length * 1.4);
        hexSpacing = baseHexImageSize * 1.3;
    } else if (orientation === 'vertical') {
        baseHexImageSize = canvasHeight / (state.length * 1.1);
        hexSpacing = baseHexImageSize * 0.9;
    } else {
        console.error("Invalid orientation specified for drawBench. Use 'horizontal' or 'vertical'.");
        return [];
    }

    const hexImageDrawSize = baseHexImageSize * scale;

    const numHexagons = state.length;
    let startX, startY;
    const hexLocations = [];

    if (orientation === 'horizontal') {
        const totalWidth = (numHexagons - 1) * hexSpacing + hexImageDrawSize;
        startX = (canvasWidth / 2) - (totalWidth / 2) + (hexImageDrawSize / 2);
        startY = canvasHeight / 2;

        for (let i = 0; i < numHexagons; i++) {
            const hexX = startX + i * hexSpacing;
            const hexY = startY;
            hexLocations.push({ x: hexX, y: hexY, hexNum: i });
        }
    } else if (orientation === 'vertical') {
        const totalHeight = (numHexagons - 1) * hexSpacing + hexImageDrawSize;
        startX = canvasWidth / 2;
        startY = (canvasHeight / 2) - (totalHeight / 2) + (hexImageDrawSize / 2);

        for (let i = 0; i < numHexagons; i++) {
            const hexX = startX;
            const hexY = startY + i * hexSpacing;
            hexLocations.push({ x: hexX, y: hexY, hexNum: i });
        }
    }

    const imagePromises = hexLocations.map(async (location) => {
        const imagePath = getImageFileName(state, location.hexNum);
        const img = await loadImage(imagePath);

        ctx.drawImage(img, location.x - hexImageDrawSize / 2, location.y - hexImageDrawSize / 2, hexImageDrawSize, hexImageDrawSize);
    });

    await Promise.all(imagePromises);

    return hexLocations;
}

// Helper function to get mouse position relative to canvas
function getMousePosInCanvas(canvas, event) {
    const rect = canvas.getBoundingClientRect();
    return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top
    };
}

// Updated click handler that uses the stored hex locations
function handleClickOnCanvas(event, canvasId) {
    const canvas = document.getElementById(canvasId);
    const mousePos = getMousePosInCanvas(canvas, event);

    console.log(`Click registered on ${canvasId} at x: ${mousePos.x}, y: ${mousePos.y}`);

    // Get the appropriate hex locations based on canvas ID
    let currentHexLocations;
    switch (canvasId) {
        case 'board-canvas':
            currentHexLocations = boardHexLocations;
            break;
        case 'bench1-canvas':
            currentHexLocations = bench1HexLocations;
            break;
        case 'bench2-canvas':
            currentHexLocations = bench2HexLocations;
            break;
        default:
            console.error(`Unknown canvas ID: ${canvasId}`);
            return;
    }

    if (currentHexLocations && radius) {
        for (const hex of currentHexLocations) {
            const dist = Math.sqrt(
                Math.pow(mousePos.x - hex.x, 2) + Math.pow(mousePos.y - hex.y, 2)
            );
            if (dist < radius) {
                console.log(`Clicked hex number: ${hex.hexNum} on ${canvasId}`);
                // Perform actions based on the clicked hex
                handleHexClick(canvasId, hex.hexNum);
                break;
            }
        }
    }
}

// Optional: Add a separate function to handle hex clicks
function handleHexClick(canvasId, hexNum) {
    console.log(`Processing click on hex ${hexNum} from ${canvasId}`);
}

// Attach click listeners
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('board-canvas').addEventListener('click', (e) => 
        handleClickOnCanvas(e, 'board-canvas'));
    document.getElementById('bench1-canvas').addEventListener('click', (e) => 
        handleClickOnCanvas(e, 'bench1-canvas'));
    document.getElementById('bench2-canvas').addEventListener('click', (e) => 
        handleClickOnCanvas(e, 'bench2-canvas'));
    
    // Initialize the game
    reDraw();
});

function setupMenuIcons() {
    const menuIcons = document.querySelectorAll('#menu-item img');
    const iconMessages = ['Concede', 'New Game', 'Rules', 'Chat'];

    menuIcons.forEach((icon, index) => {
        if (icon) {
            icon.addEventListener('click', () => {
                alert(`I just clicked the ${iconMessages[index]} icon!`);
            });
        }
    });
}