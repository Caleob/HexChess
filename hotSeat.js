/**
 * hotSeat.js
 * This script contains the game logic for a two-player hotseat mode of HexChess.
 * It relies on variables and functions defined in GameState.js, HexFunctions.js, and neighbors.js.
 */

// --- Game State Management ---

// Tracks the currently selected piece. This can be a piece object from either the bench or the board.
// It is `null` when no piece is selected.
let selectedPiece = null;

// Tracks the hex index from which a piece was selected on the board.
// It is `null` if the selected piece is from a bench. This helps differentiate between moving and placing.
let sourceHexIndex = null;

// A boolean flag to manage the special rule for placing a Blocker tile, which grants an extra action.
let isBlockerBonusAction = false;

// An array to store the numerical indices of hexes that are valid destinations for the selectedPiece.
// This is used for highlighting valid moves on the canvas.
let highlightedHexes = [];

// A flag to prevent the handleHexClick function from firing twice on a single click.
// This is necessary because both HexFunctions.js and this file add a click listener.
let isProcessingClick = false;


// --- Main Game Logic ---

/**
 * Overrides the placeholder in HexFunctions.js to handle all game logic for clicks.
 * This function acts as the central controller for all player actions, determining what to do
 * based on the current game state (e.g., whose turn it is, what piece is selected).
 * @param {string} canvasId - The ID of the canvas that was clicked ('board-canvas', 'bench1-canvas', 'bench2-canvas').
 * @param {number} hexNum - The index of the hex that was clicked within its specific canvas.
 */
