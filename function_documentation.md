### **`GameState.js`**

This file manages the core data and rules of the game.

-----

#### **`gameState` Variable**

The global `gameState` object holds all current information about the game. It's initialized by `getBoardState()`.

```javascript
let gameState = {
    gameId: 'game_1672531200000',
    currentTurn: 1,
    turnCount: 0,
    gamePhase: 'active', // 'setup', 'active', 'ended'
    winner: null,
    board: [/* array of 37 hex objects */],
    players: {
        1: {
            bench: [/* array of piece objects */],
            captured: [],
            piecesOnBoard: []
        },
        2: {
            bench: [/* array of piece objects */],
            captured: [],
            piecesOnBoard: []
        }
    },
    lastMove: null,
    moveHistory: []
};
```

-----

#### **Core Functions**

  * **`createPiece(type, player, id = null)`**

      * Creates a piece object.
      * **`type`**: `'regular'`, `'blocker'`, or `'promoted'`.
      * **`player`**: `1` or `2`.
      * **Example**: `createPiece('regular', 1)`

  * **`createHex(index, properties = {})`**

      * Creates a hex object for the board.
      * **`index`**: `0-36`.
      * **`properties`**: `{isSafe, isCenter, isImpassable, allowsInitialDeploy}`.
      * **Example**: `createHex(11, { isSafe: true, allowsInitialDeploy: false })`

  * **`getBoardState()`**

      * Initializes and returns the entire `gameState` object with a standard board setup and pieces for both players.

  * **`findPieceById(gameState, pieceId)`**

      * Searches the entire `gameState` (board, benches, captured piles) to find a piece by its unique ID.

  * **`isValidMoveDestination(gameState, hexIndex, playerId)`**

      * Checks if a piece can legally move to a given hex. It returns `false` if the hex is impassable, occupied by a friendly piece, or a safe zone with an opponent's piece.

  * **`getPlayerPiecesOnBoard(gameState, playerId)`**

      * Returns an array of all pieces a specific player currently has on the main game board.

  * **`isValidPlacementHex(gameState, hexIndex)`**

      * Checks if a player can place a new piece from their bench onto a specific hex. The hex must be empty, not blocked, and allow initial deployment.

  * **`checkWinCondition(gameState, playerId)`**

      * Determines if the specified player has won by checking if their opponent has any regular or promoted pieces left on the board or bench.

### **`HexFunctions.js`**

This file handles rendering the game on HTML canvases and managing user clicks.

-----

#### **Drawing & Display Functions**

  * **`reDraw()`**

      * The main function to call when the game view needs updating. It adjusts the layout for screen size (`layout-tall` vs. `layout-wide`) and redraws all canvases.

  * **`drawBoard(canvasElement, board, scale = 1.0)`**

      * Draws the 37-hex game board onto the specified canvas using the `gameState.board` array.

  * **`drawBench(canvasElement, bench, scale, orientation)`**

      * Draws a player's bench on its canvas using the `gameState.players[#].bench` array.
      * **`orientation`**: `'horizontal'` or `'vertical'`.

  * **`getImageFileName(hexOrPiece)`**

      * Determines which image file to use for a given hex or piece based on its properties (e.g., player color, safe zone, blocker piece).

-----

#### **User Interaction**

  * **`handleClickOnCanvas(event, canvasId)`**

      * The primary click event listener for all canvases. It translates a mouse click into a specific hex number.

  * **`handleHexClick(canvasId, hexNum)`**

      * Processes the game logic for a clicked hex. For example, selecting a piece to move or choosing a destination.
      * **Example**: `handleHexClick('board-canvas', 18)` processes a click on the center hex.

  * **`setupMenuIcons()`**

      * Attaches click listeners to the menu icons (Concede, New Game, etc.).

### **`neighbors.js`**

This file is responsible for calculating which hexes are adjacent to one another.

-----

#### **`adjacency` Variable**

A globally available array that acts as an adjacency list for the game board. For any given hex index, you can find its neighbors.

  * **`adjacency[hexIndex]`**: Returns an object with keys for all six directions: `left`, `right`, `upperLeft`, `upperRight`, `lowerLeft`, and `lowerRight`. The value is the index of the neighboring hex or `null` if no neighbor exists in that direction.

**Example**:
To find the neighbors of **hex 7**:

```javascript
console.log(adjacency[7]);
/* Output:
{
  left: 6,
  right: 8,
  upperLeft: 1,
  upperRight: 2,
  lowerLeft: 13,
  lowerRight: 14
}
*/
```