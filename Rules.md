# HexChess - Game Rules

## Objective
Be the first player to eliminate all of your opponent's **Regular Tiles** from the board and their bench through capture.

## Game Setup

### Board Layout
- The game is played on a hexagonal grid containing 37 hexes arranged in concentric rings
- Hex arrangement: 4-5-6-7-6-5-4 hexes per row from top to bottom
- Special hexes include:
  - **Center Hex (Index 18):** Promotes Regular Tiles that reach it
  - **Safe Zones (Indices 11, 12, 24, 25):** Blue hexes where pieces cannot be captured
  - **Pre-set Impassable Hexes (Indices 17, 19):** Dark gray hexes that cannot be entered

### Starting Position
- Each player begins with 8 pieces on their bench:
  - **7 Regular Tiles** (green for Player 1, yellow for Player 2)
  - **1 Blocker Tile** (gray)
- Player 1 (Green) moves first

## Turn Structure
On your turn, choose one of the following actions:

1. **Place a Tile:** Take a piece from your bench and place it on a valid empty hex
2. **Move a Tile:** Move one of your pieces already on the board

**Special Rule:** If you place your Blocker Tile, your turn does not end immediately. You get to make one additional action (place another tile or move an existing piece).

## Piece Types and Movement

### Regular Tiles
- **Movement:** One hex to any adjacent empty hex, or to an adjacent hex occupied by an opponent's piece (to capture it)
- **Adjacent hexes:** The 6 neighboring hexes (right, left, up-right, up-left, down-right, down-left)
- **Restrictions:** Cannot move onto friendly-occupied hexes or impassable hexes
- **Promotion:** Automatically promoted when reaching the Center Hex (Index 18)

### Promoted Pieces
- **Appearance:** Regular Tiles with a darker inner hex marking
- **Movement:** Any number of hexes in a straight line along one of the 6 hexagonal directions
- **Capture:** Can capture opponent pieces by landing on their hex, provided the path is clear
- **Restrictions:** Cannot jump over any pieces (friendly or opponent) or impassable hexes

### Blocker Tiles
- **Placement Effect:** Makes the chosen hex permanently impassable for the remainder of the game
- **Restrictions:** Cannot be moved or captured once placed
- **Limitation:** Each player has only one Blocker Tile per game

## Placement Rules

### Valid Placement Hexes
Tiles from your bench can only be placed on hexes that are:
- Currently empty (no other piece present)
- In the outer two rings of the board (not the center hex or hexes directly surrounding it)
- Not a pre-set impassable hex (17, 19)
- Not a hex made impassable by a previously placed Blocker Tile

### Invalid Placement Hexes
You cannot place tiles on:
- The Center Hex (18)
- Safe Zone hexes (11, 12, 24, 25)
- Pre-set impassable hexes (17, 19)
- Hexes occupied by any piece
- Hexes made impassable by Blocker Tiles

## Capture Mechanics
- **How to Capture:** Move one of your pieces onto a hex occupied by an opponent's piece
- **Result:** The captured piece is removed from the board and marked as captured on the opponent's bench (appears smaller and gray)
- **Safe Zone Protection:** Pieces on Safe Zone hexes (11, 12, 24, 25) cannot be captured and cannot be moved onto by opponents

## Victory Conditions
You win when your opponent has zero Regular Tiles remaining that are either:
- Available on their bench, or
- Active on the board

**Note:** Blocker Tiles do not count toward victory conditions since they cannot be captured.

## Strategic Tips
- **Control the Center:** Reaching the center hex promotes your pieces, making them significantly more powerful
- **Use Your Blocker Wisely:** Blocker Tiles can create defensive barriers or trap opponent pieces, and placing one grants an extra move
- **Utilize Safe Zones:** Protect valuable pieces in Safe Zones, but remember your opponent can use them too
- **Monitor Captures:** Keep track of which pieces have been captured by observing both benches
- **Consider Sacrifices:** Sometimes losing a piece can lead to a better strategic position

## Quick Reference
- **Board Size:** 37 hexes in hexagonal arrangement
- **Starting Pieces:** 7 Regular Tiles + 1 Blocker Tile per player
- **Movement Directions:** 6 adjacent directions in hex grid
- **Special Hexes:** Center (promotes), Safe Zones (4 total), Impassable (2 pre-set)
- **Win Condition:** Eliminate all opponent Regular Tiles