function handleHexClick(canvasId, hexNum) {
    // FIX: If a click is already being processed, ignore this call to prevent double-firing.
    if (isProcessingClick) {
        return;
    }
    isProcessingClick = true;

    // Get the player whose turn it is from the global game state.
    const currentPlayer = gameState.currentTurn;
    console.log(`Click detected on ${canvasId}, hex ${hexNum}. Current player: ${currentPlayer}`);

    // --- State 1: NO PIECE IS CURRENTLY SELECTED ---
    // The player is attempting to select a piece to act with.
    if (!selectedPiece) {
        console.log("Attempting to select a piece.");
        // --- Action: Selecting a piece from the main board ---
        if (canvasId === 'board-canvas') {
            const hex = gameState.board[hexNum];
            // A piece can only be selected if it exists on the clicked hex AND belongs to the current player.
            if (hex.piece && hex.piece.player === currentPlayer) {
                selectedPiece = hex.piece;
                sourceHexIndex = hexNum; // Remember where this piece came from on the board.
                console.log(`Selected piece ${selectedPiece.type} from board hex ${sourceHexIndex}`);
                highlightValidMoves(selectedPiece, sourceHexIndex);
            }
        // --- Action: Selecting a piece from a bench ---
        } else {
            const benchPlayerId = canvasId === 'bench1-canvas' ? 1 : 2;
            // A piece can only be selected from a bench if it's the current player's turn.
            if (benchPlayerId === currentPlayer) {
                // Ensure the clicked hex on the bench actually has a piece.
                if (gameState.players[currentPlayer].bench[hexNum]) {
                    selectedPiece = gameState.players[currentPlayer].bench[hexNum];
                    sourceHexIndex = null; // `null` indicates the piece is from the bench, not the board.
                    console.log(`Selected piece ${selectedPiece.type} from bench.`);
                    highlightValidMoves(selectedPiece, null);
                }
            }
        }
    }
    // --- State 2: A PIECE IS ALREADY SELECTED ---
    // The player is attempting to perform an action (move or place) with the selected piece.
    else {
        console.log(`Attempting to perform action with selected piece: ${selectedPiece.type}`);
        // Actions can only target the main board. Clicking a bench while a piece is selected will deselect.
        if (canvasId === 'board-canvas') {
            const targetHex = gameState.board[hexNum];

            // Check if the clicked hex is in the array of valid moves we calculated earlier.
            if (highlightedHexes.includes(hexNum)) {
                console.log(`Valid destination hex ${hexNum} clicked.`);
                // --- Action A: Place a new piece from the bench ---
                // We know it's a placement because `sourceHexIndex` is null.
                if (sourceHexIndex === null) {
                    console.log(`Placing piece at ${hexNum}.`);
                    placePiece(currentPlayer, selectedPiece, hexNum);
                }
                // --- Action B: Move an existing piece on the board ---
                // We know it's a move because `sourceHexIndex` has a value.
                else {
                    console.log(`Moving piece from ${sourceHexIndex} to ${hexNum}.`);
                    movePiece(currentPlayer, sourceHexIndex, hexNum);
                }

                // After any move or placement, check if the piece should be promoted.
                if (targetHex.isCenter && selectedPiece.type === 'regular') {
                    console.log("Piece promoted!");
                    selectedPiece.type = 'promoted';
                    selectedPiece.isPromoted = true;
                }

                // Handle the special bonus action for placing a Blocker.
                if (selectedPiece.type === 'blocker' && !isBlockerBonusAction) {
                    isBlockerBonusAction = true; // Grant the bonus action.
                    console.log("Blocker placed. Bonus action granted.");
                } else {
                    isBlockerBonusAction = false; // The turn ends.
                    gameState.currentTurn = currentPlayer === 1 ? 2 : 1; // Switch turns.
                    console.log(`Turn ended. New player: ${gameState.currentTurn}`);
                }

                // After the turn, check if the current player has won.
                if (checkWinCondition(gameState, currentPlayer)) {
                    console.log(`Player ${currentPlayer} has won!`);
                    gameState.winner = currentPlayer;
                    gameState.gamePhase = 'ended';
                    // Use setTimeout to allow the final move to render before the alert pops up.
                    setTimeout(() => {
                        alert(`Player ${currentPlayer} wins!`);
                    }, 100);
                }

                // The action was successful, so reset the selection state.
                resetSelection();
                updateStatusMessage();

            } else {
                // The player clicked on an invalid destination hex. Deselect the piece.
                console.log("Invalid destination clicked. Deselecting piece.");
                resetSelection();
            }
        } else {
            // The player clicked on a bench while a piece was selected. Deselect.
            console.log("Bench clicked while piece was selected. Deselecting.");
            resetSelection();
        }
    }
    // After any click, redraw the entire game to show selection highlights or the new game state.
    reDraw();

    // Reset the click processing flag after a short delay to allow the event to fully propagate.
    setTimeout(() => {
        isProcessingClick = false;
    }, 50);
}

/**
 * Resets the global selection variables and clears highlights.
 * This is called after a successful action or when an action is cancelled.
 */
function resetSelection() {
    console.log("Resetting selection state.");
    selectedPiece = null;
    sourceHexIndex = null;
    highlightedHexes = [];
}

/**
 * Handles the logic for placing a piece from the bench onto the board.
 * @param {number} player - The current player (1 or 2).
 * @param {Object} piece - The piece object to place.
 * @param {number} targetHexIndex - The destination hex index on the board.
 */
function placePiece(player, piece, targetHexIndex) {
    // Update the board state by assigning the piece to the target hex.
    gameState.board[targetHexIndex].piece = piece;
    piece.position = targetHexIndex;

    // If it's a blocker, permanently mark the hex as blocked.
    if (piece.type === 'blocker') {
        gameState.board[targetHexIndex].isBlocked = true;
    }

    // Remove the placed piece from the player's bench array.
    const bench = gameState.players[player].bench;
    const pieceIndexInBench = bench.findIndex(p => p.id === piece.id);
    if (pieceIndexInBench > -1) {
        bench.splice(pieceIndexInBench, 1);
    }
}

/**
 * Handles the logic for moving a piece from one hex to another on the board.
 * @param {number} player - The current player (1 or 2).
 * @param {number} fromHexIndex - The source hex index.
 * @param {number} toHexIndex - The destination hex index.
 */
