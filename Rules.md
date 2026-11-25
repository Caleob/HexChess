# HexChess — Game Rules

## Objective
Be the first player to eliminate all of your opponent's **Regular Tiles** (including Promoted Tiles) from both the board and their bench.

---

## Board & Setup

### The Board
- Played on a 37-hex hexagonal grid of **flat-top hexagons** arranged in 4–5–6–7–6–5–4 vertical columns.
- **Center Hex (Index 18):** Any Regular Tile that reaches this hex is immediately promoted. Pushers can never enter the Center Hex.
- **Safe Zone Ring:** The 6-hex ring immediately surrounding the Center Hex. Pieces on these hexes cannot be captured by normal movement (though they can still be pushed or crushed by Pushers).
- **Outer Rim:** The outermost ring of hexes on the board.

### Starting Position
- Each player starts with **6 pieces on their bench**:
  - **4 Regular Tiles**
  - **2 Pusher Tiles**
- **2 Neutral Pusher Tiles** start on the board at **2 opposing corners**. Either player may move a Neutral Pusher on their turn.

---

## Turn Structure
On your turn, perform **Step 2**, or **Step 1 followed by Step 2**:

1. **Pusher Action (Optional):**
   - **Place** a Pusher Tile from your bench onto any empty hex on the board (except the Center Hex), **OR**
   - **Move** one of your Pusher Tiles—or either Neutral Pusher Tile—1 hex in any of the 6 directions.
2. **Regular Action (Mandatory):**
   - **Place** a Regular Tile from your bench onto any empty hex on the **Outer Rim**, **OR**
   - **Move** one of your Regular or Promoted Tiles already on the board.

*If you have no legal Regular Action on your turn, the game ends in a **draw (stalemate)**.*

---

## Piece Types & Movement

### Regular Tiles
- **Movement:** Move 1 hex in any of the 6 directions onto an empty hex or an opponent's Regular/Promoted Tile (capturing it).
- **Restrictions:**
  - Cannot move onto a friendly piece or any Pusher Tile.
  - Cannot capture a piece standing on the Safe Zone Ring.
- **Promotion:** Automatically promotes upon reaching the **Center Hex** (either by moving there or being pushed there).

### Promoted Tiles
- **Movement:** Move any number of hexes in a straight line along any of the 6 hexagonal directions.
- **Restrictions:**
  - Cannot jump over any piece (friendly, opponent, or Pusher).
  - Cannot move onto a friendly piece or any Pusher Tile.
  - Cannot capture a piece standing on the Safe Zone Ring.

### Pusher Tiles
- **Movement:** Move 1 hex in any of the 6 directions.
  - Can move onto an empty hex, or into an occupied hex to **push** a straight line of adjacent Regular/Promoted Tiles (friendly or opponent) 1 hex in the same direction.
  - **Cannot enter the Center Hex.**
- **Pushing & Crushing:**
  - **Center Hex:** A Regular or Promoted Tile *can* be pushed into the Center Hex (and a Regular Tile promotes if it lands there).
  - **Board Edge:** Any Regular or Promoted Tile pushed off the edge of the board is **captured**.
  - **Pusher Collision (Crushing):** Pushers cannot be pushed, and moving a Pusher directly into an adjacent Pusher is illegal. If a pushed chain of tiles would push its end tile into another Pusher (`[Pusher] → [A] → [B] → [Other Pusher]`), that end tile (`B`) is **crushed (captured)**, the remaining tiles (`A`) and pushing Pusher advance 1 hex into the vacated space, and the stationary Pusher does not move.
  - **Safe Zone Override:** Pieces on the Safe Zone Ring *can* be pushed off the Safe Zone (where they can later be captured) or crushed against another Pusher.

---

## Capture, Victory & Draws
- **Capture:** Moving onto an opponent's Regular or Promoted Tile, pushing it off the board, or crushing it against a Pusher removes it from the board and marks it as captured on its owner's bench.
- **Center Hex Vulnerability:** The Center Hex is *not* a Safe Zone—pieces standing on it can be captured normally.
- **Victory & Self-Elimination:** Checked immediately after *any* action (including Step 1 Pusher moves). You win immediately when your opponent has **0 Regular/Promoted Tiles** remaining on the board and on their bench. Eliminating your own last Regular Tile is legal and causes an immediate loss. (Pusher Tiles cannot be captured and do not count toward victory.)
- **Draws:** The game ends in a draw on **Stalemate** (no legal Regular Action on your turn) OR after **30 consecutive full turns** (30 Blue + 30 Orange turns) with no placement or capture.
