/**
 * HexChess — Unified 4-Tier Alpha-Beta AI Engine & Post-Game Move Analyzer
 *
 * Tiers (all powered by one modular search core):
 *   - triangle : Beginner   (2-ply + high noise / frequent mistakes — slightly above random)
 *   - square   : Club       (4-ply + moderate noise / occasional mistakes — slightly below old 4-ply)
 *   - pentagon : Expert     (6-ply + light noise / rare 2nd-best picks — slightly below old 6-ply)
 *   - hexagon  : Master     (8-ply iterative deepening + TT + Quiescence + Killers — max difficulty)
 */
(function () {
  'use strict';

  const WIN_SCORE = 100000;
  const OPP_DIR = [1, 0, 5, 4, 3, 2];

  // ==================== 1. UNIFIED TIER PROFILES ====================

  const AGENT_PROFILES = {
    triangle: {
      id: 'triangle',
      label: 'Triangle',
      maxDepth: 2,
      timeLimitMs: 45,
      evalNoise: 450,
      blunderRate: 0.55,
      randomMoveRate: 0.45,
      topK: 10,
      useTT: true,
      useQuiescence: false,
      useKillers: false
    },
    square: {
      id: 'square',
      label: 'Square',
      maxDepth: 4,
      timeLimitMs: 180,
      evalNoise: 95,
      blunderRate: 0.14,
      randomMoveRate: 0.0,
      topK: 3,
      useTT: true,
      useQuiescence: false,
      useKillers: true
    },
    pentagon: {
      id: 'pentagon',
      label: 'Pentagon',
      maxDepth: 6,
      timeLimitMs: 420,
      evalNoise: 28,
      blunderRate: 0.05,
      randomMoveRate: 0.0,
      topK: 2,
      useTT: true,
      useQuiescence: true,
      useKillers: true
    },
    hexagon: {
      id: 'hexagon',
      label: 'Hexagon',
      maxDepth: 8,
      timeLimitMs: 850,
      evalNoise: 4,
      blunderRate: 0.0,
      randomMoveRate: 0.0,
      topK: 1,
      useTT: true,
      useQuiescence: true,
      useKillers: true
    }
  };

  function resolveProfile(agentType) {
    if (agentType && AGENT_PROFILES[agentType]) {
      return AGENT_PROFILES[agentType];
    }
    return AGENT_PROFILES.square;
  }

  // ==================== 2. ZOBRIST HASHING & TRANSPOSITION TABLE ====================

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0);
    };
  }

  const rng32 = mulberry32(0x48455843); // "HEXC"

  // Zobrist tables:
  // Board: 37 hexes x 8 codes (0..7)
  // Bench: 4 counters (idx 37..40) x 5 possible values (0..4)
  // Phase: 4 phase values (0..3)
  const Z_BOARD_LO = new Uint32Array(37 * 8);
  const Z_BOARD_HI = new Uint32Array(37 * 8);
  const Z_BENCH_LO = new Uint32Array(4 * 5);
  const Z_BENCH_HI = new Uint32Array(4 * 5);
  const Z_PHASE_LO = new Uint32Array(4);
  const Z_PHASE_HI = new Uint32Array(4);

  for (let i = 0; i < Z_BOARD_LO.length; i++) {
    Z_BOARD_LO[i] = rng32();
    Z_BOARD_HI[i] = rng32();
  }
  for (let i = 0; i < Z_BENCH_LO.length; i++) {
    Z_BENCH_LO[i] = rng32();
    Z_BENCH_HI[i] = rng32();
  }
  for (let i = 0; i < 4; i++) {
    Z_PHASE_LO[i] = rng32();
    Z_PHASE_HI[i] = rng32();
  }

  function hashStateLo(state) {
    let h = Z_PHASE_LO[state[41] & 3];
    for (let i = 0; i < 37; i++) {
      const c = state[i];
      if (c !== 0) h ^= Z_BOARD_LO[(i << 3) | c];
    }
    h ^= Z_BENCH_LO[state[37]];
    h ^= Z_BENCH_LO[5 + state[38]];
    h ^= Z_BENCH_LO[10 + state[39]];
    h ^= Z_BENCH_LO[15 + state[40]];
    return h >>> 0;
  }

  function hashStateHi(state) {
    let h = Z_PHASE_HI[state[41] & 3];
    for (let i = 0; i < 37; i++) {
      const c = state[i];
      if (c !== 0) h ^= Z_BOARD_HI[(i << 3) | c];
    }
    h ^= Z_BENCH_HI[state[37]];
    h ^= Z_BENCH_HI[5 + state[38]];
    h ^= Z_BENCH_HI[10 + state[39]];
    h ^= Z_BENCH_HI[15 + state[40]];
    return h | 0;
  }

  // Fixed-size typed-array Transposition Table (131,072 slots, O(1) generation clear)
  const TT_BITS = 17;
  const TT_SIZE = 1 << TT_BITS;
  const TT_MASK = TT_SIZE - 1;
  const TT_EXACT = 1;
  const TT_LOWER = 2;
  const TT_UPPER = 3;

  const ttTag = new Int32Array(TT_SIZE);
  const ttGen = new Uint16Array(TT_SIZE);
  const ttDepth = new Int8Array(TT_SIZE);
  const ttFlag = new Uint8Array(TT_SIZE);
  const ttScore = new Int32Array(TT_SIZE);
  const ttMove = new Int32Array(TT_SIZE);
  let currentTTGen = 1;

  function resetTTGeneration() {
    currentTTGen = (currentTTGen + 1) & 0xffff;
    if (currentTTGen === 0) {
      ttGen.fill(0);
      currentTTGen = 1;
    }
  }

  // Killer-move table: 2 slots per ply (up to 16 plies)
  const MAX_KILLER_PLY = 16;
  const killerMoves = new Int32Array(MAX_KILLER_PLY * 2);

  function clearKillers() {
    killerMoves.fill(0);
  }

  function storeKiller(ply, moveCode) {
    if (ply < 0 || ply >= MAX_KILLER_PLY || moveCode === 0) return;
    const base = ply << 1;
    if (killerMoves[base] !== moveCode) {
      killerMoves[base + 1] = killerMoves[base];
      killerMoves[base] = moveCode;
    }
  }

  function encodeActionCode(act) {
    if (!act) return 0;
    if (act.type === 'SKIP_PUSHER') return 1;
    if (act.type === 'PLACE_PUSHER') return (2 << 12) | act.toIdx;
    if (act.type === 'PLACE_REGULAR') return (3 << 12) | act.toIdx;
    if (act.type === 'MOVE_PUSHER') return (4 << 12) | (act.fromIdx << 6) | act.toIdx;
    if (act.type === 'MOVE_REGULAR') return (5 << 12) | (act.fromIdx << 6) | act.toIdx;
    return 0;
  }

  function isQuietAction(act, state, engine) {
    if (act.type === 'MOVE_REGULAR') {
      return !act.isCapture && act.toIdx !== engine.CENTER_IDX;
    }
    if (act.type === 'MOVE_PUSHER') {
      return state[act.toIdx] === engine.EMPTY;
    }
    return act.type === 'PLACE_REGULAR' || act.type === 'PLACE_PUSHER';
  }

  // ==================== 3. STATIC POSITION EVALUATOR ====================

  /**
   * Heuristic Position Evaluator (from Blue's perspective: + favors Blue, - favors Orange).
   */
  function evaluatePositionForBlue(compactState, engine) {
    const counts = engine.getPieceCounts(compactState);

    if (counts.oTotalAlive === 0 && counts.bTotalAlive > 0) return WIN_SCORE;
    if (counts.bTotalAlive === 0 && counts.oTotalAlive > 0) return -WIN_SCORE;
    if (counts.bTotalAlive === 0 && counts.oTotalAlive === 0) return 0;

    let score = 0;

    // 1. Core Material & Promotions
    score += (counts.bTotalAlive - counts.oTotalAlive) * 1450;
    score += (counts.bBoardReg - counts.oBoardReg) * 115;
    score += (counts.bBoardPromo - counts.oBoardPromo) * 620;
    score += (counts.bBoardPush - counts.oBoardPush) * 65;

    // 2. Positional & Tactical Evaluation across the 37 hexes
    const hexes = engine.CANONICAL_HEXES;
    const neighbors = engine.NEIGHBORS;

    for (let idx = 0; idx < 37; idx++) {
      const code = compactState[idx];
      if (code === engine.EMPTY) continue;

      const dist = hexes[idx].dist;

      if (
        code === engine.B_REG ||
        code === engine.B_PROMO ||
        code === engine.O_REG ||
        code === engine.O_PROMO
      ) {
        const isBlue = code === engine.B_REG || code === engine.B_PROMO;
        const sign = isBlue ? 1 : -1;
        const isPromo = code === engine.B_PROMO || code === engine.O_PROMO;
        let piecePosScore = 0;

        if (dist === 1) {
          piecePosScore += isPromo ? 95 : 135;
        } else if (dist === 0) {
          piecePosScore += 80;
        } else if (dist === 2) {
          piecePosScore += 35;
        } else {
          piecePosScore -= 28;
        }

        const enemyPushCode = isBlue ? engine.O_PUSH : engine.B_PUSH;
        const oppBenchPush = isBlue ? compactState[40] : compactState[38];

        for (let pushDir = 0; pushDir < 6; pushDir++) {
          const destIdx = neighbors[idx][pushDir];
          const pusherOriginIdx = neighbors[idx][OPP_DIR[pushDir]];
          if (pusherOriginIdx === -1) continue;

          const originCode = compactState[pusherOriginIdx];
          const hasThreateningPusher = originCode === enemyPushCode || originCode === engine.N_PUSH;

          if (hasThreateningPusher) {
            if (destIdx === -1) {
              piecePosScore -= 340;
            } else if (engine.isPusherCode(compactState[destIdx])) {
              piecePosScore -= 360;
            }
          } else if (originCode === engine.EMPTY && oppBenchPush > 0 && pusherOriginIdx !== engine.CENTER_IDX) {
            if (destIdx === -1 || engine.isPusherCode(compactState[destIdx])) {
              piecePosScore -= 95;
            }
          }
        }

        score += sign * piecePosScore;
      } else if (code === engine.B_PUSH || code === engine.O_PUSH) {
        const sign = code === engine.B_PUSH ? 1 : -1;
        if (dist === 1 || dist === 2) {
          score += sign * 24;
        }
      }
    }

    // Tempo bonus
    const active = engine.activePlayerFromPhase(compactState[41]);
    score += active === 'blue' ? 18 : -18;

    return score;
  }

  // ==================== 4. MOVE ORDERING & FILTERING ====================

  function orderAndFilterActions(compactState, actions, engine, ttMoveCode, ply, useKillers) {
    const scored = [];
    const phase = compactState[41];
    const isOpt = engine.isPusherOptionalPhase(phase);
    const kBase = useKillers && ply >= 0 && ply < MAX_KILLER_PLY ? ply << 1 : -1;
    const k1 = kBase >= 0 ? killerMoves[kBase] : 0;
    const k2 = kBase >= 0 ? killerMoves[kBase + 1] : 0;

    for (let i = 0; i < actions.length; i++) {
      const act = actions[i];
      const code = encodeActionCode(act);
      let priority = 0;

      if (ttMoveCode !== 0 && code === ttMoveCode) {
        scored.push({ act, code, priority: 50000 });
        continue;
      }

      if (act.type === 'SKIP_PUSHER') {
        scored.push({ act, code, priority: 190 });
        continue;
      }

      if (act.type === 'MOVE_REGULAR') {
        if (act.isCapture) priority += 900;
        if (
          act.toIdx === engine.CENTER_IDX &&
          compactState[act.fromIdx] !== engine.B_PROMO &&
          compactState[act.fromIdx] !== engine.O_PROMO
        ) {
          priority += 650;
        }
        if (engine.IS_SAFE_HEX[act.toIdx]) priority += 120;
        if (k1 !== 0 && code === k1) priority += 420;
        else if (k2 !== 0 && code === k2) priority += 380;
        scored.push({ act, code, priority });
        continue;
      }

      if (act.type === 'PLACE_REGULAR') {
        priority = 140;
        const neighbors = engine.NEIGHBORS[act.toIdx];
        for (let d = 0; d < 6; d++) {
          const nIdx = neighbors[d];
          if (nIdx !== -1 && engine.isPusherCode(compactState[nIdx])) {
            priority -= 60;
          }
        }
        if (k1 !== 0 && code === k1) priority += 420;
        else if (k2 !== 0 && code === k2) priority += 380;
        scored.push({ act, code, priority });
        continue;
      }

      if (act.type === 'MOVE_PUSHER') {
        const targetCode = compactState[act.toIdx];
        if (targetCode !== engine.EMPTY) {
          const { events } = engine.applyAtomicAction(compactState, act);
          priority = 320;
          const active = engine.activePlayerFromPhase(phase);
          for (let e = 0; e < events.length; e++) {
            const ev = events[e];
            if (ev.type === 'EDGE_CAPTURE' || ev.type === 'CRUSH_CAPTURE') {
              priority += ev.owner !== active ? 1200 : -800;
            } else if (ev.type === 'PROMOTION') {
              priority += ev.owner === active ? 700 : -500;
            }
          }
        } else {
          priority = 55;
          const adj = engine.NEIGHBORS[act.toIdx];
          for (let d = 0; d < 6; d++) {
            const nIdx = adj[d];
            if (nIdx !== -1 && engine.isRegularOrPromoCode(compactState[nIdx])) {
              priority += 75;
              break;
            }
          }
          if (k1 !== 0 && code === k1) priority += 420;
          else if (k2 !== 0 && code === k2) priority += 380;
        }
        scored.push({ act, code, priority });
        continue;
      }

      if (act.type === 'PLACE_PUSHER') {
        let nearPiece = false;
        const dist = engine.CANONICAL_HEXES[act.toIdx].dist;
        const adj = engine.NEIGHBORS[act.toIdx];
        for (let d = 0; d < 6; d++) {
          const nIdx = adj[d];
          if (nIdx !== -1 && compactState[nIdx] !== engine.EMPTY) {
            nearPiece = true;
            if (engine.isRegularOrPromoCode(compactState[nIdx])) priority += 155;
            else priority += 30;
          }
        }
        if (nearPiece) {
          let p = 90 + priority;
          if (k1 !== 0 && code === k1) p += 420;
          else if (k2 !== 0 && code === k2) p += 380;
          scored.push({ act, code, priority: p });
        } else if (isOpt && dist === 1) {
          scored.push({ act, code, priority: 45 });
        }
      }
    }

    if (scored.length === 0) {
      return actions.map((act) => ({ act, code: encodeActionCode(act), priority: 0 }));
    }

    scored.sort((a, b) => b.priority - a.priority);
    return scored;
  }

  // ==================== 5. QUIESCENCE & ALPHA-BETA SEARCH ====================

  function getTacticalActions(state, engine) {
    const phase = state[41];
    const tactical = [];

    if (!engine.isPusherOptionalPhase(phase)) {
      const regActs = engine.getLegalRegularActions(state);
      for (let i = 0; i < regActs.length; i++) {
        const act = regActs[i];
        if (act.type !== 'MOVE_REGULAR') continue;
        const isPromo =
          act.toIdx === engine.CENTER_IDX &&
          state[act.fromIdx] !== engine.B_PROMO &&
          state[act.fromIdx] !== engine.O_PROMO;
        if (act.isCapture || isPromo) {
          tactical.push({ act, priority: (act.isCapture ? 900 : 0) + (isPromo ? 650 : 0) });
        }
      }
    } else {
      const pushActs = engine.getLegalPusherActions(state);
      const active = engine.activePlayerFromPhase(phase);
      for (let i = 0; i < pushActs.length; i++) {
        const act = pushActs[i];
        if (act.type !== 'MOVE_PUSHER' || state[act.toIdx] === engine.EMPTY) continue;
        const { events } = engine.applyAtomicAction(state, act);
        let priority = 0;
        let hasTacticalEvent = false;
        for (let e = 0; e < events.length; e++) {
          const ev = events[e];
          if (ev.type === 'EDGE_CAPTURE' || ev.type === 'CRUSH_CAPTURE') {
            hasTacticalEvent = true;
            priority += ev.owner !== active ? 1200 : -800;
          } else if (ev.type === 'PROMOTION') {
            hasTacticalEvent = true;
            priority += ev.owner === active ? 700 : -500;
          }
        }
        if (hasTacticalEvent && priority > 0) {
          tactical.push({ act, priority });
        }
      }
    }

    if (tactical.length > 1) {
      tactical.sort((a, b) => b.priority - a.priority);
    }
    return tactical;
  }

  function quiescence(state, alpha, beta, qDepth, ctx, engine) {
    const counts = engine.getPieceCounts(state);
    if (counts.oTotalAlive === 0 && counts.bTotalAlive > 0) return WIN_SCORE + qDepth * 10;
    if (counts.bTotalAlive === 0 && counts.oTotalAlive > 0) return -WIN_SCORE - qDepth * 10;
    if (counts.bTotalAlive === 0 && counts.oTotalAlive === 0) return 0;

    const standPat = evaluatePositionForBlue(state, engine);
    if (qDepth <= 0) return standPat;

    if (ctx.allowTimeout && (ctx.nodes & 255) === 0 && performance.now() - ctx.startTime > ctx.timeLimitMs) {
      ctx.timedOut = true;
      return standPat;
    }
    ctx.nodes++;

    const maximizing = engine.activePlayerFromPhase(state[41]) === 'blue';

    if (maximizing) {
      if (standPat >= beta) return beta;
      if (standPat > alpha) alpha = standPat;

      const tactical = getTacticalActions(state, engine);
      for (let i = 0; i < tactical.length; i++) {
        const { nextState } = engine.applyAtomicAction(state, tactical[i].act);
        const score = quiescence(nextState, alpha, beta, qDepth - 1, ctx, engine);
        if (ctx.timedOut) return alpha;
        if (score >= beta) return beta;
        if (score > alpha) alpha = score;
      }
      return alpha;
    } else {
      if (standPat <= alpha) return alpha;
      if (standPat < beta) beta = standPat;

      const tactical = getTacticalActions(state, engine);
      for (let i = 0; i < tactical.length; i++) {
        const { nextState } = engine.applyAtomicAction(state, tactical[i].act);
        const score = quiescence(nextState, alpha, beta, qDepth - 1, ctx, engine);
        if (ctx.timedOut) return beta;
        if (score <= alpha) return alpha;
        if (score < beta) beta = score;
      }
      return beta;
    }
  }

  function alphaBeta(state, depth, ply, alpha, beta, ctx, engine) {
    ctx.nodes++;

    const counts = engine.getPieceCounts(state);
    if (counts.oTotalAlive === 0 && counts.bTotalAlive > 0) {
      return WIN_SCORE + depth * 50;
    }
    if (counts.bTotalAlive === 0 && counts.oTotalAlive > 0) {
      return -WIN_SCORE - depth * 50;
    }
    if (counts.bTotalAlive === 0 && counts.oTotalAlive === 0) {
      return 0;
    }

    if (ctx.allowTimeout && (ctx.nodes & 255) === 0 && performance.now() - ctx.startTime > ctx.timeLimitMs) {
      ctx.timedOut = true;
      return evaluatePositionForBlue(state, engine);
    }

    if (depth <= 0) {
      if (ctx.useQuiescence) {
        return quiescence(state, alpha, beta, 2, ctx, engine);
      }
      return evaluatePositionForBlue(state, engine);
    }

    const origAlpha = alpha;
    const origBeta = beta;
    let ttMoveCode = 0;
    let slot = 0;
    let tag = 0;

    if (ctx.useTT) {
      const hLo = hashStateLo(state);
      tag = hashStateHi(state);
      slot = hLo & TT_MASK;
      if (ttGen[slot] === currentTTGen && ttTag[slot] === tag) {
        ttMoveCode = ttMove[slot];
        if (ttDepth[slot] >= depth) {
          const cached = ttScore[slot];
          const flag = ttFlag[slot];
          if (flag === TT_EXACT) return cached;
          if (flag === TT_LOWER && cached > alpha) alpha = cached;
          else if (flag === TT_UPPER && cached < beta) beta = cached;
          if (alpha >= beta) return cached;
        }
      }
    }

    const rawActions = engine.getLegalAtomicActions(state);
    if (rawActions.length === 0) return 0;

    const ordered = orderAndFilterActions(state, rawActions, engine, ttMoveCode, ply, ctx.useKillers);
    const maximizing = engine.activePlayerFromPhase(state[41]) === 'blue';

    let best = maximizing ? -Infinity : Infinity;
    let bestMoveCode = ordered[0].code;

    if (maximizing) {
      for (let i = 0; i < ordered.length; i++) {
        const item = ordered[i];
        const { nextState } = engine.applyAtomicAction(state, item.act);
        const val = alphaBeta(nextState, depth - 1, ply + 1, alpha, beta, ctx, engine);
        if (ctx.timedOut) return best === -Infinity ? evaluatePositionForBlue(state, engine) : best;

        if (val > best) {
          best = val;
          bestMoveCode = item.code;
        }
        if (best > alpha) alpha = best;
        if (beta <= alpha) {
          if (ctx.useKillers && isQuietAction(item.act, state, engine)) {
            storeKiller(ply, item.code);
          }
          break;
        }
      }
    } else {
      for (let i = 0; i < ordered.length; i++) {
        const item = ordered[i];
        const { nextState } = engine.applyAtomicAction(state, item.act);
        const val = alphaBeta(nextState, depth - 1, ply + 1, alpha, beta, ctx, engine);
        if (ctx.timedOut) return best === Infinity ? evaluatePositionForBlue(state, engine) : best;

        if (val < best) {
          best = val;
          bestMoveCode = item.code;
        }
        if (best < beta) beta = best;
        if (beta <= alpha) {
          if (ctx.useKillers && isQuietAction(item.act, state, engine)) {
            storeKiller(ply, item.code);
          }
          break;
        }
      }
    }

    if (ctx.useTT && !ctx.timedOut) {
      let flag = TT_EXACT;
      if (best <= origAlpha) flag = TT_UPPER;
      else if (best >= origBeta) flag = TT_LOWER;

      if (ttGen[slot] !== currentTTGen || depth >= ttDepth[slot]) {
        ttGen[slot] = currentTTGen;
        ttTag[slot] = tag;
        ttDepth[slot] = depth;
        ttFlag[slot] = flag;
        ttScore[slot] = best;
        ttMove[slot] = bestMoveCode;
      }
    }

    return best;
  }

  /**
   * Unified Iterative-Deepening Search for all 4 polygon tiers.
   */
  function searchRootScored(rootState, profile, engine) {
    const startTime = performance.now();
    const rootPlayer = engine.activePlayerFromPhase(rootState[41]);
    const isMaximizingRoot = rootPlayer === 'blue';

    const rawRootActions = engine.getLegalAtomicActions(rootState);
    if (rawRootActions.length === 0) return [];

    if (profile.useTT) resetTTGeneration();
    if (profile.useKillers) clearKillers();

    let ordered = orderAndFilterActions(rootState, rawRootActions, engine, 0, 0, profile.useKillers);
    let completedScores = null;

    for (let depth = 2; depth <= profile.maxDepth; depth += 2) {
      const ctx = {
        startTime,
        timeLimitMs: profile.timeLimitMs,
        allowTimeout: depth > 2,
        timedOut: false,
        nodes: 0,
        useTT: profile.useTT,
        useQuiescence: profile.useQuiescence,
        useKillers: profile.useKillers
      };

      let alpha = -Infinity;
      let beta = Infinity;
      const iterScores = [];
      // Keep a soft window margin at root whenever noise or blunder sampling is active
      // so pruned bad moves can never be confused with the best move.
      const rootMargin =
        profile.blunderRate > 0
          ? profile.evalNoise * 2 + 120
          : profile.evalNoise > 0
            ? profile.evalNoise * 2 + 8
            : 0;

      for (let i = 0; i < ordered.length; i++) {
        if (ctx.allowTimeout && performance.now() - startTime > profile.timeLimitMs) {
          ctx.timedOut = true;
          break;
        }

        const item = ordered[i];
        const { nextState } = engine.applyAtomicAction(rootState, item.act);
        const searchAlpha = isMaximizingRoot && alpha !== -Infinity ? alpha - rootMargin : alpha;
        const searchBeta = !isMaximizingRoot && beta !== Infinity ? beta + rootMargin : beta;
        const val = alphaBeta(nextState, depth - 1, 1, searchAlpha, searchBeta, ctx, engine);

        if (ctx.timedOut) break;

        iterScores.push({ act: item.act, code: item.code, score: val });

        if (isMaximizingRoot) {
          if (val > alpha) alpha = val;
        } else {
          if (val < beta) beta = val;
        }
      }

      if (!ctx.timedOut && iterScores.length > 0) {
        iterScores.sort((a, b) => (isMaximizingRoot ? b.score - a.score : a.score - b.score));
        completedScores = iterScores;
        ordered = iterScores.map((r) => ({ act: r.act, code: r.code, priority: r.score }));

        // Stop early on forced win
        if (Math.abs(iterScores[0].score) >= WIN_SCORE - 500) break;
      } else {
        break;
      }

      if (performance.now() - startTime > profile.timeLimitMs * 0.6) break;
    }

    if (!completedScores || completedScores.length === 0) {
      return ordered.map((o) => ({ act: o.act, code: o.code, score: 0 }));
    }
    return completedScores;
  }

  /**
   * Primary stateless AI entry point:
   * chooseAction(compactState, agentType) -> Action
   */
  function chooseAction(compactState, agentType = 'square') {
    const engine = window.HexChessEngine;
    if (!engine) throw new Error('HexChessEngine must be loaded before HexChessAI');

    const legalActions = engine.getLegalAtomicActions(compactState);
    if (legalActions.length === 0) return null;
    if (legalActions.length === 1) return legalActions[0];

    const profile = resolveProfile(agentType);

    // Beginner random-move slip (keeps Triangle genuinely slightly above random)
    if (profile.randomMoveRate > 0 && Math.random() < profile.randomMoveRate) {
      return legalActions[Math.floor(Math.random() * legalActions.length)];
    }

    const rootPlayer = engine.activePlayerFromPhase(compactState[41]);
    const isMaximizingRoot = rootPlayer === 'blue';

    const scored = searchRootScored(compactState, profile, engine);

    // Apply evaluation noise (Gaussian-like triangular noise in [-evalNoise, +evalNoise])
    if (profile.evalNoise > 0) {
      for (let i = 0; i < scored.length; i++) {
        const noise = (Math.random() - Math.random()) * profile.evalNoise;
        scored[i].noisyScore = scored[i].score + noise;
      }
      scored.sort((a, b) => (isMaximizingRoot ? b.noisyScore - a.noisyScore : a.noisyScore - b.noisyScore));
    }

    // Controlled suboptimal "mistake" sampling for lower tiers
    if (profile.blunderRate > 0 && scored.length > 1 && Math.random() < profile.blunderRate) {
      const k = Math.min(profile.topK || 3, scored.length);
      // Avoid picking index 0 when a blunder triggers so the mistake is genuinely suboptimal
      const pickIdx = 1 + Math.floor(Math.random() * (k - 1));
      return scored[pickIdx].act;
    }

    return scored[0].act;
  }

  // ==================== 6. POST-GAME MOVE QUALITY ANALYZER ====================

  const ANALYZE_PROFILE = {
    id: 'analyzer',
    label: 'Analyzer',
    maxDepth: 4,
    timeLimitMs: 140,
    evalNoise: 0,
    blunderRate: 0,
    topK: 1,
    useTT: true,
    useQuiescence: true,
    useKillers: true
  };

  function clampEval(v) {
    if (v > 3000) return 3000;
    if (v < -3000) return -3000;
    return v;
  }

  function classifyEvalLoss(loss) {
    if (loss <= 35) return { key: 'best', label: 'Best', tag: '!' };
    if (loss <= 120) return { key: 'good', label: 'Good', tag: '' };
    if (loss <= 300) return { key: 'inaccuracy', label: 'Inaccuracy', tag: '?!' };
    if (loss <= 700) return { key: 'mistake', label: 'Mistake', tag: '?' };
    return { key: 'blunder', label: 'Blunder', tag: '??' };
  }

  function sameRecordedAction(engineAct, recAct) {
    if (!engineAct || !recAct || engineAct.type !== recAct.type) return false;
    if (recAct.type === 'PLACE_PUSHER' || recAct.type === 'PLACE_REGULAR') {
      return (
        engineAct.to &&
        recAct.to &&
        engineAct.to[0] === recAct.to[0] &&
        engineAct.to[1] === recAct.to[1] &&
        engineAct.to[2] === recAct.to[2]
      );
    }
    if (recAct.type === 'MOVE_PUSHER' || recAct.type === 'MOVE_REGULAR') {
      return (
        engineAct.from &&
        recAct.from &&
        engineAct.to &&
        recAct.to &&
        engineAct.from[0] === recAct.from[0] &&
        engineAct.from[1] === recAct.from[1] &&
        engineAct.from[2] === recAct.from[2] &&
        engineAct.to[0] === recAct.to[0] &&
        engineAct.to[1] === recAct.to[1] &&
        engineAct.to[2] === recAct.to[2]
      );
    }
    return true;
  }

  /**
   * Evaluates every recorded ply in a completed game using 4-ply + Quiescence search.
   * Returns per-ply annotations, per-player accuracy & counts, and top turning points.
   */
  function analyzeGame(initialStateStr, history) {
    const engine = window.HexChessEngine;
    if (!engine) throw new Error('HexChessEngine must be loaded before HexChessAI');

    const initPlayerStats = () => ({
      moves: 0,
      totalLoss: 0,
      avgLoss: 0,
      accuracy: 100,
      counts: { best: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0 }
    });

    const players = {
      blue: initPlayerStats(),
      orange: initPlayerStats()
    };

    const plyEvaluations = [];
    let currentState = engine.decodeStateString(initialStateStr);

    for (let i = 0; i < history.length; i++) {
      const entry = history[i];

      // If player skipped Pusher step before this Regular move, advance state silently
      if (entry.phase === 'REGULAR' && engine.isPusherOptionalPhase(currentState[41])) {
        currentState = engine.applyAtomicAction(currentState, { type: 'SKIP_PUSHER' }).nextState;
      }

      const actingPlayer = entry.player;
      const sign = actingPlayer === 'blue' ? 1 : -1;

      const rawLegal = engine.getLegalAtomicActions(currentState);
      let evalLoss = 0;
      let bestScore = 0;
      let playedScore = 0;
      let bestAction = null;

      if (rawLegal.length > 1) {
        const scored = searchRootScored(currentState, ANALYZE_PROFILE, engine);
        bestAction = scored[0].act;
        bestScore = clampEval(scored[0].score * sign);

        if (sameRecordedAction(bestAction, entry.action)) {
          playedScore = bestScore;
        } else {
          // Evaluate the actually played resulting state with a full unpruned window
          // so evalLoss is exact (not clamped by root alpha/beta cutoffs).
          const afterState = engine.decodeStateString(entry.state);
          resetTTGeneration();
          clearKillers();
          const ctx = {
            startTime: performance.now(),
            timeLimitMs: 90,
            allowTimeout: true,
            timedOut: false,
            nodes: 0,
            useTT: true,
            useQuiescence: true,
            useKillers: true
          };
          const directScore = alphaBeta(afterState, 3, 1, -Infinity, Infinity, ctx, engine);
          playedScore = clampEval(directScore * sign);
        }

        evalLoss = Math.max(0, Math.round(bestScore - playedScore));
      }

      const cls = classifyEvalLoss(evalLoss);
      const ps = players[actingPlayer];
      ps.moves++;
      ps.totalLoss += evalLoss;
      ps.counts[cls.key]++;

      plyEvaluations.push({
        ply: i + 1,
        turn: entry.turn,
        player: actingPlayer,
        phase: entry.phase,
        action: entry.action,
        evalLoss,
        bestScore: Math.round(bestScore),
        playedScore: Math.round(playedScore),
        classification: cls.key,
        label: cls.label,
        tag: cls.tag,
        bestAction
      });

      currentState = engine.decodeStateString(entry.state);
    }

    for (const color of ['blue', 'orange']) {
      const ps = players[color];
      if (ps.moves > 0) {
        ps.avgLoss = ps.totalLoss / ps.moves;
        ps.accuracy = Math.max(0, Math.min(100, 100 * Math.exp(-ps.avgLoss / 450)));
      }
    }

    // Top 3 largest turning points (mistakes / blunders)
    const turningPoints = plyEvaluations
      .filter((p) => p.evalLoss > 120)
      .slice()
      .sort((a, b) => b.evalLoss - a.evalLoss)
      .slice(0, 3);

    return {
      players,
      plyEvaluations,
      turningPoints
    };
  }

  window.HexChessAI = {
    AGENT_PROFILES,
    chooseAction,
    evaluatePositionForBlue,
    analyzeGame
  };
})();