function movePiece(player, fromHexIndex, toHexIndex) {
    const pieceToMove = gameState.board[fromHexIndex].piece;
    const opponent = player === 1 ? 2 : 1;
    const targetHex = gameState.board[toHexIndex];

    // Check for a capture. A capture occurs if the target hex contains an opponent's piece.
    if (targetHex.piece && targetHex.piece.player === opponent) {
        const capturedPiece = targetHex.piece;
        console.log(`Capturing opponent's ${capturedPiece.type} piece.`);
        gameState.players[player].captured.push(capturedPiece);
    }

    // Perform the move by updating the board state.
    targetHex.piece = pieceToMove;
    pieceToMove.position = toHexIndex;
    gameState.board[fromHexIndex].piece = null; // Vacate the original hex.
}


// --- Visual Feedback ---

/**
 * Calculates and stores all valid move locations for the selected piece.
 * This populates the `highlightedHexes` array, which is then used for drawing.
 * @param {Object} piece - The selected piece object.
 * @param {number|null} startHexIndex - The starting hex index, or null if the piece is from the bench.
 */
function highlightValidMoves(piece, startHexIndex) {
    highlightedHexes = []; // Reset previous highlights.

    // --- Logic for PLACING a piece from the bench ---
    if (startHexIndex === null) {
        console.log("Calculating valid PLACEMENT hexes.");
        for (let i = 0; i < gameState.board.length; i++) {
            // Use the helper function from GameState.js to check validity.
            if (isValidPlacementHex(gameState, i)) {
                highlightedHexes.push(i);
            }
        }
    }
    // --- Logic for MOVING a piece already on the board ---
    else {
        console.log(`Calculating valid MOVEMENT hexes for a ${piece.type}.`);
        // --- Movement for a REGULAR piece (one space) ---
        if (piece.type === 'regular') {
            const neighbors = adjacency[startHexIndex];
            for (const dir in neighbors) {
                const neighborIndex = neighbors[dir];
                // Check if the neighbor exists and is a valid destination.
                if (neighborIndex !== null && isValidMoveDestination(gameState, neighborIndex, piece.player)) {
                    highlightedHexes.push(neighborIndex);
                }
            }
        }
        // --- Movement for a PROMOTED piece (straight line) ---
        else if (piece.type === 'promoted') {
            const directions = Object.keys(adjacency[startHexIndex]);
            for (const dir of directions) {
                let currentHex = startHexIndex;
                // Loop in a straight line until we hit the edge of the board or an obstacle.
                while (true) {
                    const nextHexIndex = adjacency[currentHex] ? adjacency[currentHex][dir] : null;
                    if (nextHexIndex === null) break; // Reached edge of board.

                    if (isValidMoveDestination(gameState, nextHexIndex, piece.player)) {
                        highlightedHexes.push(nextHexIndex);
                        // If the destination is occupied by an opponent, we can land there to capture, but not move past it.
                        if (gameState.board[nextHexIndex].piece) {
                           break;
                        }
                        currentHex = nextHexIndex; // Continue along the path.
                    } else {
                        break; // Path is blocked by a friendly piece or impassable terrain.
                    }
                }
            }
        }
    }
    console.log("Valid moves:", highlightedHexes);
}

/**
 * Overrides the original drawBoard function from HexFunctions.js to include highlights for valid moves.
 * This is a powerful pattern called "wrapping" or "decorating" a function.
 */
const originalDrawBoard = drawBoard;
drawBoard = async function(canvasElement, board, scale = 1.0) {
    // First, call the original function to draw the base board, pieces, etc.
    const hexLocations = await originalDrawBoard(canvasElement, board, scale);

    // After the base board is drawn, draw the highlights on top.
    if (highlightedHexes.length > 0) {
        const ctx = canvasElement.getContext('2d');
        ctx.strokeStyle = 'rgba(0, 255, 0, 0.7)'; // Bright green for visibility.
        ctx.lineWidth = 4;

        highlightedHexes.forEach(hexIndex => {
            const loc = hexLocations.find(h => h.hexNum === hexIndex);
            if (loc) {
                ctx.beginPath();
                ctx.arc(loc.x, loc.y, radius * 0.8, 0, 2 * Math.PI); // Draw a circle inside the hex.
                ctx.stroke();
            }
        });
    }
    // It's crucial to return the hexLocations so the main click handler can still use them.
    return hexLocations;
};


