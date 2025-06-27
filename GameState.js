/**
 * Creates a piece object
 * @param {string} type - 'regular', 'blocker', or 'promoted'
 * @param {number} player - 1 or 2
 * @param {string} id - optional unique identifier
 * @returns {Object} piece object
 */
function createPiece(type, player, id = null) {
    return {
        id: id || `${player}_${type}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        type: type,
        player: player,
        position: null, // hex index when on board, null when on bench
        isPromoted: false,
        capturedAt: null,
        createdAt: Date.now()
    };
}

/**
 * Creates a hex object
 * @param {number} index - hex position index (0-36)
 * @param {Object} properties - hex properties {isSafe, isCenter, isImpassable, allowsInitialDeploy}
 * @returns {Object} hex object
 */
function createHex(index, properties = {}) {
    return {
        index: index,
        piece: null,
        
        // Hex properties
        isSafe: properties.isSafe || false,              // Safe zone - pieces can't be captured here
        isCenter: properties.isCenter || false,          // Center hex - promotes pieces
        isImpassable: properties.isImpassable || false, // Pre-set impassable hexes
        allowsInitialDeploy: properties.allowsInitialDeploy !== false,    // Can place pieces from bench (default true)
        
        // Dynamic state
        isBlocked: false // becomes true when a blocker tile is placed here
    };
}

/**
 * Initialize game state with proper board and piece setup
 * @returns {Object} complete game state
 */
function getBoardState() {
    // Initialize the board with proper hex properties
    const board = [];
    
    // Define special hex indices based on your rules
    const safeHexes = [11, 12, 24, 25];
    const impassableHexes = [17, 19];
    const centerHex = 18;
    const noDeploy = [11, 12, 17, 18, 19, 24, 25];
    
    // Create all 37 hexes
    for (let i = 0; i < 37; i++) {
        const hexProperties = {
            isSafe: safeHexes.includes(i),
            isCenter: i === centerHex,
            isImpassable: impassableHexes.includes(i),
            allowsInitialDeploy: !noDeploy.includes(i)
        };
        
        board.push(createHex(i, hexProperties));
    }
    
    // Create pieces for each player
    const player1Pieces = [];
    const player2Pieces = [];
    
    // Player 1: 7 regular tiles + 1 blocker
    for (let i = 0; i < 7; i++) {
        player1Pieces.push(createPiece('regular', 1));
    }
    player1Pieces.push(createPiece('blocker', 1));
    
    // Player 2: 7 regular tiles + 1 blocker
    for (let i = 0; i < 7; i++) {
        player2Pieces.push(createPiece('regular', 2));
    }
    player2Pieces.push(createPiece('blocker', 2));
    
    // Create complete game state
    const gameState = {
        // Game metadata
        gameId: `game_${Date.now()}`,
        currentTurn: 1, // Player 1 goes first
        turnCount: 0,
        gamePhase: 'active', // 'setup', 'active', 'ended'
        winner: null,
        createdAt: Date.now(),
        lastActivity: Date.now(),
        
        // Board state
        board: board,
        
        // Player inventories
        players: {
            1: {
                bench: [...player1Pieces], // pieces available to place
                captured: [], // enemy pieces this player captured
                piecesOnBoard: [] // pieces currently on the board
            },
            2: {
                bench: [...player2Pieces],
                captured: [],
                piecesOnBoard: []
            }
        },
        
        // Move tracking
        lastMove: null,
        moveHistory: []
    };
    
    return gameState;
}

/**
 * Helper function to find a piece by ID across all game state locations
 * @param {Object} gameState - the complete game state
 * @param {string} pieceId - the piece ID to find
 * @returns {Object|null} piece object or null if not found
 */
function findPieceById(gameState, pieceId) {
    // Check board
    for (let hex of gameState.board) {
        if (hex.piece && hex.piece.id === pieceId) {
            return hex.piece;
        }
    }
    
    // Check benches and captured pieces
    for (let playerId of [1, 2]) {
        const player = gameState.players[playerId];
        
        // Check bench
        const benchPiece = player.bench.find(p => p.id === pieceId);
        if (benchPiece) return benchPiece;
        
        // Check captured
        const capturedPiece = player.captured.find(p => p.id === pieceId);
        if (capturedPiece) return capturedPiece;
        
        // Check pieces on board list
        const boardPiece = player.piecesOnBoard.find(p => p.id === pieceId);
        if (boardPiece) return boardPiece;
    }
    
    return null;
}

/**
 * Helper function to check if a hex can be moved into (for piece movement, not initial placement)
 * @param {Object} gameState - the complete game state
 * @param {number} hexIndex - the hex index to check
 * @param {number} playerId - the player attempting to move (1 or 2)
 * @returns {boolean} true if piece can move into this hex
 */
function isValidMoveDestination(gameState, hexIndex, playerId) {
    const hex = gameState.board[hexIndex];
    if (!hex) return false;
    
    // Cannot move into impassable hexes
    if (hex.isImpassable) return false;
    
    // If hex is empty, can move there
    if (!hex.piece) return true;
    
    // If hex has opponent's piece, can capture (move there)
    if (hex.piece.player !== playerId) {
        // But cannot capture pieces in safe zones
        if (hex.isSafe) return false;
        return true;
    }
    
    // Cannot move into hex occupied by own piece
    return false;
}

/*
 * @param {Object} gameState - the complete game state
 * @param {number} playerId - 1 or 2
 * @returns {Array} array of piece objects on the board
 */
function getPlayerPiecesOnBoard(gameState, playerId) {
    return gameState.board
        .filter(hex => hex.piece && hex.piece.player === playerId)
        .map(hex => hex.piece);
}

/**
 * Helper function to check if a hex is valid for piece placement from bench
 * @param {Object} gameState - the complete game state
 * @param {number} hexIndex - the hex index to check
 * @returns {boolean} true if valid placement location
 */
function isValidPlacementHex(gameState, hexIndex) {
    const hex = gameState.board[hexIndex];
    if (!hex) return false;
    
    // Must be empty
    if (hex.piece) return false;
    
    // Cannot be blocked by blocker tile
    if (hex.isBlocked) return false;
    
    // Cannot be initially impassable
    if (hex.isImpassable) return false;
    
    // Must allow initial deployment
    if (!hex.allowsInitialDeploy) return false;
    
    return true;
}

/**
 * Helper function to check win condition
 * @param {Object} gameState - the complete game state
 * @param {number} playerId - player to check win condition for
 * @returns {boolean} true if this player has won
 */
function checkWinCondition(gameState, playerId) {
    const opponentId = playerId === 1 ? 2 : 1;
    const opponent = gameState.players[opponentId];
    
    // Count opponent's regular tiles (on bench + on board)
    const regularTilesOnBench = opponent.bench.filter(p => p.type === 'regular').length;
    const regularTilesOnBoard = getPlayerPiecesOnBoard(gameState, opponentId)
        .filter(p => p.type === 'regular' || p.type === 'promoted').length;
    
    return (regularTilesOnBench + regularTilesOnBoard) === 0;
}