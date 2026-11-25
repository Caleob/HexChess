/**
 * HexChess — Core Rules Engine, 42-Element Compact State Codec, SVG Renderer & UI Controller
 */
(function () {
  'use strict';

  // ==================== 1. CONSTANTS & CANONICAL CUBIC GEOMETRY ====================

  const HEX_SIZE = 37;
  const SQRT3 = Math.sqrt(3);

  // Piece State Codes (3 bits: 0..7)
  const EMPTY = 0;
  const B_REG = 1;
  const B_PROMO = 2;
  const B_PUSH = 3;
  const O_REG = 4;
  const O_PROMO = 5;
  const O_PUSH = 6;
  const N_PUSH = 7;

  // Turn & Phase Codes (0..3) in compactState[41]
  // 0 = Blue (Pusher Optional), 1 = Blue (Regular Only), 2 = Orange (Pusher Optional), 3 = Orange (Regular Only)
  const PHASE_B_OPT = 0;
  const PHASE_B_REG = 1;
  const PHASE_O_OPT = 2;
  const PHASE_O_REG = 3;

  // 6 Unit Direction Vectors (Flat-Top Hexes)
  const DIRECTIONS = [
    { dq: 0, dr: -1, ds: 1, name: 'U' },
    { dq: 0, dr: 1, ds: -1, name: 'D' },
    { dq: 1, dr: -1, ds: 0, name: 'UR' },
    { dq: 1, dr: 0, ds: -1, name: 'DR' },
    { dq: -1, dr: 0, ds: 1, name: 'UL' },
    { dq: -1, dr: 1, ds: 0, name: 'DL' }
  ];

  // Canonical 0..36 Hex List: q = -3..+3 (left to right), r ascending (top to bottom)
  const CANONICAL_HEXES = [];
  const COORD_TO_IDX = new Map();

  for (let q = -3; q <= 3; q++) {
    for (let r = -3; r <= 3; r++) {
      const s = -q - r || 0;
      if (Math.abs(s) <= 3) {
        const idx = CANONICAL_HEXES.length;
        const dist = Math.max(Math.abs(q), Math.abs(r), Math.abs(s));
        const px = HEX_SIZE * (1.5 * q);
        const py = HEX_SIZE * ((SQRT3 / 2) * q + SQRT3 * r);
        const hex = { idx, q, r, s, dist, px, py };
        CANONICAL_HEXES.push(hex);
        COORD_TO_IDX.set(`${q},${r},${s}`, idx);
      }
    }
  }

  // Precompute neighbor index lookup table: NEIGHBORS[idx][dir] = targetIdx or -1 (off-board)
  const NEIGHBORS = CANONICAL_HEXES.map((h) =>
    DIRECTIONS.map((d) => {
      const nq = h.q + d.dq;
      const nr = h.r + d.dr;
      const ns = h.s + d.ds;
      const found = COORD_TO_IDX.get(`${nq},${nr},${ns}`);
      return found !== undefined ? found : -1;
    })
  );

  const CENTER_IDX = 18; // (0, 0, 0)
  const TOP_CORNER_IDX = 15; // (0, -3, 3)
  const BOTTOM_CORNER_IDX = 21; // (0, 3, -3)

  const OUTER_RIM_INDICES = CANONICAL_HEXES.filter((h) => h.dist === 3).map((h) => h.idx);
  const SAFE_RING_INDICES = CANONICAL_HEXES.filter((h) => h.dist === 1).map((h) => h.idx);
  const IS_SAFE_HEX = new Uint8Array(37);
  for (const idx of SAFE_RING_INDICES) IS_SAFE_HEX[idx] = 1;

  // Helper piece classifiers
  function isPusherCode(code) {
    return code === B_PUSH || code === O_PUSH || code === N_PUSH;
  }

  function isRegularOrPromoCode(code) {
    return code === B_REG || code === B_PROMO || code === O_REG || code === O_PROMO;
  }

  function pieceOwner(code) {
    if (code === B_REG || code === B_PROMO || code === B_PUSH) return 'blue';
    if (code === O_REG || code === O_PROMO || code === O_PUSH) return 'orange';
    if (code === N_PUSH) return 'neutral';
    return null;
  }

  function isPromotedCode(code) {
    return code === B_PROMO || code === O_PROMO;
  }

  function promoteCodeIfCenter(code, targetIdx) {
    if (targetIdx !== CENTER_IDX) return code;
    if (code === B_REG) return B_PROMO;
    if (code === O_REG) return O_PROMO;
    return code;
  }

  function activePlayerFromPhase(phaseCode) {
    return phaseCode < 2 ? 'blue' : 'orange';
  }

  function isPusherOptionalPhase(phaseCode) {
    return phaseCode === PHASE_B_OPT || phaseCode === PHASE_O_OPT;
  }

  // ==================== 2. COMPACT 42-ELEMENT STATE CODEC ====================

  function createInitialCompactState() {
    const state = new Array(42).fill(0);
    state[TOP_CORNER_IDX] = N_PUSH;
    state[BOTTOM_CORNER_IDX] = N_PUSH;
    // [bReg, bPush, oReg, oPush]
    state[37] = 4;
    state[38] = 2;
    state[39] = 4;
    state[40] = 2;
    // Turn & Phase: 0 = Blue (Pusher Optional)
    state[41] = PHASE_B_OPT;
    return state;
  }

  function encodeStateString(compactState) {
    let boardStr = '';
    for (let i = 0; i < 37; i++) boardStr += String(compactState[i]);
    const benchStr = `${compactState[37]}${compactState[38]}${compactState[39]}${compactState[40]}`;
    return `${boardStr}|${benchStr}|${compactState[41]}`;
  }

  function decodeStateString(str) {
    const parts = str.split('|');
    if (parts.length !== 3 || parts[0].length !== 37 || parts[1].length !== 4) {
      throw new Error('Invalid compact state string: ' + str);
    }
    const arr = new Array(42);
    for (let i = 0; i < 37; i++) arr[i] = Number(parts[0][i]);
    for (let j = 0; j < 4; j++) arr[37 + j] = Number(parts[1][j]);
    arr[41] = Number(parts[2]);
    return arr;
  }

  function getPieceCounts(compactState) {
    let bBoardReg = 0;
    let bBoardPromo = 0;
    let bBoardPush = 0;
    let oBoardReg = 0;
    let oBoardPromo = 0;
    let oBoardPush = 0;

    for (let i = 0; i < 37; i++) {
      const c = compactState[i];
      if (c === B_REG) bBoardReg++;
      else if (c === B_PROMO) bBoardPromo++;
      else if (c === B_PUSH) bBoardPush++;
      else if (c === O_REG) oBoardReg++;
      else if (c === O_PROMO) oBoardPromo++;
      else if (c === O_PUSH) oBoardPush++;
    }

    const bBenchReg = compactState[37];
    const bBenchPush = compactState[38];
    const oBenchReg = compactState[39];
    const oBenchPush = compactState[40];

    const bTotalAlive = bBenchReg + bBoardReg + bBoardPromo;
    const oTotalAlive = oBenchReg + oBoardReg + oBoardPromo;

    const bCaptured = Math.max(0, 4 - bTotalAlive);
    const oCaptured = Math.max(0, 4 - oTotalAlive);

    return {
      bBenchReg,
      bBenchPush,
      bBoardReg,
      bBoardPromo,
      bBoardPush,
      bTotalAlive,
      bCaptured,
      oBenchReg,
      oBenchPush,
      oBoardReg,
      oBoardPromo,
      oBoardPush,
      oTotalAlive,
      oCaptured
    };
  }

  // ==================== 3. PURE LEGAL MOVE GENERATION & TRANSITION ====================

  /**
   * Generates all legal Pusher actions for the active player in compactState.
   * Does NOT include SKIP_PUSHER (call getLegalActions for full atomic ply list).
   */
  function getLegalPusherActions(compactState) {
    const phase = compactState[41];
    if (!isPusherOptionalPhase(phase)) return [];

    const player = activePlayerFromPhase(phase);
    const benchPushIdx = player === 'blue' ? 38 : 40;
    const friendlyPushCode = player === 'blue' ? B_PUSH : O_PUSH;
    const actions = [];

    // 1. Place Pusher from bench onto any empty non-center hex
    if (compactState[benchPushIdx] > 0) {
      for (let idx = 0; idx < 37; idx++) {
        if (idx !== CENTER_IDX && compactState[idx] === EMPTY) {
          const h = CANONICAL_HEXES[idx];
          actions.push({
            type: 'PLACE_PUSHER',
            toIdx: idx,
            to: [h.q, h.r, h.s]
          });
        }
      }
    }

    // 2. Move friendly or neutral Pusher 1 hex in any direction
    for (let idx = 0; idx < 37; idx++) {
      const code = compactState[idx];
      if (code !== friendlyPushCode && code !== N_PUSH) continue;

      const fromHex = CANONICAL_HEXES[idx];
      const pusherOwner = code === N_PUSH ? 'neutral' : player;

      for (let dir = 0; dir < 6; dir++) {
        const adjIdx = NEIGHBORS[idx][dir];
        // Cannot step off board or onto Center Hex
        if (adjIdx === -1 || adjIdx === CENTER_IDX) continue;

        const adjCode = compactState[adjIdx];
        // Moving directly into an adjacent Pusher is illegal
        if (isPusherCode(adjCode)) continue;

        const toHex = CANONICAL_HEXES[adjIdx];
        actions.push({
          type: 'MOVE_PUSHER',
          fromIdx: idx,
          toIdx: adjIdx,
          dir,
          from: [fromHex.q, fromHex.r, fromHex.s],
          to: [toHex.q, toHex.r, toHex.s],
          pusherOwner
        });
      }
    }

    return actions;
  }

  /**
   * Generates all legal Regular actions for the active player in compactState.
   */
  function getLegalRegularActions(compactState) {
    const player = activePlayerFromPhase(compactState[41]);
    const benchRegIdx = player === 'blue' ? 37 : 39;
    const myReg = player === 'blue' ? B_REG : O_REG;
    const myPromo = player === 'blue' ? B_PROMO : O_PROMO;
    const oppReg = player === 'blue' ? O_REG : B_REG;
    const oppPromo = player === 'blue' ? O_PROMO : B_PROMO;

    const actions = [];

    // 1. Place Regular Tile from bench onto any empty Outer Rim hex
    if (compactState[benchRegIdx] > 0) {
      for (let i = 0; i < OUTER_RIM_INDICES.length; i++) {
        const idx = OUTER_RIM_INDICES[i];
        if (compactState[idx] === EMPTY) {
          const h = CANONICAL_HEXES[idx];
          actions.push({
            type: 'PLACE_REGULAR',
            toIdx: idx,
            to: [h.q, h.r, h.s]
          });
        }
      }
    }

    // 2. Move Regular or Promoted Tiles on the board
    for (let idx = 0; idx < 37; idx++) {
      const code = compactState[idx];
      if (code !== myReg && code !== myPromo) continue;

      const fromHex = CANONICAL_HEXES[idx];

      if (code === myReg) {
        // Regular moves 1 hex
        for (let dir = 0; dir < 6; dir++) {
          const adjIdx = NEIGHBORS[idx][dir];
          if (adjIdx === -1) continue;
          const targetCode = compactState[adjIdx];

          if (targetCode === EMPTY) {
            const toHex = CANONICAL_HEXES[adjIdx];
            actions.push({
              type: 'MOVE_REGULAR',
              fromIdx: idx,
              toIdx: adjIdx,
              from: [fromHex.q, fromHex.r, fromHex.s],
              to: [toHex.q, toHex.r, toHex.s],
              isCapture: false
            });
          } else if ((targetCode === oppReg || targetCode === oppPromo) && !IS_SAFE_HEX[adjIdx]) {
            const toHex = CANONICAL_HEXES[adjIdx];
            actions.push({
              type: 'MOVE_REGULAR',
              fromIdx: idx,
              toIdx: adjIdx,
              from: [fromHex.q, fromHex.r, fromHex.s],
              to: [toHex.q, toHex.r, toHex.s],
              isCapture: true
            });
          }
        }
      } else {
        // Promoted slides any number of unobstructed hexes in a straight line
        for (let dir = 0; dir < 6; dir++) {
          let currIdx = NEIGHBORS[idx][dir];
          while (currIdx !== -1) {
            const targetCode = compactState[currIdx];
            if (targetCode === EMPTY) {
              const toHex = CANONICAL_HEXES[currIdx];
              actions.push({
                type: 'MOVE_REGULAR',
                fromIdx: idx,
                toIdx: currIdx,
                from: [fromHex.q, fromHex.r, fromHex.s],
                to: [toHex.q, toHex.r, toHex.s],
                isCapture: false
              });
              currIdx = NEIGHBORS[currIdx][dir];
            } else {
              // Blocked by a piece; can capture if enemy Regular/Promo AND not on Safe Zone
              if ((targetCode === oppReg || targetCode === oppPromo) && !IS_SAFE_HEX[currIdx]) {
                const toHex = CANONICAL_HEXES[currIdx];
                actions.push({
                  type: 'MOVE_REGULAR',
                  fromIdx: idx,
                  toIdx: currIdx,
                  from: [fromHex.q, fromHex.r, fromHex.s],
                  to: [toHex.q, toHex.r, toHex.s],
                  isCapture: true
                });
              }
              break; // Cannot jump over any piece
            }
          }
        }
      }
    }

    return actions;
  }

  /**
   * Returns all legal atomic actions for the current compactState (used directly by AI & engine).
   * In Pusher Optional phases (0 or 2), includes SKIP_PUSHER + legal Pusher actions.
   * In Regular Only phases (1 or 3), returns legal Regular actions.
   */
  function getLegalAtomicActions(compactState) {
    const phase = compactState[41];
    if (isPusherOptionalPhase(phase)) {
      const pusherActs = getLegalPusherActions(compactState);
      return [{ type: 'SKIP_PUSHER' }, ...pusherActs];
    }
    return getLegalRegularActions(compactState);
  }

  /**
   * Applies an atomic action to compactState without mutating the input array.
   * Returns { nextState, events, animPlan, resetDrawClock }
   */
  function applyAtomicAction(compactState, action) {
    const next = compactState.slice();
    const phase = next[41];
    const player = activePlayerFromPhase(phase);
    const events = [];
    const animPlan = { slides: [], placement: null, edgeFall: null, crushed: null, captured: null, promotions: [] };
    let resetDrawClock = false;

    if (action.type === 'SKIP_PUSHER') {
      next[41] = player === 'blue' ? PHASE_B_REG : PHASE_O_REG;
      return { nextState: next, events, animPlan, resetDrawClock: false };
    }

    if (action.type === 'PLACE_PUSHER') {
      const benchIdx = player === 'blue' ? 38 : 40;
      const code = player === 'blue' ? B_PUSH : O_PUSH;
      next[benchIdx]--;
      next[action.toIdx] = code;
      next[41] = player === 'blue' ? PHASE_B_REG : PHASE_O_REG;
      resetDrawClock = true;
      animPlan.placement = { toIdx: action.toIdx, code, fromBench: player, slotType: 'pusher' };
      return { nextState: next, events, animPlan, resetDrawClock };
    }

    if (action.type === 'MOVE_PUSHER') {
      const fromIdx = action.fromIdx;
      const toIdx = action.toIdx;
      let dir = action.dir;
      if (dir === undefined) {
        dir = NEIGHBORS[fromIdx].indexOf(toIdx);
      }

      const pusherCode = next[fromIdx];
      next[fromIdx] = EMPTY;

      if (next[toIdx] === EMPTY) {
        // Simple 1-hex Pusher slide
        next[toIdx] = pusherCode;
        animPlan.slides.push({ fromIdx, toIdx, code: pusherCode });
      } else {
        // Chain Push! Collect contiguous line of Regular/Promoted tiles starting at toIdx
        const chain = [];
        let scanIdx = toIdx;
        while (scanIdx !== -1 && isRegularOrPromoCode(next[scanIdx])) {
          chain.push({ idx: scanIdx, code: next[scanIdx] });
          scanIdx = NEIGHBORS[scanIdx][dir];
        }

        // Clear all original chain cells first
        for (const item of chain) {
          next[item.idx] = EMPTY;
        }

        // Place pushing Pusher into toIdx
        next[toIdx] = pusherCode;
        animPlan.slides.push({ fromIdx, toIdx, code: pusherCode });

        // Determine fate of each tile in chain (especially the last tile)
        // scanIdx is the cell immediately beyond the last tile in the chain:
        // - scanIdx === -1 => last tile pushed off board edge!
        // - scanIdx !== -1 && isPusherCode(compactState[scanIdx]) => last tile crushed against stationary Pusher!
        // - scanIdx !== -1 && compactState[scanIdx] === EMPTY => entire chain shifts cleanly 1 hex!
        for (let i = 0; i < chain.length; i++) {
          const item = chain[i];
          const destIdx = NEIGHBORS[item.idx][dir];
          const isLast = i === chain.length - 1;

          if (isLast && destIdx === -1) {
            // Pushed off the edge of the board!
            const h = CANONICAL_HEXES[item.idx];
            const dVec = DIRECTIONS[dir];
            const offQ = h.q + dVec.dq;
            const offR = h.r + dVec.dr;
            resetDrawClock = true;
            events.push({
              type: 'EDGE_CAPTURE',
              owner: pieceOwner(item.code),
              from: [h.q, h.r, h.s]
            });
            animPlan.edgeFall = {
              fromIdx: item.idx,
              offQ,
              offR,
              code: item.code
            };
          } else if (isLast && isPusherCode(compactState[destIdx])) {
            // Crushed against stationary Pusher at destIdx!
            const h = CANONICAL_HEXES[item.idx];
            const anvilHex = CANONICAL_HEXES[destIdx];
            resetDrawClock = true;
            events.push({
              type: 'CRUSH_CAPTURE',
              owner: pieceOwner(item.code),
              at: [anvilHex.q, anvilHex.r, anvilHex.s]
            });
            animPlan.crushed = {
              fromIdx: item.idx,
              intoIdx: destIdx,
              code: item.code
            };
          } else {
            // Advances normally into destIdx
            const afterCode = promoteCodeIfCenter(item.code, destIdx);
            next[destIdx] = afterCode;
            animPlan.slides.push({ fromIdx: item.idx, toIdx: destIdx, code: item.code, afterCode });
            if (afterCode !== item.code) {
              const ch = CANONICAL_HEXES[destIdx];
              events.push({ type: 'PROMOTION', owner: pieceOwner(afterCode), at: [ch.q, ch.r, ch.s] });
              animPlan.promotions.push(destIdx);
            }
          }
        }
      }

      next[41] = player === 'blue' ? PHASE_B_REG : PHASE_O_REG;
      return { nextState: next, events, animPlan, resetDrawClock };
    }

    if (action.type === 'PLACE_REGULAR') {
      const benchIdx = player === 'blue' ? 37 : 39;
      const code = player === 'blue' ? B_REG : O_REG;
      next[benchIdx]--;
      next[action.toIdx] = code;
      next[41] = player === 'blue' ? PHASE_O_OPT : PHASE_B_OPT;
      resetDrawClock = true;
      animPlan.placement = { toIdx: action.toIdx, code, fromBench: player, slotType: 'regular' };
      return { nextState: next, events, animPlan, resetDrawClock };
    }

    if (action.type === 'MOVE_REGULAR') {
      const movingCode = next[action.fromIdx];
      const targetBefore = next[action.toIdx];
      next[action.fromIdx] = EMPTY;

      if (targetBefore !== EMPTY) {
        resetDrawClock = true;
        const th = CANONICAL_HEXES[action.toIdx];
        events.push({
          type: 'CAPTURE',
          owner: pieceOwner(targetBefore),
          at: [th.q, th.r, th.s]
        });
        animPlan.captured = { atIdx: action.toIdx, code: targetBefore };
      }

      const afterCode = promoteCodeIfCenter(movingCode, action.toIdx);
      next[action.toIdx] = afterCode;
      animPlan.slides.push({
        fromIdx: action.fromIdx,
        toIdx: action.toIdx,
        code: movingCode,
        afterCode
      });

      if (afterCode !== movingCode) {
        const ch = CANONICAL_HEXES[action.toIdx];
        events.push({ type: 'PROMOTION', owner: pieceOwner(afterCode), at: [ch.q, ch.r, ch.s] });
        animPlan.promotions.push(action.toIdx);
      }

      next[41] = player === 'blue' ? PHASE_O_OPT : PHASE_B_OPT;
      return { nextState: next, events, animPlan, resetDrawClock };
    }

    throw new Error('Unknown action type: ' + action.type);
  }

  /**
   * Evaluates terminal game-over state immediately after any action or at turn start.
   * Rules:
   * - Opponent has 0 Regular/Promoted tiles (bench + board) => active/surviving player wins.
   * - Self-elimination: if active player eliminated their own last Regular tile:
   *   Wait: what if a single push somehow only eliminates 1 tile at a time?
   *   In HexChess, at most 1 tile can be pushed off or crushed in a single move!
   *   Therefore bTotalAlive and oTotalAlive can never both hit 0 on the exact same action.
   * - Stalemate: at the start of a player's Regular decision (or start of turn if no legal Regular action
   *   exists even directly? Wait: what if a player at start of turn has no legal Regular action right now,
   *   could a Pusher move open up a Regular action? Let's check!)
   *   "On your turn, perform Step 2, or Step 1 followed by Step 2... If you have no legal Regular Action on your turn, the game ends in a draw (stalemate)."
   *   Checking both:
   *   - In PHASE_X_REG: if getLegalRegularActions(state).length === 0 => Stalemate!
   *   - In PHASE_X_OPT: if getLegalRegularActions(state).length === 0 AND no legal Pusher action leads to a state with >=1 legal Regular action (or leads to immediate win) => Stalemate!
   */
  function evaluateTerminal(compactState, halfTurnsWithoutProgress = 0) {
    const counts = getPieceCounts(compactState);

    if (counts.oTotalAlive === 0 && counts.bTotalAlive > 0) {
      return { over: true, winner: 'blue', reason: 'elimination' };
    }
    if (counts.bTotalAlive === 0 && counts.oTotalAlive > 0) {
      return { over: true, winner: 'orange', reason: 'elimination' };
    }
    if (counts.bTotalAlive === 0 && counts.oTotalAlive === 0) {
      return { over: true, winner: 'draw', reason: 'mutual_elimination' };
    }

    // 30 full turns = 60 player turns without placement or capture
    if (halfTurnsWithoutProgress >= 60) {
      return { over: true, winner: 'draw', reason: '30_turn_rule' };
    }

    const phase = compactState[41];
    if (!isPusherOptionalPhase(phase)) {
      if (getLegalRegularActions(compactState).length === 0) {
        return { over: true, winner: 'draw', reason: 'stalemate' };
      }
    } else {
      const regNow = getLegalRegularActions(compactState);
      if (regNow.length === 0) {
        // Check if any Pusher action either wins immediately or unlocks a legal Regular move
        const pushActs = getLegalPusherActions(compactState);
        let canProceed = false;
        for (let i = 0; i < pushActs.length; i++) {
          const { nextState } = applyAtomicAction(compactState, pushActs[i]);
          const nextCounts = getPieceCounts(nextState);
          if (nextCounts.bTotalAlive === 0 || nextCounts.oTotalAlive === 0) {
            canProceed = true;
            break;
          }
          if (getLegalRegularActions(nextState).length > 0) {
            canProceed = true;
            break;
          }
        }
        if (!canProceed) {
          return { over: true, winner: 'draw', reason: 'stalemate' };
        }
      }
    }

    return { over: false, winner: null, reason: null };
  }

  // Expose Pure Engine API globally so ai.js and tests can use exact rules without DOM dependencies
  window.HexChessEngine = {
    EMPTY,
    B_REG,
    B_PROMO,
    B_PUSH,
    O_REG,
    O_PROMO,
    O_PUSH,
    N_PUSH,
    PHASE_B_OPT,
    PHASE_B_REG,
    PHASE_O_OPT,
    PHASE_O_REG,
    CANONICAL_HEXES,
    DIRECTIONS,
    NEIGHBORS,
    CENTER_IDX,
    OUTER_RIM_INDICES,
    SAFE_RING_INDICES,
    IS_SAFE_HEX,
    createInitialCompactState,
    encodeStateString,
    decodeStateString,
    getPieceCounts,
    getLegalPusherActions,
    getLegalRegularActions,
    getLegalAtomicActions,
    applyAtomicAction,
    evaluateTerminal,
    activePlayerFromPhase,
    isPusherOptionalPhase,
    pieceOwner,
    isPusherCode,
    isRegularOrPromoCode,
    isPromotedCode
  };

  // If running in Node/headless environment without DOM, stop here cleanly
  if (typeof document === 'undefined') return;

  // ==================== 4. SYNTHESIZED TACTILE AUDIO ENGINE ====================

  class SoundFX {
    constructor() {
      this.enabled = true;
      this.ctx = null;
    }

    _ensureCtx() {
      if (!this.enabled) return null;
      if (!this.ctx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) this.ctx = new AudioCtx();
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return this.ctx;
    }

    playTone(freqStart, freqEnd, duration, type = 'sine', gainPeak = 0.08, delay = 0) {
      const ctx = this._ensureCtx();
      if (!ctx) return;
      const now = ctx.currentTime + delay;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freqStart, now);
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), now + duration);

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(gainPeak, now + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + duration + 0.02);
    }

    select() {
      this.playTone(520, 660, 0.06, 'sine', 0.045);
    }

    move() {
      this.playTone(300, 210, 0.09, 'triangle', 0.07);
    }

    place() {
      this.playTone(240, 380, 0.1, 'triangle', 0.075);
    }

    push() {
      this.playTone(170, 115, 0.14, 'sawtooth', 0.055);
      this.playTone(280, 220, 0.11, 'triangle', 0.06, 0.03);
    }

    capture() {
      this.playTone(420, 140, 0.18, 'sawtooth', 0.075);
    }

    spiralFall() {
      this.playTone(580, 85, 0.42, 'sine', 0.085);
    }

    promote() {
      this.playTone(523.25, 659.25, 0.14, 'sine', 0.07, 0);
      this.playTone(659.25, 783.99, 0.16, 'sine', 0.07, 0.09);
      this.playTone(783.99, 1046.5, 0.24, 'triangle', 0.08, 0.18);
    }

    victory() {
      const notes = [440, 554.37, 659.25, 880];
      notes.forEach((n, i) => this.playTone(n, n * 1.01, 0.24, 'triangle', 0.075, i * 0.09));
    }
  }

  const sfx = new SoundFX();

  // ==================== 4B. CLASSICAL-INSPIRED BACKGROUND MUSIC ENGINE ====================

  class ClassicalMusicPlayer {
    constructor() {
      this.enabled = true;
      this.trackId = 'baroque';
      this.ctx = null;
      this.masterGain = null;
      this.timer = null;
      this.stepIndex = 0;
      this.isPlaying = false;
      this.unlocked = false;

      // Helper: MIDI note to Hz
      const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

      // 3 distinct loopable classical-inspired compositions
      this.tracks = {
        // 1. Baroque Prelude in C Minor (Bach-inspired flowing arpeggios, 64 eighth-note steps)
        baroque: {
          stepMs: 245,
          waveLead: 'triangle',
          waveBass: 'sine',
          gainLead: 0.042,
          gainBass: 0.045,
          steps: [
            // Bar 1: Cm (C4 Eb4 G4 C5)
            [60, 48], [63], [67], [72], [67], [63], [67], [72],
            // Bar 2: Fm/C (C4 F4 Ab4 C5)
            [60, 48], [65], [68], [72], [68], [65], [68], [72],
            // Bar 3: G7/B (B3 D4 G4 B4)
            [59, 47], [62], [67], [71], [67], [62], [67], [71],
            // Bar 4: Cm (C4 Eb4 G4 C5)
            [60, 48], [63], [67], [72], [75], [72], [67], [63],
            // Bar 5: Ab (Ab3 C4 Eb4 Ab4)
            [56, 44], [60], [63], [68], [72], [68], [63], [60],
            // Bar 6: Fm (F3 Ab3 C4 F4)
            [53, 41], [56], [60], [65], [68], [65], [60], [56],
            // Bar 7: Ddim7 -> G7 (D4 F4 Ab4 B4 -> G4 B4 D5 F5)
            [62, 50], [65], [68], [71], [67, 43], [71], [74], [65],
            // Bar 8: Cm cadence (C4 Eb4 G4 C5)
            [60, 48], [63], [67], [72], [67], [63], [60], [55]
          ].map((arr) => arr.map(hz))
        },

        // 2. Nocturne in D Minor (Chopin/Satie-inspired gentle 3/4 waltz, 48 steps)
        nocturne: {
          stepMs: 360,
          waveLead: 'sine',
          waveBass: 'triangle',
          gainLead: 0.052,
          gainBass: 0.032,
          steps: [
            // Bar 1: Dm
            [74, 50], [57, 62], [65, 57], [77, 50], [57, 62], [76, 57],
            // Bar 2: Gm
            [74, 43], [55, 58], [70, 62], [72, 43], [55, 58], [70, 62],
            // Bar 3: A7
            [69, 45], [55, 61], [67, 55], [69, 45], [55, 61], [73, 55],
            // Bar 4: Dm
            [74, 50], [57, 62], [69, 57], [65, 50], [57, 62], [62, 57],
            // Bar 5: Bb
            [70, 46], [53, 58], [74, 62], [77, 46], [53, 58], [74, 62],
            // Bar 6: Gm
            [72, 43], [55, 58], [70, 62], [69, 43], [55, 58], [67, 62],
            // Bar 7: A7
            [69, 45], [55, 61], [64, 55], [67, 45], [55, 61], [61, 55],
            // Bar 8: Dm resolution
            [62, 50], [57, 62], [65, 57], [69, 50], [57, 62], [62, 57]
          ].map((arr) => arr.map(hz))
        },

        // 3. Royal Minuet in G Major (Mozart/Handel-inspired chamber minuet, 48 steps)
        minuet: {
          stepMs: 280,
          waveLead: 'triangle',
          waveBass: 'sine',
          gainLead: 0.04,
          gainBass: 0.04,
          steps: [
            // Bar 1: G
            [74, 43], [67], [69, 47], [71], [72, 50], [74],
            // Bar 2: G -> C
            [67, 43], [67], [76, 48], [72], [74, 50], [71],
            // Bar 3: D7
            [72, 50], [69], [66, 45], [69], [72, 50], [74],
            // Bar 4: G
            [71, 43], [67], [62, 47], [67], [71, 50], [74],
            // Bar 5: Em
            [76, 40], [71], [74, 43], [71], [72, 47], [69],
            // Bar 6: C -> Am
            [71, 48], [67], [69, 45], [64], [67, 48], [66],
            // Bar 7: D7
            [69, 50], [66], [62, 45], [66], [69, 50], [72],
            // Bar 8: G cadence
            [71, 43], [67], [62, 47], [67], [67, 43], []
          ].map((arr) => arr.map(hz))
        }
      };
    }

    _ensureCtx() {
      if (!this.ctx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return null;
        this.ctx = new AudioCtx();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.setValueAtTime(0.85, this.ctx.currentTime);
        this.masterGain.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return this.ctx;
    }

    unlockAndStartIfEnabled() {
      this.unlocked = true;
      if (this.enabled && !this.isPlaying) {
        this.start();
      }
    }

    _playVoice(freq, durationSec, type, peakGain) {
      if (!this.ctx || !this.masterGain) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const env = this.ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1650, now);
      filter.Q.setValueAtTime(0.7, now);

      env.gain.setValueAtTime(0.0001, now);
      env.gain.linearRampToValueAtTime(peakGain, now + 0.025);
      env.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);

      osc.connect(filter);
      filter.connect(env);
      env.connect(this.masterGain);

      osc.start(now);
      osc.stop(now + durationSec + 0.04);
    }

    _tick() {
      if (!this.enabled || !this.isPlaying) return;
      const track = this.tracks[this.trackId] || this.tracks.baroque;
      const notes = track.steps[this.stepIndex % track.steps.length];
      this.stepIndex = (this.stepIndex + 1) % track.steps.length;

      const dur = (track.stepMs / 1000) * 1.65;
      for (let i = 0; i < notes.length; i++) {
        const freq = notes[i];
        const isBass = freq < 210;
        this._playVoice(
          freq,
          isBass ? dur * 1.45 : dur,
          isBass ? track.waveBass : track.waveLead,
          isBass ? track.gainBass : track.gainLead
        );
      }
    }

    start() {
      if (!this.enabled) return;
      const ctx = this._ensureCtx();
      if (!ctx) return;
      this.stop();
      this.isPlaying = true;
      const track = this.tracks[this.trackId] || this.tracks.baroque;
      this._tick();
      this.timer = setInterval(() => this._tick(), track.stepMs);
    }

    stop() {
      this.isPlaying = false;
      if (this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
    }

    setEnabled(val) {
      this.enabled = Boolean(val);
      if (this.enabled) {
        if (this.unlocked) this.start();
      } else {
        this.stop();
      }
    }

    setTrack(trackId) {
      if (!this.tracks[trackId]) return;
      this.trackId = trackId;
      this.stepIndex = 0;
      if (this.enabled && this.unlocked) {
        this.start();
      }
    }
  }

  const music = new ClassicalMusicPlayer();

  // ==================== 5. SVG DRAWING HELPERS ====================

  const SVG_NS = 'http://www.w3.org/2000/svg';

  function svgEl(tag, attrs = {}) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) {
      el.setAttribute(k, String(v));
    }
    return el;
  }

  function hexPoints(cx, cy, radius, angleOffsetDeg = 0) {
    const pts = [];
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 180) * (60 * i + angleOffsetDeg);
      pts.push(`${(cx + radius * Math.cos(angle)).toFixed(2)},${(cy + radius * Math.sin(angle)).toFixed(2)}`);
    }
    return pts.join(' ');
  }

  function cubeToPixel(q, r, size = HEX_SIZE) {
    return {
      x: size * (1.5 * q),
      y: size * ((SQRT3 / 2) * q + SQRT3 * r)
    };
  }

  function zoneFillColor(dist) {
    if (dist === 0) return '#F7E600'; // Center Hex
    if (dist === 1) return '#AEE2EE'; // Safe Zone Ring
    if (dist === 2) return '#F4F6F9'; // Inner Ring
    return '#EAE0A8'; // Outer Rim
  }

  /**
   * Builds an SVG <g> representing a HexChess piece centered at (0,0),
   * transformed via translate(cx, cy) so animations can smoothly interpolate transforms!
   */
  function createPieceElement(code, cx, cy, size = HEX_SIZE * 0.74) {
    const g = svgEl('g', {
      transform: `translate(${cx.toFixed(2)}, ${cy.toFixed(2)})`,
      filter: 'url(#pieceShadow)'
    });

    const owner = pieceOwner(code);
    const isPush = isPusherCode(code);
    const isPromo = isPromotedCode(code);

    let baseFill = '#b0b7c3'; // Neutral / Pusher gray
    if (!isPush) {
      baseFill = owner === 'blue' ? '#3b82f6' : '#f59e0b';
    }

    // Main hexagonal tile body
    g.appendChild(
      svgEl('polygon', {
        points: hexPoints(0, 0, size),
        fill: baseFill,
        stroke: '#0f172a',
        'stroke-width': '2.4',
        'stroke-linejoin': 'round'
      })
    );

    // Subtle top highlight bevel
    g.appendChild(
      svgEl('polygon', {
        points: hexPoints(0, 0, size * 0.88),
        fill: 'none',
        stroke: 'rgba(255,255,255,0.22)',
        'stroke-width': '1.1'
      })
    );

    // Promoted double gold/white ring
    if (isPromo) {
      g.appendChild(
        svgEl('polygon', {
          class: 'promo-ring',
          points: hexPoints(0, 0, size * 0.75),
          fill: 'none',
          stroke: '#fef08a',
          'stroke-width': '2.8',
          'stroke-linejoin': 'round'
        })
      );
      g.appendChild(
        svgEl('polygon', {
          points: hexPoints(0, 0, size * 0.62),
          fill: 'none',
          stroke: '#ffffff',
          'stroke-width': '1.2',
          opacity: '0.85'
        })
      );
    }

    // Inner circle marker
    if (!isPush) {
      // Regular / Promoted inner circle
      g.appendChild(
        svgEl('circle', {
          cx: 0,
          cy: 0,
          r: (size * 0.27).toFixed(2),
          fill: owner === 'blue' ? '#93c5fd' : '#b45309',
          stroke: owner === 'blue' ? 'rgba(15,23,42,0.3)' : 'rgba(15,23,42,0.45)',
          'stroke-width': '1.2'
        })
      );
    } else if (owner !== 'neutral') {
      // Player Pusher colored inner circle
      g.appendChild(
        svgEl('circle', {
          cx: 0,
          cy: 0,
          r: (size * 0.37).toFixed(2),
          fill: owner === 'blue' ? '#3b82f6' : '#f59e0b',
          stroke: '#0f172a',
          'stroke-width': '1.8'
        })
      );
    }

    return g;
  }

  // ==================== 6. GAME CONTROLLER & UI STATE ====================

  const state = {
    gameId: '----',
    mode: 'pvai', // 'hotseat' | 'pvai' | 'aivai'
    aiTier: 'square', // 'triangle' | 'square' | 'pentagon' | 'hexagon'
    players: {
      blue: { type: 'human' },
      orange: { type: 'ai', agent: 'square' }
    },
    compact: createInitialCompactState(),
    initialStateStr: '',
    turnNumber: 1,
    halfTurnsWithoutProgress: 0, // 60 half-turns = 30 full turns without placement/capture
    history: [],
    result: null,
    lastAnalysis: null,
    isGameActive: false,
    isAnimating: false,
    aiTimer: null,
    matchToken: 0, // Cancels stale async callbacks on New Game

    // Replay Mode state
    replay: {
      active: false,
      frames: [], // [{ stateStr, label, turn, player, phase, tag }]
      index: 0,
      timer: null,
      meta: null
    },

    // Selection state for human interaction
    // { source: 'board', idx: number } | { source: 'bench', player: 'blue'|'orange', kind: 'regular'|'pusher' } | null
    selected: null,

    // Settings
    coordOverlay: 'none', // 'none' | 'cubic' | 'index'
    animSpeed: 'normal', // 'normal' | 'fast' | 'instant'
    aiSpeed: 'normal', // 'relaxed' | 'normal' | 'fast' | 'blitz'
    autoSave: false,
    recordsDirHandle: null,
    hasSavedCurrentGame: false
  };

  // DOM Elements
  const dom = {
    boardSvg: document.getElementById('boardSvg'),
    boardRotateGroup: document.getElementById('boardRotateGroup'),
    layerHexes: document.getElementById('layerHexes'),
    layerCoords: document.getElementById('layerCoords'),
    layerHighlights: document.getElementById('layerHighlights'),
    layerPieces: document.getElementById('layerPieces'),
    layerEffects: document.getElementById('layerEffects'),
    layerTargets: document.getElementById('layerTargets'),
    blueBenchSvg: document.getElementById('blueBenchSvg'),
    orangeBenchSvg: document.getElementById('orangeBenchSvg'),
    blueBenchSection: document.querySelector('.bench-blue'),
    orangeBenchSection: document.querySelector('.bench-orange'),
    bluePlayerTag: document.getElementById('bluePlayerTag'),
    orangePlayerTag: document.getElementById('orangePlayerTag'),
    ambientGlow: document.getElementById('ambientGlow'),
    statusPill: document.getElementById('statusPill'),
    statusMainText: document.getElementById('statusMainText'),
    statusSubText: document.getElementById('statusSubText'),
    gameCodeLabel: document.getElementById('gameCodeLabel'),

    // Replay bar
    replayBar: document.getElementById('replayBar'),
    btnReplayStart: document.getElementById('btnReplayStart'),
    btnReplayPrev: document.getElementById('btnReplayPrev'),
    btnReplayPlay: document.getElementById('btnReplayPlay'),
    btnReplayNext: document.getElementById('btnReplayNext'),
    btnReplayEnd: document.getElementById('btnReplayEnd'),
    replaySlider: document.getElementById('replaySlider'),
    replayStepLabel: document.getElementById('replayStepLabel'),
    replayMoveInfo: document.getElementById('replayMoveInfo'),
    btnExitReplay: document.getElementById('btnExitReplay'),

    // Sidebar & Quick buttons
    btnResign: document.getElementById('btnResign'),
    btnRules: document.getElementById('btnRules'),
    btnSettings: document.getElementById('btnSettings'),
    btnMusicQuick: document.getElementById('btnMusicQuick'),
    iconMusicOn: document.getElementById('iconMusicOn'),
    iconMusicOff: document.getElementById('iconMusicOff'),
    btnSoundQuick: document.getElementById('btnSoundQuick'),
    iconSoundOn: document.getElementById('iconSoundOn'),
    iconSoundOff: document.getElementById('iconSoundOff'),

    // Modals
    modalNewGame: document.getElementById('modalNewGame'),
    btnCloseNewGame: document.getElementById('btnCloseNewGame'),
    modeSelector: document.getElementById('modeSelector'),
    aiTierGroup: document.getElementById('aiTierGroup'),
    tierSelector: document.getElementById('tierSelector'),
    btnReplaySaved: document.getElementById('btnReplaySaved'),
    replayFileInput: document.getElementById('replayFileInput'),
    replayErrorMsg: document.getElementById('replayErrorMsg'),
    btnStartGame: document.getElementById('btnStartGame'),

    modalRules: document.getElementById('modalRules'),
    modalResign: document.getElementById('modalResign'),
    resignPromptText: document.getElementById('resignPromptText'),
    btnConfirmResign: document.getElementById('btnConfirmResign'),

    modalSettings: document.getElementById('modalSettings'),
    selCoordOverlay: document.getElementById('selCoordOverlay'),
    selAnimSpeed: document.getElementById('selAnimSpeed'),
    selAiSpeed: document.getElementById('selAiSpeed'),
    chkSound: document.getElementById('chkSound'),
    chkMusic: document.getElementById('chkMusic'),
    selMusicTrack: document.getElementById('selMusicTrack'),
    chkAutoSave: document.getElementById('chkAutoSave'),
    btnPickFolder: document.getElementById('btnPickFolder'),
    folderStatusText: document.getElementById('folderStatusText'),

    modalGameOver: document.getElementById('modalGameOver'),
    gameOverBadge: document.getElementById('gameOverBadge'),
    gameOverTitle: document.getElementById('gameOverTitle'),
    gameOverReason: document.getElementById('gameOverReason'),
    statTurns: document.getElementById('statTurns'),
    statPlies: document.getElementById('statPlies'),
    statGameId: document.getElementById('statGameId'),
    statBlueAcc: document.getElementById('statBlueAcc'),
    statOrangeAcc: document.getElementById('statOrangeAcc'),
    saveFeedback: document.getElementById('saveFeedback'),
    btnSaveRecord: document.getElementById('btnSaveRecord'),
    btnPlayAgain: document.getElementById('btnPlayAgain')
  };

  function generateGameId() {
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    let id = '';
    for (let i = 0; i < 4; i++) {
      id += chars[Math.floor(Math.random() * chars.length)];
    }
    return id;
  }

  function getAnimDuration(baseMs) {
    if (state.animSpeed === 'instant') return Math.min(35, baseMs * 0.12);
    if (state.animSpeed === 'fast') return baseMs * 0.55;
    return baseMs;
  }

  function getAiStepDelayMs() {
    if (state.aiSpeed === 'relaxed') return 750;
    if (state.aiSpeed === 'fast') return 160;
    if (state.aiSpeed === 'blitz') return 40;
    return 420;
  }

  function isHumanTurnNow() {
    if (state.replay.active || !state.isGameActive || state.result) return false;
    const active = activePlayerFromPhase(state.compact[41]);
    return state.players[active].type === 'human';
  }

  // ==================== 7. BOARD & BENCH STATIC/DYNAMIC RENDERING ====================

  const mobileMediaQuery = window.matchMedia('(max-width: 768px), (max-width: 900px) and (orientation: portrait)');

  function isMobileLayout() {
    return mobileMediaQuery.matches;
  }

  function applyResponsiveBoardOrientation() {
    const mobile = isMobileLayout();
    if (mobile) {
      dom.boardSvg.setAttribute('viewBox', '-232 -214 464 428');
      if (dom.boardRotateGroup) dom.boardRotateGroup.setAttribute('transform', 'rotate(90)');
    } else {
      dom.boardSvg.setAttribute('viewBox', '-238 -238 476 476');
      if (dom.boardRotateGroup) dom.boardRotateGroup.removeAttribute('transform');
    }
    renderStaticBoardHexes();
    renderCoordinateOverlay();
    renderBenches();
  }

  function renderStaticBoardHexes() {
    dom.layerHexes.innerHTML = '';
    const mobile = isMobileLayout();

    for (const h of CANONICAL_HEXES) {
      const cellGroup = svgEl('g', {
        class: 'hex-cell',
        'data-idx': h.idx
      });

      const poly = svgEl('polygon', {
        points: hexPoints(h.px, h.py, HEX_SIZE - 1.1),
        fill: zoneFillColor(h.dist),
        stroke: '#0b1326',
        'stroke-width': '2.6',
        'stroke-linejoin': 'round'
      });
      cellGroup.appendChild(poly);

      // Faint shield icon on Safe Zone Ring (d === 1)
      if (h.dist === 1) {
        const shieldAttrs = {
          d: `M ${h.px} ${h.py - 8.5}
              L ${h.px + 7} ${h.py - 5.5}
              L ${h.px + 7} ${h.py + 0.5}
              C ${h.px + 7} ${h.py + 5.5}, ${h.px + 3.5} ${h.py + 8.5}, ${h.px} ${h.py + 10.2}
              C ${h.px - 3.5} ${h.py + 8.5}, ${h.px - 7} ${h.py + 5.5}, ${h.px - 7} ${h.py + 0.5}
              L ${h.px - 7} ${h.py - 5.5} Z`,
          fill: 'none',
          stroke: '#a855f7',
          'stroke-width': '1.35',
          opacity: '0.36',
          'pointer-events': 'none'
        };
        if (mobile) {
          shieldAttrs.transform = `rotate(-90, ${h.px}, ${h.py})`;
        }
        const shieldPath = svgEl('path', shieldAttrs);
        cellGroup.appendChild(shieldPath);
      }

      cellGroup.addEventListener('click', (e) => {
        e.stopPropagation();
        onHexLeftClick(h.idx);
      });

      cellGroup.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        onHexRightClick(h.idx);
      });

      dom.layerHexes.appendChild(cellGroup);
    }
  }

  function renderCoordinateOverlay() {
    dom.layerCoords.innerHTML = '';
    if (state.coordOverlay === 'none') return;
    const mobile = isMobileLayout();

    for (const h of CANONICAL_HEXES) {
      const label = state.coordOverlay === 'index' ? String(h.idx) : `${h.q},${h.r},${h.s}`;
      const txtAttrs = {
        x: h.px,
        y: h.py + 22,
        'text-anchor': 'middle',
        'font-size': state.coordOverlay === 'index' ? '9.5' : '8.2',
        'font-weight': '700',
        fill: '#1e293b',
        opacity: '0.72',
        'pointer-events': 'none'
      };
      if (mobile) {
        txtAttrs.transform = `rotate(-90, ${h.px}, ${h.py})`;
      }
      const txt = svgEl('text', txtAttrs);
      txt.textContent = label;
      dom.layerCoords.appendChild(txt);
    }
  }

  function renderBenches() {
    const counts = getPieceCounts(state.compact);
    renderSingleBench(dom.blueBenchSvg, 'blue', counts.bBenchReg, counts.bCaptured, counts.bBenchPush);
    renderSingleBench(dom.orangeBenchSvg, 'orange', counts.oBenchReg, counts.oCaptured, counts.oBenchPush);

    const active = activePlayerFromPhase(state.compact[41]);
    dom.blueBenchSection.classList.toggle('active-bench', state.isGameActive && !state.result && active === 'blue');
    dom.orangeBenchSection.classList.toggle('active-bench', state.isGameActive && !state.result && active === 'orange');

    // Update bench tags based on mode / replay
    if (state.replay.active && state.replay.meta) {
      dom.bluePlayerTag.textContent = `BLUE (${state.replay.meta.blueLabel})`;
      dom.orangePlayerTag.textContent = `ORANGE (${state.replay.meta.orangeLabel})`;
    } else if (state.mode === 'pvai') {
      const tierUpper = String(state.aiTier || 'square').toUpperCase();
      dom.bluePlayerTag.textContent = state.players.blue.type === 'human' ? 'BLUE (YOU)' : `BLUE (${tierUpper})`;
      dom.orangePlayerTag.textContent = state.players.orange.type === 'human' ? 'ORANGE (YOU)' : `ORANGE (${tierUpper})`;
    } else if (state.mode === 'aivai') {
      const tierUpper = String(state.aiTier || 'square').toUpperCase();
      dom.bluePlayerTag.textContent = `BLUE (${tierUpper})`;
      dom.orangePlayerTag.textContent = `ORANGE (${tierUpper})`;
    } else {
      dom.bluePlayerTag.textContent = 'BLUE';
      dom.orangePlayerTag.textContent = 'ORANGE';
    }
  }

  /**
   * Renders 6 hex slots on a player's bench (vertical on desktop, horizontal on mobile):
   * First 4 slots: Regular Tiles (Deployed -> Available -> Captured)
   * Divider line
   * Last 2 slots: Pusher Tiles (Available -> Deployed)
   */
  function renderSingleBench(svg, player, availReg, capturedReg, availPush) {
    svg.innerHTML = '';
    const horizontal = isMobileLayout();
    svg.setAttribute('viewBox', horizontal ? '0 0 384 64' : '0 0 80 390');

    const slotSize = horizontal ? 24 : 26;
    const hexAngle = horizontal ? 30 : 0;
    const regCoords = horizontal
      ? [
          [32, 32],
          [86, 32],
          [140, 32],
          [194, 32]
        ]
      : [
          [40, 34],
          [40, 88],
          [40, 142],
          [40, 196]
        ];
    const pushCoords = horizontal
      ? [
          [280, 32],
          [340, 32]
        ]
      : [
          [40, 282],
          [40, 342]
        ];

    const deployedReg = Math.max(0, 4 - availReg - capturedReg);
    const activePlayer = activePlayerFromPhase(state.compact[41]);
    const canInteract = isHumanTurnNow() && activePlayer === player && !state.isAnimating;

    // Order matching HexChessBoard.png aesthetics:
    // Deployed slots first, Available bright slots next, Captured slots at end of Regular section
    const regStates = [];
    for (let i = 0; i < deployedReg; i++) regStates.push('deployed');
    for (let i = 0; i < availReg; i++) regStates.push('available');
    for (let i = 0; i < capturedReg; i++) regStates.push('captured');

    const baseColor = player === 'blue' ? '#3b82f6' : '#d97706';
    const outlineColor = player === 'blue' ? 'rgba(96, 165, 250, 0.5)' : 'rgba(245, 158, 11, 0.5)';
    const isRegSelected =
      state.selected &&
      state.selected.source === 'bench' &&
      state.selected.player === player &&
      state.selected.kind === 'regular';

    let highlightedOneReg = false;

    regStates.forEach((slotState, idx) => {
      const [cx, cy] = regCoords[idx];
      const g = svgEl('g');

      if (slotState === 'available') {
        if (canInteract) g.setAttribute('class', 'bench-slot-interactive');

        // Selection glow on the first available bench regular slot
        if (isRegSelected && !highlightedOneReg) {
          highlightedOneReg = true;
          g.appendChild(
            svgEl('polygon', {
              points: hexPoints(cx, cy, slotSize + 5, hexAngle),
              fill: 'none',
              stroke: player === 'blue' ? '#93c5fd' : '#fde047',
              'stroke-width': '3',
              class: 'selected-pulse'
            })
          );
        }

        g.appendChild(
          svgEl('polygon', {
            points: hexPoints(cx, cy, slotSize, hexAngle),
            fill: baseColor,
            stroke: '#090f1f',
            'stroke-width': '2'
          })
        );
        g.appendChild(
          svgEl('circle', {
            cx,
            cy,
            r: (slotSize * 0.27).toFixed(1),
            fill: player === 'blue' ? '#93c5fd' : '#92400e',
            opacity: '0.9'
          })
        );

        if (canInteract) {
          g.addEventListener('click', (e) => {
            e.stopPropagation();
            onBenchSlotClick(player, 'regular');
          });
        }
      } else if (slotState === 'deployed') {
        // Empty dark outlined hex
        g.appendChild(
          svgEl('polygon', {
            points: hexPoints(cx, cy, slotSize, hexAngle),
            fill: '#040711',
            stroke: outlineColor,
            'stroke-width': '1.4'
          })
        );
      } else if (slotState === 'captured') {
        // Smaller dim colored hex with subtle red x
        const capSize = slotSize * 0.74;
        g.appendChild(
          svgEl('polygon', {
            points: hexPoints(cx, cy, capSize, hexAngle),
            fill: baseColor,
            opacity: '0.28',
            stroke: 'rgba(239, 68, 68, 0.55)',
            'stroke-width': '1.4'
          })
        );
        const d = 5.5;
        g.appendChild(
          svgEl('line', {
            x1: cx - d,
            y1: cy - d,
            x2: cx + d,
            y2: cy + d,
            stroke: '#ef4444',
            'stroke-width': '2.3',
            'stroke-linecap': 'round'
          })
        );
        g.appendChild(
          svgEl('line', {
            x1: cx + d,
            y1: cy - d,
            x2: cx - d,
            y2: cy + d,
            stroke: '#ef4444',
            'stroke-width': '2.3',
            'stroke-linecap': 'round'
          })
        );
      }

      svg.appendChild(g);
    });

    // Divider Line (horizontal in vertical bench, vertical in horizontal bench)
    svg.appendChild(
      svgEl(
        'line',
        horizontal
          ? {
              x1: 237,
              y1: 14,
              x2: 237,
              y2: 50,
              stroke: 'rgba(255, 255, 255, 0.14)',
              'stroke-width': '1.6',
              'stroke-linecap': 'round'
            }
          : {
              x1: 22,
              y1: 238,
              x2: 58,
              y2: 238,
              stroke: 'rgba(255, 255, 255, 0.14)',
              'stroke-width': '1.6',
              'stroke-linecap': 'round'
            }
      )
    );

    // Last 2 Pusher Slots
    const canUsePusherPhase = canInteract && isPusherOptionalPhase(state.compact[41]);
    const isPushSelected =
      state.selected &&
      state.selected.source === 'bench' &&
      state.selected.player === player &&
      state.selected.kind === 'pusher';

    let highlightedOnePush = false;
    const pushStates = [];
    for (let i = 0; i < availPush; i++) pushStates.push('available');
    for (let i = 0; i < 2 - availPush; i++) pushStates.push('deployed');

    pushStates.forEach((slotState, idx) => {
      const [cx, cy] = pushCoords[idx];
      const g = svgEl('g');

      if (slotState === 'available') {
        if (canUsePusherPhase) g.setAttribute('class', 'bench-slot-interactive');

        if (isPushSelected && !highlightedOnePush) {
          highlightedOnePush = true;
          g.appendChild(
            svgEl('polygon', {
              points: hexPoints(cx, cy, slotSize + 5, hexAngle),
              fill: 'none',
              stroke: player === 'blue' ? '#93c5fd' : '#fde047',
              'stroke-width': '3',
              class: 'selected-pulse'
            })
          );
        }

        g.appendChild(
          svgEl('polygon', {
            points: hexPoints(cx, cy, slotSize, hexAngle),
            fill: '#6b7280',
            stroke: '#090f1f',
            'stroke-width': '2',
            opacity: canInteract && !isPusherOptionalPhase(state.compact[41]) ? '0.45' : '1'
          })
        );
        g.appendChild(
          svgEl('circle', {
            cx,
            cy,
            r: (slotSize * 0.34).toFixed(1),
            fill: player === 'blue' ? '#3b82f6' : '#f59e0b',
            stroke: '#0f172a',
            'stroke-width': '1.3',
            opacity: canInteract && !isPusherOptionalPhase(state.compact[41]) ? '0.45' : '1'
          })
        );

        if (canUsePusherPhase) {
          g.addEventListener('click', (e) => {
            e.stopPropagation();
            onBenchSlotClick(player, 'pusher');
          });
        }
      } else {
        g.appendChild(
          svgEl('polygon', {
            points: hexPoints(cx, cy, slotSize, hexAngle),
            fill: '#040711',
            stroke: outlineColor,
            'stroke-width': '1.4'
          })
        );
      }

      svg.appendChild(g);
    });
  }

  /**
   * Renders all pieces currently on the 37-hex board plus selection highlights & legal target indicators.
   */
  function renderBoardPiecesAndTargets() {
    dom.layerHighlights.innerHTML = '';
    dom.layerPieces.innerHTML = '';
    dom.layerTargets.innerHTML = '';

    const activePlayer = activePlayerFromPhase(state.compact[41]);
    const humanTurn = isHumanTurnNow() && !state.isAnimating;
    const legalForSelection = humanTurn && state.selected ? getActionsForSelection(state.selected) : [];

    // Highlight selected board hex
    if (humanTurn && state.selected && state.selected.source === 'board') {
      const sh = CANONICAL_HEXES[state.selected.idx];
      dom.layerHighlights.appendChild(
        svgEl('polygon', {
          points: hexPoints(sh.px, sh.py, HEX_SIZE - 2.5),
          fill: activePlayer === 'blue' ? 'rgba(59, 130, 246, 0.25)' : 'rgba(245, 158, 11, 0.25)',
          stroke: activePlayer === 'blue' ? '#60a5fa' : '#fbbf24',
          'stroke-width': '3.6',
          class: 'selected-pulse',
          'pointer-events': 'none'
        })
      );
    }

    // Draw pieces on board
    for (let idx = 0; idx < 37; idx++) {
      const code = state.compact[idx];
      if (code === EMPTY) continue;
      const h = CANONICAL_HEXES[idx];
      const pieceEl = createPieceElement(code, h.px, h.py);
      pieceEl.setAttribute('data-idx', String(idx));

      // Determine if clicking this piece is interactive
      if (humanTurn && canSelectBoardPiece(idx) && !isTargetHexInList(idx, legalForSelection)) {
        pieceEl.classList.add('piece-clickable');
      }

      pieceEl.addEventListener('click', (e) => {
        e.stopPropagation();
        onHexLeftClick(idx);
      });

      pieceEl.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        onHexRightClick(idx);
      });

      dom.layerPieces.appendChild(pieceEl);
    }

    // Draw legal destination targets & capture/push rings
    for (const act of legalForSelection) {
      const targetIdx = act.toIdx;
      const th = CANONICAL_HEXES[targetIdx];
      const targetGroup = svgEl('g', { class: 'hex-target' });

      // Invisible full-hex hit polygon so clicking anywhere in target hex works seamlessly
      targetGroup.appendChild(
        svgEl('polygon', {
          points: hexPoints(th.px, th.py, HEX_SIZE - 1.5),
          fill: 'transparent'
        })
      );

      const occupant = state.compact[targetIdx];

      if (act.type === 'MOVE_REGULAR' && act.isCapture) {
        // Opponent capture target: distinct red ring!
        targetGroup.appendChild(
          svgEl('polygon', {
            class: 'target-ring',
            points: hexPoints(th.px, th.py, HEX_SIZE - 4),
            fill: 'rgba(239, 68, 68, 0.16)',
            stroke: '#ef4444',
            'stroke-width': '3.4'
          })
        );
      } else if (act.type === 'MOVE_PUSHER' && occupant !== EMPTY) {
        // Push target (occupied by friendly or enemy Regular/Promoted tile): directional push ring!
        const willKill = previewPushCausesCapture(state.compact, act);
        targetGroup.appendChild(
          svgEl('polygon', {
            class: 'target-ring',
            points: hexPoints(th.px, th.py, HEX_SIZE - 4),
            fill: willKill ? 'rgba(239, 68, 68, 0.18)' : 'rgba(168, 85, 247, 0.18)',
            stroke: willKill ? '#ef4444' : '#c084fc',
            'stroke-width': '3.2',
            'stroke-dasharray': '6 3'
          })
        );
      } else {
        // Empty valid destination: subtle glowing dot + soft border
        const dotColor = activePlayer === 'blue' ? '#2563eb' : '#d97706';
        targetGroup.appendChild(
          svgEl('polygon', {
            points: hexPoints(th.px, th.py, HEX_SIZE - 3.5),
            fill: activePlayer === 'blue' ? 'rgba(59, 130, 246, 0.10)' : 'rgba(245, 158, 11, 0.12)',
            stroke: activePlayer === 'blue' ? 'rgba(37, 99, 235, 0.42)' : 'rgba(217, 119, 6, 0.45)',
            'stroke-width': '1.8'
          })
        );
        targetGroup.appendChild(
          svgEl('circle', {
            class: 'target-dot',
            cx: th.px,
            cy: th.py,
            r: '7.2',
            fill: dotColor,
            opacity: '0.82',
            stroke: '#ffffff',
            'stroke-width': '1.5'
          })
        );
      }

      targetGroup.addEventListener('click', (e) => {
        e.stopPropagation();
        executeHumanAction(act);
      });

      targetGroup.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        onHexRightClick(targetIdx);
      });

      dom.layerTargets.appendChild(targetGroup);
    }
  }

  function previewPushCausesCapture(compactState, pushAction) {
    let scanIdx = pushAction.toIdx;
    const dir = pushAction.dir;
    while (scanIdx !== -1 && isRegularOrPromoCode(compactState[scanIdx])) {
      const nextIdx = NEIGHBORS[scanIdx][dir];
      if (nextIdx === -1 || isPusherCode(compactState[nextIdx])) return true;
      scanIdx = nextIdx;
    }
    return false;
  }

  function isTargetHexInList(idx, actions) {
    for (let i = 0; i < actions.length; i++) {
      if (actions[i].toIdx === idx) return true;
    }
    return false;
  }

  function updateStatusAndGlow() {
    const phase = state.compact[41];
    const active = activePlayerFromPhase(phase);
    const isOpt = isPusherOptionalPhase(phase);

    dom.ambientGlow.className = `ambient-glow ${active}`;
    dom.statusPill.className = `status-pill ${active}-turn`;

    if (state.result) {
      if (state.result.winner === 'draw') {
        dom.statusMainText.textContent = 'Game Drawn';
      } else {
        const wName = state.result.winner === 'blue' ? 'Blue' : 'Orange';
        dom.statusMainText.textContent = `${wName} Wins!`;
      }
      dom.statusSubText.textContent = formatReasonText(state.result.reason);
      return;
    }

    const pName = active === 'blue' ? 'Blue' : 'Orange';
    const isAi = state.players[active].type === 'ai';
    dom.statusMainText.textContent = isAi ? `${pName} AI Thinking...` : `${pName}'s Turn!`;

    if (isOpt) {
      dom.statusSubText.textContent = 'Pusher or Standard Move';
    } else {
      dom.statusSubText.textContent = 'Standard Move';
    }
  }

  function renderAll() {
    renderBenches();
    renderBoardPiecesAndTargets();
    updateStatusAndGlow();
  }

  // ==================== 8. SELECTION & HUMAN INPUT DISAMBIGUATION ====================

  function canSelectBoardPiece(idx) {
    const code = state.compact[idx];
    if (code === EMPTY) return false;
    const phase = state.compact[41];
    const active = activePlayerFromPhase(phase);

    if (isPusherCode(code)) {
      if (!isPusherOptionalPhase(phase)) return false;
      const owner = pieceOwner(code);
      return owner === active || owner === 'neutral';
    }

    // Regular or Promoted piece can be selected in BOTH Step 1 (implicit Pusher skip!) and Step 2
    return pieceOwner(code) === active;
  }

  function getActionsForSelection(sel) {
    if (!sel) return [];
    const phase = state.compact[41];

    if (sel.source === 'bench') {
      if (sel.kind === 'pusher') {
        if (!isPusherOptionalPhase(phase)) return [];
        return getLegalPusherActions(state.compact).filter((a) => a.type === 'PLACE_PUSHER');
      }
      if (sel.kind === 'regular') {
        return getLegalRegularActions(state.compact).filter((a) => a.type === 'PLACE_REGULAR');
      }
    }

    if (sel.source === 'board') {
      const code = state.compact[sel.idx];
      if (isPusherCode(code)) {
        if (!isPusherOptionalPhase(phase)) return [];
        return getLegalPusherActions(state.compact).filter(
          (a) => a.type === 'MOVE_PUSHER' && a.fromIdx === sel.idx
        );
      }
      if (isRegularOrPromoCode(code)) {
        return getLegalRegularActions(state.compact).filter(
          (a) => a.type === 'MOVE_REGULAR' && a.fromIdx === sel.idx
        );
      }
    }

    return [];
  }

  function onBenchSlotClick(player, kind) {
    if (!isHumanTurnNow() || state.isAnimating) return;
    const active = activePlayerFromPhase(state.compact[41]);
    if (player !== active) return;

    if (
      state.selected &&
      state.selected.source === 'bench' &&
      state.selected.player === player &&
      state.selected.kind === kind
    ) {
      state.selected = null;
    } else {
      state.selected = { source: 'bench', player, kind };
      sfx.select();
    }
    renderAll();
  }

  function onHexLeftClick(idx) {
    if (!isHumanTurnNow() || state.isAnimating) return;

    // 1. Action-First Disambiguation (per UI_Design.md & PRD):
    // If a piece/slot is selected and idx is a legal target (including pushing an adjacent friendly piece!), execute it!
    if (state.selected) {
      const legalActs = getActionsForSelection(state.selected);
      const match = legalActs.find((a) => a.toIdx === idx);
      if (match) {
        executeHumanAction(match);
        return;
      }

      // Clicking the already-selected board piece toggles selection off
      if (state.selected.source === 'board' && state.selected.idx === idx) {
        state.selected = null;
        renderAll();
        return;
      }
    }

    // 2. Otherwise, if clicked hex contains a selectable piece for active player, select it
    if (canSelectBoardPiece(idx)) {
      state.selected = { source: 'board', idx };
      sfx.select();
      renderAll();
      return;
    }

    // 3. Clicking any non-target empty/other hex deselects
    if (state.selected) {
      state.selected = null;
      renderAll();
    }
  }

  function onHexRightClick(idx) {
    if (!isHumanTurnNow() || state.isAnimating) return;
    // Right-click allows switching directly to a friendly Regular/Promoted piece (bypassing Pusher push) or deselecting
    if (canSelectBoardPiece(idx)) {
      state.selected = { source: 'board', idx };
      sfx.select();
    } else {
      state.selected = null;
    }
    renderAll();
  }

  // Click on background svg space deselects
  dom.boardSvg.addEventListener('click', () => {
    if (state.selected && !state.isAnimating) {
      state.selected = null;
      renderAll();
    }
  });

  dom.boardSvg.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (state.selected && !state.isAnimating) {
      state.selected = null;
      renderAll();
    }
  });

  // ==================== 9. SMOOTH SVG ANIMATIONS ====================

  /**
   * Animates an atomic action transition using Web Animations API on SVG groups,
   * including sliding movement, bench pop-in, synchronized chain push, crush impact,
   * and "Spiral into Darkness" when pushed off the board edge!
   */
  async function animateTransition(beforeCompact, action, animPlan) {
    if (action.type === 'SKIP_PUSHER') return;

    const slideMs = getAnimDuration(250);
    const spiralMs = getAnimDuration(460);

    // Sound effects trigger
    if (animPlan.edgeFall) {
      sfx.spiralFall();
    } else if (animPlan.crushed || animPlan.captured) {
      sfx.capture();
    } else if (action.type === 'MOVE_PUSHER' && animPlan.slides.length > 1) {
      sfx.push();
    } else if (animPlan.placement) {
      sfx.place();
    } else {
      sfx.move();
    }

    // Build sets of origin indices that will be animated in layerEffects rather than static layerPieces
    const movingOrigins = new Set();
    for (const s of animPlan.slides) movingOrigins.add(s.fromIdx);
    if (animPlan.edgeFall) movingOrigins.add(animPlan.edgeFall.fromIdx);
    if (animPlan.crushed) movingOrigins.add(animPlan.crushed.fromIdx);
    if (animPlan.captured) movingOrigins.add(animPlan.captured.atIdx);

    // Render non-moving board pieces cleanly from beforeCompact
    dom.layerHighlights.innerHTML = '';
    dom.layerTargets.innerHTML = '';
    dom.layerPieces.innerHTML = '';
    dom.layerEffects.innerHTML = '';

    for (let idx = 0; idx < 37; idx++) {
      if (movingOrigins.has(idx)) continue;
      const code = beforeCompact[idx];
      if (code === EMPTY) continue;
      const h = CANONICAL_HEXES[idx];
      dom.layerPieces.appendChild(createPieceElement(code, h.px, h.py));
    }

    const animPromises = [];

    // 1. Captured piece on target hex (impact pulse + fade)
    if (animPlan.captured) {
      const ch = CANONICAL_HEXES[animPlan.captured.atIdx];
      const capEl = createPieceElement(animPlan.captured.code, ch.px, ch.py);
      dom.layerEffects.appendChild(capEl);
      if (capEl.animate) {
        const anim = capEl.animate(
          [
            { transform: `translate(${ch.px}px, ${ch.py}px) scale(1)`, opacity: 1 },
            { transform: `translate(${ch.px}px, ${ch.py}px) scale(1.25)`, opacity: 0.65, offset: 0.45 },
            { transform: `translate(${ch.px}px, ${ch.py}px) scale(0.25)`, opacity: 0 }
          ],
          { duration: slideMs, easing: 'ease-out', fill: 'forwards' }
        );
        animPromises.push(anim.finished.catch(() => {}));
      }
    }

    // 2. Crushed piece against stationary Pusher
    if (animPlan.crushed) {
      const fh = CANONICAL_HEXES[animPlan.crushed.fromIdx];
      const ih = CANONICAL_HEXES[animPlan.crushed.intoIdx];
      const midX = fh.px + (ih.px - fh.px) * 0.58;
      const midY = fh.py + (ih.py - fh.py) * 0.58;

      const crushEl = createPieceElement(animPlan.crushed.code, fh.px, fh.py);
      dom.layerEffects.appendChild(crushEl);

      // Brief red impact flash ring
      const burst = svgEl('circle', {
        cx: midX,
        cy: midY,
        r: '16',
        fill: 'none',
        stroke: '#ef4444',
        'stroke-width': '3.5',
        opacity: '0'
      });
      dom.layerEffects.appendChild(burst);

      if (crushEl.animate) {
        const anim = crushEl.animate(
          [
            { transform: `translate(${fh.px}px, ${fh.py}px) scale(1)`, opacity: 1 },
            { transform: `translate(${midX}px, ${midY}px) scale(0.88, 0.55)`, opacity: 0.9, offset: 0.65 },
            { transform: `translate(${midX}px, ${midY}px) scale(0.1)`, opacity: 0 }
          ],
          { duration: slideMs * 1.15, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'forwards' }
        );
        animPromises.push(anim.finished.catch(() => {}));

        burst.animate(
          [
            { opacity: 0, transform: 'scale(0.5)' },
            { opacity: 0.95, transform: 'scale(1.1)', offset: 0.55 },
            { opacity: 0, transform: 'scale(1.5)' }
          ],
          { duration: slideMs * 1.15, easing: 'ease-out', fill: 'forwards' }
        );
      }
    }

    // 3. Synchronized Sliding Movements (single piece or chain push)
    for (const s of animPlan.slides) {
      const fh = CANONICAL_HEXES[s.fromIdx];
      const th = CANONICAL_HEXES[s.toIdx];
      const el = createPieceElement(s.code, fh.px, fh.py);
      dom.layerEffects.appendChild(el);
      if (el.animate) {
        const anim = el.animate(
          [
            { transform: `translate(${fh.px}px, ${fh.py}px)` },
            { transform: `translate(${th.px}px, ${th.py}px)` }
          ],
          { duration: slideMs, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'forwards' }
        );
        animPromises.push(anim.finished.catch(() => {}));
      }
    }

    // 4. Bench Placement (fly/pop into target hex)
    if (animPlan.placement) {
      const th = CANONICAL_HEXES[animPlan.placement.toIdx];
      const startX = animPlan.placement.fromBench === 'blue' ? -275 : 275;
      const startY = animPlan.placement.slotType === 'pusher' ? 115 : -55;
      const el = createPieceElement(animPlan.placement.code, startX, startY);
      dom.layerEffects.appendChild(el);
      if (el.animate) {
        const anim = el.animate(
          [
            { transform: `translate(${startX}px, ${startY}px) scale(0.55)`, opacity: 0.3 },
            { transform: `translate(${th.px}px, ${th.py}px) scale(1.12)`, opacity: 1, offset: 0.8 },
            { transform: `translate(${th.px}px, ${th.py}px) scale(1)`, opacity: 1 }
          ],
          { duration: slideMs * 1.08, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'forwards' }
        );
        animPromises.push(anim.finished.catch(() => {}));
      }
    }

    // 5. Edge Fall ("Spiral into Darkness")!
    if (animPlan.edgeFall) {
      const fh = CANONICAL_HEXES[animPlan.edgeFall.fromIdx];
      const offPos = cubeToPixel(animPlan.edgeFall.offQ, animPlan.edgeFall.offR);
      const abyssX = offPos.x * 1.08;
      const abyssY = offPos.y * 1.08 + 14;

      const fallEl = createPieceElement(animPlan.edgeFall.code, fh.px, fh.py);
      dom.layerEffects.appendChild(fallEl);
      if (fallEl.animate) {
        const totalDur = slideMs * 0.65 + spiralMs;
        const slideOffset = (slideMs * 0.65) / totalDur;
        const anim = fallEl.animate(
          [
            { transform: `translate(${fh.px}px, ${fh.py}px) rotate(0deg) scale(1)`, opacity: 1, offset: 0 },
            {
              transform: `translate(${offPos.x.toFixed(1)}px, ${offPos.y.toFixed(1)}px) rotate(35deg) scale(0.95)`,
              opacity: 0.95,
              offset: slideOffset
            },
            {
              transform: `translate(${abyssX.toFixed(1)}px, ${abyssY.toFixed(1)}px) rotate(320deg) scale(0.45)`,
              opacity: 0.5,
              offset: slideOffset + (1 - slideOffset) * 0.55
            },
            {
              transform: `translate(${abyssX.toFixed(1)}px, ${(abyssY + 12).toFixed(1)}px) rotate(640deg) scale(0)`,
              opacity: 0,
              offset: 1
            }
          ],
          { duration: totalDur, easing: 'ease-in', fill: 'forwards' }
        );
        animPromises.push(anim.finished.catch(() => {}));
      }
    }

    if (animPromises.length > 0) {
      await Promise.all(animPromises);
    }

    // 6. Promotion gold-ring pulse if a Regular tile promoted on Center Hex
    if (animPlan.promotions.length > 0) {
      sfx.promote();
      dom.layerEffects.innerHTML = '';
      const ch = CANONICAL_HEXES[CENTER_IDX];
      const ring = svgEl('polygon', {
        points: hexPoints(ch.px, ch.py, HEX_SIZE * 0.85),
        fill: 'none',
        stroke: '#fef08a',
        'stroke-width': '4'
      });
      dom.layerEffects.appendChild(ring);
      if (ring.animate) {
        await ring
          .animate(
            [
              { transform: 'scale(0.65)', opacity: 1, transformOrigin: '0px 0px' },
              { transform: 'scale(1.35)', opacity: 0, transformOrigin: '0px 0px' }
            ],
            { duration: getAnimDuration(260), easing: 'ease-out' }
          )
          .finished.catch(() => {});
      }
    }

    dom.layerEffects.innerHTML = '';
  }

  // ==================== 10. EXECUTING ACTIONS, HISTORY & AI LOOP ====================

  async function executeHumanAction(action) {
    if (!isHumanTurnNow() || state.isAnimating) return;
    const token = state.matchToken;

    // Implicit Pusher Skip: if currently in Pusher Optional phase (0 or 2) and player executes a Regular action directly,
    // advance internal phase via SKIP_PUSHER (omitted from JSON history per PRD Section 3!)
    if (
      isPusherOptionalPhase(state.compact[41]) &&
      (action.type === 'PLACE_REGULAR' || action.type === 'MOVE_REGULAR')
    ) {
      const skipped = applyAtomicAction(state.compact, { type: 'SKIP_PUSHER' });
      state.compact = skipped.nextState;
    }

    state.selected = null;
    await commitActionAndAdvance(action, token);
  }

  async function commitActionAndAdvance(action, token) {
    if (token !== state.matchToken || !state.isGameActive) return;

    // If AI returned SKIP_PUSHER, apply silently without recording in JSON history (per PRD Section 3)
    if (action.type === 'SKIP_PUSHER') {
      const skipped = applyAtomicAction(state.compact, action);
      state.compact = skipped.nextState;
      renderAll();
      // Check stalemate in Regular phase
      const termAfterSkip = evaluateTerminal(state.compact, state.halfTurnsWithoutProgress);
      if (termAfterSkip.over) {
        finishGame(termAfterSkip.winner, termAfterSkip.reason);
        return;
      }
      maybeScheduleAiTurn(token);
      return;
    }

    const beforeCompact = state.compact.slice();
    const actingPlayer = activePlayerFromPhase(beforeCompact[41]);
    const phaseLabel = action.type.includes('PUSHER') ? 'PUSHER' : 'REGULAR';

    const { nextState, events, animPlan, resetDrawClock } = applyAtomicAction(beforeCompact, action);

    state.isAnimating = true;
    await animateTransition(beforeCompact, action, animPlan);
    if (token !== state.matchToken) return;
    state.isAnimating = false;

    state.compact = nextState;

    // Build clean JSON-serializable action object matching PRD schema
    const recordAction = formatActionForRecord(action);
    const stateStr = encodeStateString(state.compact);

    state.history.push({
      turn: state.turnNumber,
      player: actingPlayer,
      phase: phaseLabel,
      action: recordAction,
      events,
      state: stateStr
    });

    // Update draw counter & turn number when a turn finishes (i.e. after REGULAR action)
    if (resetDrawClock) {
      state.halfTurnsWithoutProgress = 0;
    } else if (phaseLabel === 'REGULAR') {
      state.halfTurnsWithoutProgress++;
    }

    // Check immediate victory / elimination / stalemate after EVERY action (including Step 1 Pusher!)
    const term = evaluateTerminal(state.compact, state.halfTurnsWithoutProgress);

    if (phaseLabel === 'REGULAR' && !term.over) {
      state.turnNumber++;
    }

    renderAll();

    if (term.over) {
      finishGame(term.winner, term.reason);
      return;
    }

    maybeScheduleAiTurn(token);
  }

  function formatActionForRecord(action) {
    if (action.type === 'PLACE_PUSHER' || action.type === 'PLACE_REGULAR') {
      return { type: action.type, to: action.to };
    }
    if (action.type === 'MOVE_PUSHER') {
      return {
        type: 'MOVE_PUSHER',
        from: action.from,
        to: action.to,
        pusherOwner: action.pusherOwner
      };
    }
    if (action.type === 'MOVE_REGULAR') {
      return {
        type: 'MOVE_REGULAR',
        from: action.from,
        to: action.to
      };
    }
    return { type: action.type };
  }

  function maybeScheduleAiTurn(token) {
    if (!state.isGameActive || state.result || token !== state.matchToken) return;
    const active = activePlayerFromPhase(state.compact[41]);
    if (state.players[active].type !== 'ai') return;

    clearTimeout(state.aiTimer);
    const delay = getAiStepDelayMs();

    state.aiTimer = setTimeout(async () => {
      if (token !== state.matchToken || !state.isGameActive || state.result) return;
      const agentId = state.players[active].agent || 'heuristic-v1';

      // Yield a paint frame before heavy 6-ply search so "Thinking..." status renders smoothly
      await new Promise((r) => requestAnimationFrame(r));
      if (token !== state.matchToken || !state.isGameActive || state.result) return;

      const chosen = window.HexChessAI.chooseAction(state.compact.slice(), agentId);
      if (!chosen) {
        finishGame('draw', 'stalemate');
        return;
      }

      // If AI chooses SKIP_PUSHER, immediately compute & execute its mandatory Regular action without extra pause!
      if (chosen.type === 'SKIP_PUSHER') {
        const skipped = applyAtomicAction(state.compact, chosen);
        state.compact = skipped.nextState;
        const termCheck = evaluateTerminal(state.compact, state.halfTurnsWithoutProgress);
        if (termCheck.over) {
          renderAll();
          finishGame(termCheck.winner, termCheck.reason);
          return;
        }
        const regChoice = window.HexChessAI.chooseAction(state.compact.slice(), agentId);
        if (!regChoice) {
          finishGame('draw', 'stalemate');
          return;
        }
        await commitActionAndAdvance(regChoice, token);
      } else {
        await commitActionAndAdvance(chosen, token);
      }
    }, delay);
  }

  // ==================== 11. STARTING, ENDING, REPORTS & REPLAY ====================

  function agentNameFromTier(tier) {
    if (tier === 'triangle' || tier === 'square' || tier === 'pentagon' || tier === 'hexagon') {
      return tier;
    }
    return 'square';
  }

  function formatPlayerSummary(p) {
    if (!p) return 'Unknown';
    if (p.type === 'human') return 'Human';
    const tier = String(p.agent || 'square');
    return `AI (${tier.charAt(0).toUpperCase() + tier.slice(1)})`;
  }

  function formatCoord(arr) {
    return Array.isArray(arr) ? `(${arr[0]},${arr[1]},${arr[2]})` : '(?)';
  }

  function formatActionHuman(act) {
    if (!act) return 'NONE';
    if (act.type === 'SKIP_PUSHER') return 'SKIP_PUSHER';
    if (act.type === 'PLACE_PUSHER') return `PLACE_PUSHER -> ${formatCoord(act.to)}`;
    if (act.type === 'PLACE_REGULAR') return `PLACE_REGULAR -> ${formatCoord(act.to)}`;
    if (act.type === 'MOVE_PUSHER') {
      const who = act.pusherOwner === 'neutral' ? ' [Neutral]' : '';
      return `MOVE_PUSHER ${formatCoord(act.from)} -> ${formatCoord(act.to)}${who}`;
    }
    if (act.type === 'MOVE_REGULAR') {
      return `MOVE_REGULAR ${formatCoord(act.from)} -> ${formatCoord(act.to)}`;
    }
    return act.type;
  }

  function startNewGame() {
    exitReplayMode(false);
    clearTimeout(state.aiTimer);
    state.matchToken++;
    const token = state.matchToken;

    state.gameId = generateGameId();
    state.compact = createInitialCompactState();
    state.initialStateStr = encodeStateString(state.compact);
    state.turnNumber = 1;
    state.halfTurnsWithoutProgress = 0;
    state.history = [];
    state.result = null;
    state.lastAnalysis = null;
    state.selected = null;
    state.isAnimating = false;
    state.isGameActive = true;
    state.hasSavedCurrentGame = false;

    const agentStr = agentNameFromTier(state.aiTier);

    if (state.mode === 'hotseat') {
      state.players = {
        blue: { type: 'human' },
        orange: { type: 'human' }
      };
    } else if (state.mode === 'pvai') {
      const humanIsBlue = Math.random() < 0.5;
      state.players = humanIsBlue
        ? { blue: { type: 'human' }, orange: { type: 'ai', agent: agentStr } }
        : { blue: { type: 'ai', agent: agentStr }, orange: { type: 'human' } };
    } else {
      state.players = {
        blue: { type: 'ai', agent: agentStr },
        orange: { type: 'ai', agent: agentStr }
      };
    }

    dom.gameCodeLabel.textContent = `# ${state.gameId}`;
    dom.btnCloseNewGame.classList.remove('hidden');
    if (dom.replayErrorMsg) dom.replayErrorMsg.classList.add('hidden');
    closeAllModals();
    renderAll();

    maybeScheduleAiTurn(token);
  }

  function formatReasonText(reason) {
    switch (reason) {
      case 'elimination':
        return 'All opponent Regular Tiles eliminated';
      case 'concession':
        return 'Victory by resignation';
      case 'stalemate':
        return 'Draw by Stalemate (no legal Regular Action)';
      case '30_turn_rule':
        return 'Draw by 30-Turn Rule (no placement or capture)';
      default:
        return 'Match complete';
    }
  }

  function finishGame(winner, reason) {
    clearTimeout(state.aiTimer);
    state.isGameActive = false;
    state.selected = null;
    state.result = {
      winner,
      reason,
      totalTurns: state.turnNumber
    };

    renderAll();
    sfx.victory();

    // Populate Game Over Modal
    dom.gameOverBadge.className = 'winner-badge';
    if (winner === 'blue') {
      dom.gameOverBadge.textContent = 'BLUE VICTORY';
      dom.gameOverTitle.textContent = 'Blue Wins!';
    } else if (winner === 'orange') {
      dom.gameOverBadge.classList.add('orange');
      dom.gameOverBadge.textContent = 'ORANGE VICTORY';
      dom.gameOverTitle.textContent = 'Orange Wins!';
    } else {
      dom.gameOverBadge.classList.add('draw');
      dom.gameOverBadge.textContent = 'STALEMATE / DRAW';
      dom.gameOverTitle.textContent = 'Draw Game!';
    }

    dom.gameOverReason.textContent = formatReasonText(reason);
    dom.statTurns.textContent = String(state.result.totalTurns);
    dom.statPlies.textContent = String(state.history.length);
    dom.statGameId.textContent = `#${state.gameId}`;
    if (dom.statBlueAcc) dom.statBlueAcc.textContent = '...';
    if (dom.statOrangeAcc) dom.statOrangeAcc.textContent = '...';
    dom.saveFeedback.classList.add('hidden');
    dom.saveFeedback.textContent = '';

    openModal('modalGameOver');

    // Run post-game move quality analysis shortly after modal renders
    const finishedToken = state.matchToken;
    setTimeout(() => {
      if (finishedToken !== state.matchToken) return;
      try {
        state.lastAnalysis = window.HexChessAI.analyzeGame(state.initialStateStr, state.history);
        if (dom.statBlueAcc) {
          dom.statBlueAcc.textContent = `${state.lastAnalysis.players.blue.accuracy.toFixed(1)}%`;
        }
        if (dom.statOrangeAcc) {
          dom.statOrangeAcc.textContent = `${state.lastAnalysis.players.orange.accuracy.toFixed(1)}%`;
        }
      } catch (err) {
        state.lastAnalysis = null;
        if (dom.statBlueAcc) dom.statBlueAcc.textContent = 'N/A';
        if (dom.statOrangeAcc) dom.statOrangeAcc.textContent = 'N/A';
      }

      if (state.autoSave && state.recordsDirHandle) {
        saveGameRecord(true);
      }
    }, 60);
  }

  function computeGameStats() {
    const stats = {
      blue: { pusherUsed: 0, regularMoves: 0, placements: 0, captures: 0, edgeCaptures: 0, crushCaptures: 0, promotions: 0 },
      orange: { pusherUsed: 0, regularMoves: 0, placements: 0, captures: 0, edgeCaptures: 0, crushCaptures: 0, promotions: 0 }
    };

    for (const h of state.history) {
      const s = stats[h.player];
      if (!s) continue;
      if (h.phase === 'PUSHER') s.pusherUsed++;
      if (h.action.type === 'MOVE_REGULAR') s.regularMoves++;
      if (h.action.type === 'PLACE_REGULAR' || h.action.type === 'PLACE_PUSHER') s.placements++;

      for (const ev of h.events || []) {
        if (ev.type === 'CAPTURE') s.captures++;
        else if (ev.type === 'EDGE_CAPTURE') s.edgeCaptures++;
        else if (ev.type === 'CRUSH_CAPTURE') s.crushCaptures++;
        else if (ev.type === 'PROMOTION') {
          if (stats[ev.owner]) stats[ev.owner].promotions++;
        }
      }
    }
    return stats;
  }

  function buildGameReportText() {
    if (!state.lastAnalysis && window.HexChessAI && window.HexChessAI.analyzeGame) {
      try {
        state.lastAnalysis = window.HexChessAI.analyzeGame(state.initialStateStr, state.history);
      } catch (e) {
        state.lastAnalysis = null;
      }
    }

    const analysis = state.lastAnalysis;
    const gStats = computeGameStats();
    const finalCounts = getPieceCounts(state.compact);
    const result = state.result || { winner: 'in_progress', reason: 'in_progress', totalTurns: state.turnNumber };
    const lines = [];

    lines.push('==============================================================================');
    lines.push('HEXCHESS MATCH REPORT');
    lines.push('==============================================================================');
    lines.push(`Game ID      : ${state.gameId}`);
    lines.push(`Date (UTC)   : ${new Date().toISOString()}`);
    lines.push(`Mode         : ${state.mode}`);
    lines.push(`Blue Player  : ${formatPlayerSummary(state.players.blue)}`);
    lines.push(`Orange Player: ${formatPlayerSummary(state.players.orange)}`);
    lines.push(`Winner       : ${String(result.winner || 'None').toUpperCase()} (${formatReasonText(result.reason)})`);
    lines.push(`Length       : ${result.totalTurns} turns (${state.history.length} recorded actions)`);
    lines.push('');

    lines.push('------------------------------------------------------------------------------');
    lines.push('1. GAME STATISTICS');
    lines.push('------------------------------------------------------------------------------');
    lines.push('Metric                       Blue    Orange');
    lines.push(`Remaining Regular/Promoted   ${String(finalCounts.bTotalAlive).padStart(4)}    ${String(finalCounts.oTotalAlive).padStart(6)}`);
    lines.push(`Promoted on Board            ${String(finalCounts.bBoardPromo).padStart(4)}    ${String(finalCounts.oBoardPromo).padStart(6)}`);
    lines.push(`Pusher Actions Used          ${String(gStats.blue.pusherUsed).padStart(4)}    ${String(gStats.orange.pusherUsed).padStart(6)}`);
    lines.push(`Regular Captures             ${String(gStats.blue.captures).padStart(4)}    ${String(gStats.orange.captures).padStart(6)}`);
    lines.push(`Edge Push-Off Captures       ${String(gStats.blue.edgeCaptures).padStart(4)}    ${String(gStats.orange.edgeCaptures).padStart(6)}`);
    lines.push(`Pusher Crush Captures        ${String(gStats.blue.crushCaptures).padStart(4)}    ${String(gStats.orange.crushCaptures).padStart(6)}`);
    lines.push(`Promotions Achieved          ${String(gStats.blue.promotions).padStart(4)}    ${String(gStats.orange.promotions).padStart(6)}`);
    lines.push('');

    lines.push('------------------------------------------------------------------------------');
    lines.push('2. CRITICAL MOVE EVALUATION (4-Ply + Quiescence Eval-Loss Method)');
    lines.push('------------------------------------------------------------------------------');
    if (analysis) {
      const b = analysis.players.blue;
      const o = analysis.players.orange;
      lines.push('Metric                       Blue    Orange');
      lines.push(`Accuracy                     ${(b.accuracy.toFixed(1) + '%').padStart(6)}  ${(o.accuracy.toFixed(1) + '%').padStart(8)}`);
      lines.push(`Avg Eval Loss / Move         ${b.avgLoss.toFixed(1).padStart(6)}  ${o.avgLoss.toFixed(1).padStart(8)}`);
      lines.push(`Best Moves (!)               ${String(b.counts.best).padStart(6)}  ${String(o.counts.best).padStart(8)}`);
      lines.push(`Good Moves                   ${String(b.counts.good).padStart(6)}  ${String(o.counts.good).padStart(8)}`);
      lines.push(`Inaccuracies (?!)            ${String(b.counts.inaccuracy).padStart(6)}  ${String(o.counts.inaccuracy).padStart(8)}`);
      lines.push(`Mistakes (?)                 ${String(b.counts.mistake).padStart(6)}  ${String(o.counts.mistake).padStart(8)}`);
      lines.push(`Blunders (??)                ${String(b.counts.blunder).padStart(6)}  ${String(o.counts.blunder).padStart(8)}`);
      lines.push('');

      if (analysis.turningPoints.length > 0) {
        lines.push('Key Turning Points (Largest Eval Drops):');
        for (const tp of analysis.turningPoints) {
          const recStr = tp.bestAction ? formatActionHuman(tp.bestAction) : 'N/A';
          lines.push(
            `  - Ply ${tp.ply} (Turn ${tp.turn}, ${tp.player.toUpperCase()}): ` +
            `${formatActionHuman(tp.action)} [${tp.label} ${tp.tag}, -${tp.evalLoss} pts] | Better: ${recStr}`
          );
        }
      } else {
        lines.push('Key Turning Points: None (both sides played without major errors).');
      }
    } else {
      lines.push('Analysis unavailable for this game.');
    }
    lines.push('');

    lines.push('------------------------------------------------------------------------------');
    lines.push('3. MOVE CATALOG & COMPACT BOARD STATES (Used by Replay Saved Game)');
    lines.push('------------------------------------------------------------------------------');
    lines.push(`INITIAL_STATE: ${state.initialStateStr}`);

    for (let i = 0; i < state.history.length; i++) {
      const h = state.history[i];
      const evEval = analysis && analysis.plyEvaluations[i] ? analysis.plyEvaluations[i] : null;
      const tagStr = evEval && evEval.tag ? ` [${evEval.tag} -${evEval.evalLoss}]` : evEval ? ` [-${evEval.evalLoss}]` : '';
      const eventTypes = (h.events || []).map((e) => e.type).join(',');
      const evStr = eventTypes ? ` {${eventTypes}}` : '';
      const plyNum = String(i + 1).padStart(3, '0');
      const turnStr = String(h.turn).padStart(2, '0');
      const pStr = h.player.toUpperCase().padEnd(6, ' ');
      const phStr = h.phase.padEnd(7, ' ');
      lines.push(
        `PLY ${plyNum} | T${turnStr} | ${pStr} | ${phStr} | ${formatActionHuman(h.action)}${evStr}${tagStr} | STATE: ${h.state}`
      );
    }

    lines.push('==============================================================================');
    return lines.join('\n') + '\n';
  }

  function getRecordFilename() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(
      now.getHours()
    )}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    return `hexchess_${stamp}_${state.gameId}.txt`;
  }

  async function pickRecordsFolder() {
    if (!window.showDirectoryPicker) {
      dom.folderStatusText.textContent =
        'Direct folder access not supported in this browser; Save Report will download .txt.';
      return false;
    }
    try {
      const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
      state.recordsDirHandle = dirHandle;
      dom.folderStatusText.textContent = `Linked folder: ${dirHandle.name}/`;
      return true;
    } catch (err) {
      return false;
    }
  }

  async function saveGameRecord(isAuto = false) {
    const reportText = buildGameReportText();
    const filename = getRecordFilename();

    if (state.recordsDirHandle) {
      try {
        const fileHandle = await state.recordsDirHandle.getFileHandle(filename, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(reportText);
        await writable.close();
        state.hasSavedCurrentGame = true;
        showSaveFeedback(`Saved to ${state.recordsDirHandle.name}/${filename}`);
        return;
      } catch (e) {
        // Fall through to browser download
      }
    }

    if (!isAuto && window.showDirectoryPicker && !state.recordsDirHandle) {
      const picked = await pickRecordsFolder();
      if (picked && state.recordsDirHandle) {
        try {
          const fileHandle = await state.recordsDirHandle.getFileHandle(filename, { create: true });
          const writable = await fileHandle.createWritable();
          await writable.write(reportText);
          await writable.close();
          state.hasSavedCurrentGame = true;
          showSaveFeedback(`Saved to ${state.recordsDirHandle.name}/${filename}`);
          return;
        } catch (e) {
          // Fall through to download
        }
      }
    }

    const blob = new Blob([reportText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    state.hasSavedCurrentGame = true;
    showSaveFeedback(`Downloaded ${filename}`);
  }

  function showSaveFeedback(msg) {
    dom.saveFeedback.textContent = msg;
    dom.saveFeedback.classList.remove('hidden');
  }

  // ==================== 11B. REPLAY SAVED GAME (.txt) ====================

  function parseSavedReportText(text) {
    const lines = text.split(/\r?\n/);
    const meta = {
      gameId: 'RPLY',
      blueLabel: 'BLUE',
      orangeLabel: 'ORANGE',
      winner: ''
    };
    const frames = [];

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      if (line.startsWith('Game ID')) {
        const idx = line.indexOf(':');
        if (idx !== -1) meta.gameId = line.slice(idx + 1).trim();
      } else if (line.startsWith('Blue Player')) {
        const idx = line.indexOf(':');
        if (idx !== -1) meta.blueLabel = line.slice(idx + 1).trim().toUpperCase();
      } else if (line.startsWith('Orange Player')) {
        const idx = line.indexOf(':');
        if (idx !== -1) meta.orangeLabel = line.slice(idx + 1).trim().toUpperCase();
      } else if (line.startsWith('Winner')) {
        const idx = line.indexOf(':');
        if (idx !== -1) meta.winner = line.slice(idx + 1).trim();
      } else if (line.startsWith('INITIAL_STATE:')) {
        const st = line.slice('INITIAL_STATE:'.length).trim();
        decodeStateString(st); // validate
        frames.push({
          stateStr: st,
          label: 'Initial Position'
        });
      } else if (line.startsWith('PLY ')) {
        const stateMarker = '| STATE:';
        const sIdx = line.lastIndexOf(stateMarker);
        if (sIdx === -1) continue;
        const st = line.slice(sIdx + stateMarker.length).trim();
        decodeStateString(st); // validate
        const metaPart = line.slice(0, sIdx).trim();
        // Compact label from "PLY 001 | T01 | BLUE | PUSHER | MOVE_PUSHER ..."
        const parts = metaPart.split('|').map((p) => p.trim());
        const shortLabel = parts.length >= 5 ? `${parts[1]} · ${parts[2]} · ${parts[4]}` : metaPart;
        frames.push({
          stateStr: st,
          label: shortLabel
        });
      }
    }

    if (frames.length < 2) {
      throw new Error('No valid HexChess compact states found in this .txt file.');
    }
    return { meta, frames };
  }

  function stopReplayTimer() {
    if (state.replay.timer) {
      clearInterval(state.replay.timer);
      state.replay.timer = null;
    }
    if (dom.btnReplayPlay) dom.btnReplayPlay.innerHTML = '&#x25B6;';
  }

  function renderReplayFrame(idx) {
    if (!state.replay.active || state.replay.frames.length === 0) return;
    const clamped = Math.max(0, Math.min(state.replay.frames.length - 1, idx));
    state.replay.index = clamped;
    const frame = state.replay.frames[clamped];

    state.compact = decodeStateString(frame.stateStr);
    renderAll();

    const maxIdx = state.replay.frames.length - 1;
    dom.replaySlider.max = String(maxIdx);
    dom.replaySlider.value = String(clamped);
    dom.replayStepLabel.textContent = `${clamped} / ${maxIdx}`;
    dom.replayMoveInfo.textContent = frame.label;
    dom.replayMoveInfo.title = frame.label;
  }

  function toggleReplayPlay() {
    if (!state.replay.active) return;
    if (state.replay.timer) {
      stopReplayTimer();
      return;
    }
    if (state.replay.index >= state.replay.frames.length - 1) {
      renderReplayFrame(0);
    }
    dom.btnReplayPlay.innerHTML = '&#x23F8;';
    const stepMs = Math.max(220, getAiStepDelayMs() * 1.4);
    state.replay.timer = setInterval(() => {
      if (!state.replay.active) {
        stopReplayTimer();
        return;
      }
      if (state.replay.index >= state.replay.frames.length - 1) {
        stopReplayTimer();
        return;
      }
      renderReplayFrame(state.replay.index + 1);
      sfx.move();
    }, stepMs);
  }

  function enterReplayMode(parsed) {
    clearTimeout(state.aiTimer);
    stopReplayTimer();
    state.matchToken++;
    state.isGameActive = false;
    state.isAnimating = false;
    state.selected = null;
    state.result = null;

    state.replay.active = true;
    state.replay.frames = parsed.frames;
    state.replay.meta = parsed.meta;
    state.replay.index = 0;

    state.gameId = parsed.meta.gameId;
    dom.gameCodeLabel.textContent = `# ${state.gameId}`;
    dom.btnCloseNewGame.classList.remove('hidden');

    dom.statusPill.classList.add('hidden');
    dom.replayBar.classList.remove('hidden');

    closeAllModals();
    renderReplayFrame(0);
  }

  function exitReplayMode(openNewGameModal = true) {
    stopReplayTimer();
    if (!state.replay.active) return;
    state.replay.active = false;
    state.replay.frames = [];
    state.replay.meta = null;
    state.replay.index = 0;

    dom.replayBar.classList.add('hidden');
    dom.statusPill.classList.remove('hidden');

    if (openNewGameModal) {
      openModal('modalNewGame');
    }
  }

  // ==================== 12. MODAL & UI WIRING ====================

  function openModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('open');
  }

  function closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('open');
  }

  function closeAllModals() {
    document.querySelectorAll('.modal-backdrop').forEach((m) => m.classList.remove('open'));
  }

  function wireControls() {
    // Close buttons
    document.querySelectorAll('[data-close]').forEach((btn) => {
      btn.addEventListener('click', () => closeModal(btn.getAttribute('data-close')));
    });

    dom.btnCloseNewGame.addEventListener('click', () => closeModal('modalNewGame'));

    // Close modals on backdrop click (except initial New Game when no game has started)
    document.querySelectorAll('.modal-backdrop').forEach((backdrop) => {
      backdrop.addEventListener('click', (e) => {
        if (e.target !== backdrop) return;
        if (backdrop.id === 'modalNewGame' && state.gameId === '----') return;
        backdrop.classList.remove('open');
      });
    });

    // Sidebar actions
    dom.btnRules.addEventListener('click', () => openModal('modalRules'));
    dom.btnSettings.addEventListener('click', () => openModal('modalSettings'));

    dom.btnResign.addEventListener('click', () => {
      if (!state.isGameActive || state.result) {
        openModal('modalNewGame');
        return;
      }
      let resigningColor = activePlayerFromPhase(state.compact[41]);
      if (state.mode === 'pvai') {
        resigningColor = state.players.blue.type === 'human' ? 'blue' : 'orange';
      }
      const capName = resigningColor === 'blue' ? 'Blue' : 'Orange';
      dom.resignPromptText.textContent = `Confirm resignation for ${capName}? This will immediately end the match and award victory to ${
        resigningColor === 'blue' ? 'Orange' : 'Blue'
      }.`;
      openModal('modalResign');
    });

    dom.btnConfirmResign.addEventListener('click', () => {
      closeModal('modalResign');
      if (!state.isGameActive || state.result) return;
      let resigningColor = activePlayerFromPhase(state.compact[41]);
      if (state.mode === 'pvai') {
        resigningColor = state.players.blue.type === 'human' ? 'blue' : 'orange';
      }
      const winner = resigningColor === 'blue' ? 'orange' : 'blue';
      finishGame(winner, 'concession');
    });

    // Mode selection in New Game Modal
    dom.modeSelector.querySelectorAll('.mode-card').forEach((card) => {
      card.addEventListener('click', () => {
        dom.modeSelector.querySelectorAll('.mode-card').forEach((c) => c.classList.remove('selected'));
        card.classList.add('selected');
        state.mode = card.getAttribute('data-mode');
        dom.aiTierGroup.classList.toggle('hidden', state.mode === 'hotseat');
      });
    });

    // AI Tier selection
    dom.tierSelector.querySelectorAll('.tier-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        dom.tierSelector.querySelectorAll('.tier-btn').forEach((b) => b.classList.remove('selected'));
        btn.classList.add('selected');
        state.aiTier = btn.getAttribute('data-tier');
      });
    });

    dom.btnStartGame.addEventListener('click', () => startNewGame());
    dom.btnPlayAgain.addEventListener('click', () => {
      closeModal('modalGameOver');
      openModal('modalNewGame');
    });
    dom.btnSaveRecord.addEventListener('click', () => saveGameRecord(false));

    // Replay Saved Game (.txt)
    dom.btnReplaySaved.addEventListener('click', () => {
      dom.replayErrorMsg.classList.add('hidden');
      dom.replayFileInput.value = '';
      dom.replayFileInput.click();
    });

    dom.replayFileInput.addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const parsed = parseSavedReportText(text);
        enterReplayMode(parsed);
      } catch (err) {
        dom.replayErrorMsg.textContent = `Could not load replay: ${err.message}`;
        dom.replayErrorMsg.classList.remove('hidden');
      }
    });

    // Replay Bar Controls
    dom.btnReplayStart.addEventListener('click', () => {
      stopReplayTimer();
      renderReplayFrame(0);
    });
    dom.btnReplayPrev.addEventListener('click', () => {
      stopReplayTimer();
      renderReplayFrame(state.replay.index - 1);
    });
    dom.btnReplayPlay.addEventListener('click', () => toggleReplayPlay());
    dom.btnReplayNext.addEventListener('click', () => {
      stopReplayTimer();
      renderReplayFrame(state.replay.index + 1);
    });
    dom.btnReplayEnd.addEventListener('click', () => {
      stopReplayTimer();
      renderReplayFrame(state.replay.frames.length - 1);
    });
    dom.replaySlider.addEventListener('input', (e) => {
      stopReplayTimer();
      renderReplayFrame(Number(e.target.value));
    });
    dom.btnExitReplay.addEventListener('click', () => exitReplayMode(true));

    // Settings Controls
    dom.selCoordOverlay.addEventListener('change', (e) => {
      state.coordOverlay = e.target.value;
      renderCoordinateOverlay();
    });

    dom.selAnimSpeed.addEventListener('change', (e) => {
      state.animSpeed = e.target.value;
    });

    dom.selAiSpeed.addEventListener('change', (e) => {
      state.aiSpeed = e.target.value;
    });

    const syncSoundUI = (enabled) => {
      sfx.enabled = enabled;
      dom.chkSound.checked = enabled;
      dom.iconSoundOn.classList.toggle('hidden', !enabled);
      dom.iconSoundOff.classList.toggle('hidden', enabled);
      dom.btnSoundQuick.classList.toggle('active-audio', enabled);
    };

    dom.chkSound.addEventListener('change', (e) => syncSoundUI(e.target.checked));
    dom.btnSoundQuick.addEventListener('click', () => syncSoundUI(!sfx.enabled));

    const syncMusicUI = (enabled) => {
      music.unlockAndStartIfEnabled();
      music.setEnabled(enabled);
      dom.chkMusic.checked = enabled;
      dom.iconMusicOn.classList.toggle('hidden', !enabled);
      dom.iconMusicOff.classList.toggle('hidden', enabled);
      dom.btnMusicQuick.classList.toggle('active-audio', enabled);
    };

    dom.chkMusic.addEventListener('change', (e) => syncMusicUI(e.target.checked));
    dom.btnMusicQuick.addEventListener('click', () => syncMusicUI(!music.enabled));
    dom.selMusicTrack.addEventListener('change', (e) => {
      music.unlockAndStartIfEnabled();
      music.setTrack(e.target.value);
    });

    // Unlock Web Audio music on first user gesture anywhere in the window
    const unlockMusicOnce = () => {
      music.unlockAndStartIfEnabled();
      window.removeEventListener('pointerdown', unlockMusicOnce);
      window.removeEventListener('keydown', unlockMusicOnce);
    };
    window.addEventListener('pointerdown', unlockMusicOnce);
    window.addEventListener('keydown', unlockMusicOnce);

    // Initialize quick pill active styling
    dom.btnSoundQuick.classList.toggle('active-audio', sfx.enabled);
    dom.btnMusicQuick.classList.toggle('active-audio', music.enabled);

    dom.chkAutoSave.addEventListener('change', (e) => {
      state.autoSave = e.target.checked;
    });

    dom.btnPickFolder.addEventListener('click', () => pickRecordsFolder());

    // Keyboard shortcuts: Escape for modals/deselect, Arrow/Space/Home/End for Replay Mode
    window.addEventListener('keydown', (e) => {
      if (state.replay.active) {
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          stopReplayTimer();
          renderReplayFrame(state.replay.index - 1);
          return;
        }
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          stopReplayTimer();
          renderReplayFrame(state.replay.index + 1);
          return;
        }
        if (e.key === 'Home') {
          e.preventDefault();
          stopReplayTimer();
          renderReplayFrame(0);
          return;
        }
        if (e.key === 'End') {
          e.preventDefault();
          stopReplayTimer();
          renderReplayFrame(state.replay.frames.length - 1);
          return;
        }
        if (e.key === ' ') {
          e.preventDefault();
          toggleReplayPlay();
          return;
        }
      }

      if (e.key === 'Escape') {
        if (dom.modalRules.classList.contains('open')) closeModal('modalRules');
        else if (dom.modalSettings.classList.contains('open')) closeModal('modalSettings');
        else if (dom.modalResign.classList.contains('open')) closeModal('modalResign');
        else if (dom.modalGameOver.classList.contains('open')) closeModal('modalGameOver');
        else if (dom.modalNewGame.classList.contains('open') && state.gameId !== '----') closeModal('modalNewGame');
        else if (state.selected && !state.isAnimating) {
          state.selected = null;
          renderAll();
        }
      }
    });
    // Responsive board orientation & bench layout listener
    const handleViewportChange = () => applyResponsiveBoardOrientation();
    if (mobileMediaQuery.addEventListener) {
      mobileMediaQuery.addEventListener('change', handleViewportChange);
    } else if (mobileMediaQuery.addListener) {
      mobileMediaQuery.addListener(handleViewportChange);
    }
  }

  // Initialize Board & UI on load (opens with New Game modal overlaid per PRD)
  function init() {
    applyResponsiveBoardOrientation();
    renderAll();
    wireControls();
  }

  init();
})();