// --- UI and Initialization ---

/**
 * Creates and injects a status message element into the DOM if it doesn't exist.
 * This provides players with feedback about the game state.
 */
function createStatusDisplay() {
    const container = document.getElementById('grid-container');
    let statusDiv = document.getElementById('status-message');
    if (!statusDiv) {
        statusDiv = document.createElement('div');
        statusDiv.id = 'status-message';
        // Apply some basic styling for the message.
        statusDiv.style.position = 'absolute';
        statusDiv.style.top = '10px';
        statusDiv.style.left = '50%';
        statusDiv.style.transform = 'translateX(-50%)';
        statusDiv.style.padding = '10px 20px';
        statusDiv.style.backgroundColor = 'rgba(0, 0, 0, 0.6)';
        statusDiv.style.color = 'white';
        statusDiv.style.borderRadius = '8px';
        statusDiv.style.fontFamily = 'sans-serif';
        statusDiv.style.fontSize = '18px';
        container.style.position = 'relative'; // Parent needs to be relative for absolute child positioning.
        container.appendChild(statusDiv);
    }
}

/**
 * Updates the text content of the status message to show whose turn it is or if the game is over.
 */
function updateStatusMessage() {
    const statusDiv = document.getElementById('status-message');
    if (gameState.gamePhase !== 'ended') {
        let message = `Player ${gameState.currentTurn}'s Turn`;
        if (isBlockerBonusAction) {
            message += " (Blocker Bonus Action!)";
        }
        statusDiv.textContent = message;
    } else {
        statusDiv.textContent = `Game Over! Player ${gameState.winner} won!`;
    }
}

/**
 * Sets up the click functionality for the menu icons (New Game, Rules).
 */
function setupMenuActions() {
    const menuIcons = document.querySelectorAll('#menu-item img');
    const newGameIcon = menuIcons[1]; // Assumes "New Game" is the second icon in index.html.

    newGameIcon.addEventListener('click', () => {
        // Use confirm() to prevent accidental new games.
        if (confirm('Are you sure you want to start a new game?')) {
            console.log("Starting new game.");
            // Reset the entire game state to its initial configuration.
            gameState = getBoardState();
            isBlockerBonusAction = false;
            resetSelection();
            updateStatusMessage();
            reDraw();
        }
    });

     // Add listener for rules, assuming it's the third icon.
    const rulesIcon = menuIcons[2];
    rulesIcon.addEventListener('click', () => {
        // In a real app, this would open a styled modal window. `alert` is used for simplicity here.
        alert("HexChess Rules:\n\n- Objective: Capture all of the opponent's regular pieces.\n- Turn: Place a piece from your bench OR move a piece on the board.\n- Blocker: Placing your blocker piece gives you a bonus action.\n- Promotion: Reach the center hex to promote a piece, allowing it to move in a straight line.");
    });
}


// --- Game Initialization ---

// This event listener ensures that all the HTML is loaded before we try to attach our game logic to it.
document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM fully loaded. Initializing game.");

    // Attach the main click handler to all game canvases.
    document.getElementById('board-canvas').addEventListener('click', (e) => handleClickOnCanvas(e, 'board-canvas'));
    document.getElementById('bench1-canvas').addEventListener('click', (e) => handleClickOnCanvas(e, 'bench1-canvas'));
    document.getElementById('bench2-canvas').addEventListener('click', (e) => handleClickOnCanvas(e, 'bench2-canvas'));

    // Add a listener to redraw the game if the window is resized.
    window.addEventListener('resize', reDraw);

    // Set up the UI elements.
    createStatusDisplay();
    updateStatusMessage();
    setupMenuActions();

    // Perform the initial draw of the game board and benches.
    reDraw();
    console.log("Game initialized and ready.");
});
