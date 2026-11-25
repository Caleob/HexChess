# HexChess — Rule Variations & Design Brainstorming

This document captures candidate rule variations and multiplayer adaptations discussed for future playtesting and experimentation, benchmarked against the standard 2-player HexChess baseline.

---

## Baseline Reference (Standard 2-Player HexChess)

Measured across an 8,000-game color-balanced AI-vs-AI dataset (`generate_games.py`) and the 37-hex board (`game.js`):

- **Board & Pieces:** 37 hexes (radius 3); 14 max pieces (4 Regular + 2 Pushers per player, 2 Neutral Pushers = **38% board density**).
- **Branching Factor:** ~17.9 actions per atomic ply; **~318 combinations per full turn** (optional Pusher + mandatory Regular).
- **First-Move Fairness:** Blue **50.04%** vs. Orange **49.96%** ($p = 0.95$) — effectively zero first-move bias.
- **Decisiveness:** **97.9%** eliminations, **2.0%** 30-turn draws, **0.1%** stalemates.
- **Average Length:** ~44 turns between strong AIs (~17–28 turns in human/mixed matches).

---

## Part 1: 2-Player Rule Variations

### 1. Single-Action Turns ("One Move Per Turn")
- **Goal:** Simplify operation and reduce cognitive load / analysis paralysis.
- **Rule:** Instead of *optional Step 1 (Pusher) + mandatory Step 2 (Regular)*, each player takes **one** action per turn: either a Pusher action **or** a Regular action.
- **Effect:** Reduces per-turn branching factor from ~318 down to ~20–35, making turns brisk and closer to "Tic-Tac-Toe on steroids."
- **Trade-off / Safeguard:** Loses 1-turn push-then-capture combos. Pair with a simple anti-stall rule (e.g., cannot take two consecutive Pusher-only turns without moving/placing a Regular tile).

### 2. First to 3 Eliminations (Mercy Rule)
- **Goal:** Faster, punchier endgames without changing opening or midgame rules.
- **Rule:** Players still start with 4 Regular tiles each, but a player wins immediately upon eliminating **3** opponent Regular/Promoted tiles (reducing the opponent to 1).
- **Effect:** Eliminates slow 3-vs-1 chase endgames and most 30-turn draws.
- **Trade-off:** Removes rare "1 Promoted Queen vs. 3 Regulars" miracle comebacks.

### 3. Alternate Win Condition: "King of the Center"
- **Goal:** Add dramatic comeback potential and prevent passive play.
- **Rule:** Win by elimination **OR** by starting your turn with an already-**Promoted** tile still occupying the yellow Center hex (surviving one full opponent turn).
- **Effect:** Turns the Center hex into a high-stakes focal point where pushing an opponent off Center becomes a life-or-death tactical play.
- **Trade-off:** Needs playtesting to ensure Center rushes don't make games too short or overshadow elimination.

### 4. Restricted Pusher Drops
- **Goal:** Cleaner spatial readability; fewer "gotcha" bench drops.
- **Rule:** Bench Pushers may only be placed on empty hexes **not adjacent to an enemy Regular/Promoted tile** (or restricted to the **Inner Ring**).
- **Effect:** Shifts emphasis from scanning all 35 empty hexes for surprise drops to reading on-board Pusher positioning and movement.
- **Trade-off:** Slightly reduces early-game tactical volatility.

### 5. Neutral Pusher *Ko* Rule
- **Goal:** Eliminate repetitive back-and-forth Neutral Pusher tug-of-war loops.
- **Rule:** If your opponent moved a Neutral Pusher on the immediately preceding turn, you cannot move that *same* Neutral Pusher back to the hex it just came from on your turn.
- **Effect:** Forces forward board development and creative use of personal Pushers.
- **Trade-off:** Adds minor move-memory bookkeeping (trivial in software, slightly extra to track physically).

### 6. "HexChess Mini" (Radius-2 / 19-Hex Board)
- **Goal:** Ultra-fast 2–4 minute filler game.
- **Rule:** Shrink the board to 19 hexes (1 Center, 6 Safe Ring, 12 Outer Rim) with **3 Regulars + 1 Pusher** per player and 2 Neutral Pushers.
- **Effect:** Immediate piece contact from Turn 1 with zero dead space.
- **Trade-off:** Tighter boards can amplify first-move advantage (worth testing via headless simulation).

---

## Part 2: 3-Player Adaptations (Exploiting 6-Fold Board Symmetry)

The 37-hex board naturally supports 3-way symmetry (120° apart). Key design adjustments to preserve board density and solve classic 3-player issues (*turtling*, *2-on-1 dogpiles*, and *early player elimination*):

### Piece Count & Board Density
- **2-Player baseline:** 8 Regulars + 6 Pushers = 14 pieces (**38%** full).
- **3-Player (4 Regulars, 0 Neutral):** 12 Regulars + 6 Pushers = 18 pieces (**49%** full — cramped, chokes Promoted slides).
- **Recommended 3-Player count:** **3 Regular tiles per player** (9 total) + **6 Pushers total** = 15 pieces (**41%** full — closely matches 2-player feel).
  - **Pusher Option A (No Neutrals):** 2 personal Pushers per player, 0 Neutral Pushers.
  - **Pusher Option B (Symmetric Neutrals):** 1 personal Pusher per player + 3 Neutral Pushers starting on the 3 alternating outer corners (120° apart).

### Core 3-Player Rules to Prevent Turtling & Kingmaking
1. **Capture-Race Win Condition (Recommended):** First player to score **3 eliminations** (captures, edge push-offs, or crushes against *any* opponent) wins immediately. Rewards aggression, prevents passive Safe-Ring turtling, and eliminates sitting-out downtime.
2. **"Ghost Pushers" (If Using Last-Man-Standing):** When a player loses their last Regular tile, their remaining Pushers convert into **Neutral (Gray) Pushers**, seamlessly transitioning the final 1-v-1 showdown back into classic 2-player HexChess.
3. **Single-Action Turns (Optional for 3P):** Because each piece must survive *two* opponent turns before you act again, Single-Action turns (Pusher *or* Regular) help prevent unavoidable 2-on-1 single-round deletions.
4. **"Hunt Clockwise" (Anti-Gang-Up Variant):** Players only score victory points by eliminating the player to their **left** while defending against the player to their **right** (tactical pushing of any piece remains legal). Eliminates kingmaking and 2-vs-1 dogpiles.
5. **3-Fold Deployment Arcs (Optional Opening Symmetry):** Partition the 18-hex Outer Rim into three 6-hex arcs (120° apart)—one home arc per player for initial Regular deployment to prevent Turn 1 spawn-camping.

---

## Recommended Starting Prototypes

- **Lighter / Punchier 2-Player:** Combine **First to 3 Eliminations** + **King of the Center** (keeps exact core movement rules, removes endgame drag). For maximum simplicity, test **Single-Action Turns**.
- **First 3-Player Prototype:** **3 Regulars per player**, **6 Pushers total** (2 per player / 0 Neutral, or 1 per player + 3 Neutral at alternating corners), and **First to 3 Eliminations wins**.
