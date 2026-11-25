#!/usr/bin/env python3
"""
HexChess Headless AI-vs-AI Batch Generator

Runs fast, multi-process AI-vs-AI HexChess battles using the exact game.js rules
engine and ai.js agents (via persistent headless Node.js workers), saving every
game in the exact JSON schema used in records/.

Model selection weights (applied identically to Blue and Orange):
  - heuristic-6ply-v1 (most powerful): 2/3  (8/12 = 66.67%)
  - heuristic-v1      (middle model) : 1/4  (3/12 = 25.00%)
  - random-v1         (random model) : 1/12 (1/12 =  8.33%)

Matchups are generated with exact color-symmetry (every (A, B) cross-tier game
is paired 1-to-1 with (B, A)), guaranteeing Blue and Orange receive an identical
number of games with every model for unbiased first-move advantage analysis.

Usage:
  python generate_games.py                  # Run 5000 games into ./records
  python generate_games.py --games 100      # Quick test run
  python generate_games.py --workers 12     # Override worker count
"""

from __future__ import annotations

import argparse
import json
import math
import os
import queue
import random
import re
import shutil
import signal
import subprocess
import sys
import threading
import time
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple

# Agent identifiers matching ai.js and game.js (agentNameFromTier)
AGENT_HARD = "heuristic-6ply-v1"
AGENT_MID = "heuristic-v1"
AGENT_RAND = "random-v1"

AGENTS = [AGENT_HARD, AGENT_MID, AGENT_RAND]
AGENT_SHORT = {
    AGENT_HARD: "6ply",
    AGENT_MID: "4ply",
    AGENT_RAND: "rand",
}
# Exact rational weights: 2/3, 1/4, 1/12 (sum = 12/12 = 1)
AGENT_WEIGHTS_12 = {
    AGENT_HARD: 8,
    AGENT_MID: 3,
    AGENT_RAND: 1,
}

GAME_ID_CHARS = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"
EXISTING_ID_RE = re.compile(r"_([2-9A-HJ-NP-Z]{4})\.json$")

# Persistent headless Node.js worker script.
# Loads the exact workspace game.js and ai.js once, then processes NDJSON game
# jobs from stdin and emits compact NDJSON result summaries to stdout.
NODE_WORKER_JS = r"""
'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const workspaceDir = process.argv[1];
const outputDir = process.argv[2];
const compactJson = process.argv[3] === '1';

// Provide minimal browser-compatible global shim expected by game.js & ai.js
global.window = global;

require(path.join(workspaceDir, 'game.js'));
require(path.join(workspaceDir, 'ai.js'));

const engine = global.window.HexChessEngine;
const ai = global.window.HexChessAI;

if (!engine || !ai) {
  console.error('Failed to load HexChessEngine or HexChessAI');
  process.exit(1);
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

function getRecordFilename(now, gameId) {
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(
    now.getHours()
  )}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `hexchess_${stamp}_${gameId}.json`;
}

function playSingleGame(job) {
  const t0 = performance.now();
  let compact = engine.createInitialCompactState();
  const initialStateStr = engine.encodeStateString(compact);
  let turnNumber = 1;
  let halfTurnsWithoutProgress = 0;
  const history = [];

  const players = {
    blue: { type: 'ai', agent: job.blue },
    orange: { type: 'ai', agent: job.orange }
  };

  let winner = null;
  let reason = null;

  // Hard safety ceiling (30-turn draw rule caps non-progress turns at 60,
  // and max placements/captures are bounded, so real games finish well under 600 plies)
  const MAX_STEPS = 2000;
  let steps = 0;

  while (steps < MAX_STEPS) {
    steps++;
    const active = engine.activePlayerFromPhase(compact[41]);
    const agentId = players[active].agent;

    const chosen = ai.chooseAction(compact.slice(), agentId);
    if (!chosen) {
      winner = 'draw';
      reason = 'stalemate';
      break;
    }

    if (chosen.type === 'SKIP_PUSHER') {
      // Apply silently without recording in JSON history (exact match with game.js)
      compact = engine.applyAtomicAction(compact, chosen).nextState;
      const termAfterSkip = engine.evaluateTerminal(compact, halfTurnsWithoutProgress);
      if (termAfterSkip.over) {
        winner = termAfterSkip.winner;
        reason = termAfterSkip.reason;
        break;
      }
      continue;
    }

    const beforeCompact = compact.slice();
    const actingPlayer = engine.activePlayerFromPhase(beforeCompact[41]);
    const phaseLabel = chosen.type.includes('PUSHER') ? 'PUSHER' : 'REGULAR';

    const { nextState, events, resetDrawClock } = engine.applyAtomicAction(beforeCompact, chosen);
    compact = nextState;

    history.push({
      turn: turnNumber,
      player: actingPlayer,
      phase: phaseLabel,
      action: formatActionForRecord(chosen),
      events,
      state: engine.encodeStateString(compact)
    });

    if (resetDrawClock) {
      halfTurnsWithoutProgress = 0;
    } else if (phaseLabel === 'REGULAR') {
      halfTurnsWithoutProgress++;
    }

    const term = engine.evaluateTerminal(compact, halfTurnsWithoutProgress);

    if (phaseLabel === 'REGULAR' && !term.over) {
      turnNumber++;
    }

    if (term.over) {
      winner = term.winner;
      reason = term.reason;
      break;
    }
  }

  if (winner === null) {
    winner = 'draw';
    reason = 'max_steps';
  }

  const now = new Date();
  const record = {
    schemaVersion: '1.0.0',
    gameId: job.gameId,
    timestamp: now.toISOString(),
    mode: 'aivai',
    players,
    result: {
      winner,
      reason,
      totalTurns: turnNumber
    },
    initialState: initialStateStr,
    history
  };

  const filename = getRecordFilename(now, job.gameId);
  const finalPath = path.join(outputDir, filename);
  const tmpPath = finalPath + '.tmp';
  const jsonText = compactJson ? JSON.stringify(record) : JSON.stringify(record, null, 2);

  fs.writeFileSync(tmpPath, jsonText, 'utf8');
  fs.renameSync(tmpPath, finalPath);

  return {
    jobId: job.jobId,
    gameId: job.gameId,
    filename,
    blue: job.blue,
    orange: job.orange,
    winner,
    reason,
    totalTurns: turnNumber,
    plies: history.length,
    elapsedMs: Math.round(performance.now() - t0)
  };
}

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on('line', (line) => {
  if (!line.trim()) return;
  try {
    const job = JSON.parse(line);
    const summary = playSingleGame(job);
    process.stdout.write(JSON.stringify(summary) + '\n');
  } catch (err) {
    process.stdout.write(JSON.stringify({ error: String(err && err.stack ? err.stack : err) }) + '\n');
  }
});
"""


def build_balanced_schedule(total_games: int, rng: random.Random) -> List[Tuple[str, str]]:
    """
    Build a stratified, color-balanced list of (blue_agent, orange_agent) matchups
    following the independent joint distribution of (2/3, 1/4, 1/12).

    Guarantees:
      1. Exact color symmetry: count(A, B) == count(B, A) for all A != B.
      2. Exact equal exposure: count_blue[m] == count_orange[m] for every model m.
      3. Paired interleaving: cross-tier games are scheduled in swapped pairs
         [(A, B), (B, A)] shuffled together so even an interrupted run stays balanced.
    """
    # Unordered matchup buckets with exact weights out of 144:
    # Mirrors: (H,H)=64, (M,M)=9, (R,R)=1
    # Swapped pairs (each pair = 2 games):
    #   {(H,M),(M,H)} = 48 (24 each), {(H,R),(R,H)} = 16 (8 each), {(M,R),(R,M)} = 6 (3 each)
    mirrors = [
        (AGENT_HARD, AGENT_HARD, 64),
        (AGENT_MID, AGENT_MID, 9),
        (AGENT_RAND, AGENT_RAND, 1),
    ]
    cross_pairs = [
        (AGENT_HARD, AGENT_MID, 48),  # total weight for both directions combined
        (AGENT_HARD, AGENT_RAND, 16),
        (AGENT_MID, AGENT_RAND, 6),
    ]

    # Step 1: Allocate integer number of swapped PAIRS (each pair = 2 games)
    pair_counts: Dict[Tuple[str, str], int] = {}
    used_games = 0
    for a, b, w in cross_pairs:
        expected_pairs = (total_games * w) / (144.0 * 2.0)
        n_pairs = int(round(expected_pairs))
        # Don't exceed total_games
        while used_games + 2 * n_pairs > total_games and n_pairs > 0:
            n_pairs -= 1
        pair_counts[(a, b)] = n_pairs
        used_games += 2 * n_pairs

    # Step 2: Allocate remaining games across mirror matches proportionally
    rem_games = total_games - used_games
    mirror_weight_sum = sum(w for _, _, w in mirrors)  # 74
    mirror_counts: Dict[Tuple[str, str], int] = {}
    mirror_fracs: List[Tuple[float, Tuple[str, str]]] = []
    allocated_mirrors = 0

    for a, b, w in mirrors:
        exact = rem_games * (w / mirror_weight_sum)
        floor_val = int(math.floor(exact))
        mirror_counts[(a, b)] = floor_val
        allocated_mirrors += floor_val
        mirror_fracs.append((exact - floor_val, (a, b)))

    # Distribute rounding remainder by largest fractional part
    mirror_fracs.sort(key=lambda x: x[0], reverse=True)
    for idx in range(rem_games - allocated_mirrors):
        key = mirror_fracs[idx % len(mirror_fracs)][1]
        mirror_counts[key] += 1

    # Step 3: Build atomic blocks (singletons for mirrors, swapped pairs for cross-tier)
    blocks: List[List[Tuple[str, str]]] = []
    for (a, b), count in mirror_counts.items():
        for _ in range(count):
            blocks.append([(a, b)])

    for (a, b), n_pairs in pair_counts.items():
        for _ in range(n_pairs):
            if rng.random() < 0.5:
                blocks.append([(a, b), (b, a)])
            else:
                blocks.append([(b, a), (a, b)])

    rng.shuffle(blocks)

    schedule: List[Tuple[str, str]] = []
    for block in blocks:
        schedule.extend(block)

    assert len(schedule) == total_games
    return schedule


def load_existing_game_ids(output_dir: Path) -> set[str]:
    used: set[str] = set()
    if not output_dir.exists():
        return used
    for entry in output_dir.iterdir():
        m = EXISTING_ID_RE.search(entry.name)
        if m:
            used.add(m.group(1))
    return used


def generate_unique_game_id(used_ids: set[str], rng: random.Random) -> str:
    while True:
        gid = "".join(rng.choices(GAME_ID_CHARS, k=4))
        if gid not in used_ids:
            used_ids.add(gid)
            return gid


def format_duration(seconds: float) -> str:
    if seconds < 0 or not math.isfinite(seconds):
        return "--:--"
    total = int(round(seconds))
    h, rem = divmod(total, 3600)
    m, s = divmod(rem, 60)
    if h > 0:
        return f"{h}h {m:02d}m {s:02d}s"
    return f"{m}m {s:02d}s"


def two_sided_binomial_p(wins: int, decisive: int) -> Tuple[float, float]:
    """
    Compute two-sided z-score (with continuity correction) and p-value for
    H0: p = 0.5. Uses exact binomial sum when decisive <= 1000, normal approx above.
    """
    if decisive <= 0:
        return 0.0, 1.0
    mean = decisive * 0.5
    sd = math.sqrt(decisive * 0.25)
    diff = abs(wins - mean)
    z = (wins - mean) / sd if sd > 0 else 0.0

    if decisive <= 1000:
        k_lo = min(wins, decisive - wins)
        # Sum P(X <= k_lo) in log space for numerical stability
        log_half = -decisive * math.log(2.0)
        tail = 0.0
        for k in range(0, k_lo + 1):
            log_p = math.lgamma(decisive + 1) - math.lgamma(k + 1) - math.lgamma(decisive - k + 1) + log_half
            tail += math.exp(log_p)
        p_val = min(1.0, 2.0 * tail)
        return z, p_val

    z_cc = max(0.0, diff - 0.5) / sd
    p_val = math.erfc(z_cc / math.sqrt(2.0))
    return z, p_val


class StatsTracker:
    def __init__(self, total_target: int) -> None:
        self.total_target = total_target
        self.completed = 0
        self.errors = 0
        self.winners: Dict[str, int] = defaultdict(int)
        self.reasons: Dict[str, int] = defaultdict(int)
        self.blue_models: Dict[str, int] = defaultdict(int)
        self.orange_models: Dict[str, int] = defaultdict(int)
        self.matchups: Dict[Tuple[str, str], Dict[str, float]] = defaultdict(
            lambda: {
                "games": 0,
                "blue": 0,
                "orange": 0,
                "draw": 0,
                "turns": 0,
                "ms": 0.0,
            }
        )
        self.total_turns = 0
        self.total_plies = 0
        self.total_worker_ms = 0.0

    def record(self, res: dict) -> None:
        self.completed += 1
        w = res["winner"]
        r = res["reason"]
        b = res["blue"]
        o = res["orange"]
        turns = int(res["totalTurns"])
        plies = int(res["plies"])
        ms = float(res["elapsedMs"])

        self.winners[w] += 1
        self.reasons[r] += 1
        self.blue_models[b] += 1
        self.orange_models[o] += 1
        self.total_turns += turns
        self.total_plies += plies
        self.total_worker_ms += ms

        m = self.matchups[(b, o)]
        m["games"] += 1
        if w in ("blue", "orange", "draw"):
            m[w] += 1
        m["turns"] += turns
        m["ms"] += ms

    def mirror_totals(self) -> Tuple[int, int, int]:
        b_wins = o_wins = draws = 0
        for a in AGENTS:
            m = self.matchups.get((a, a))
            if m:
                b_wins += int(m["blue"])
                o_wins += int(m["orange"])
                draws += int(m["draw"])
        return b_wins, o_wins, draws

    def format_progress_line(self, elapsed_s: float) -> str:
        pct = (100.0 * self.completed / self.total_target) if self.total_target else 100.0
        rate_s = self.completed / elapsed_s if elapsed_s > 0 else 0.0
        rate_m = rate_s * 60.0
        eta_s = (self.total_target - self.completed) / rate_s if rate_s > 0 else float("inf")

        b_all = self.winners["blue"]
        o_all = self.winners["orange"]
        d_all = self.winners["draw"]
        dec_all = b_all + o_all
        b_pct_all = (100.0 * b_all / dec_all) if dec_all > 0 else 0.0

        mb, mo, md = self.mirror_totals()
        m_dec = mb + mo
        mb_pct = (100.0 * mb / m_dec) if m_dec > 0 else 0.0

        ts = datetime.now().strftime("%H:%M:%S")
        return (
            f"[{ts}] {self.completed:5d}/{self.total_target} ({pct:5.1f}%) | "
            f"{rate_m:5.1f} g/min | elapsed {format_duration(elapsed_s)} | ETA {format_duration(eta_s)} | "
            f"All B/O/D: {b_all}/{o_all}/{d_all} (B {b_pct_all:4.1f}%) | "
            f"Mirror B/O: {mb}/{mo} (B {mb_pct:4.1f}%)"
        )

    def print_final_report(self, elapsed_s: float) -> None:
        print("\n" + "=" * 86)
        print("HEXCHESS BATCH GENERATION SUMMARY")
        print("=" * 86)
        rate_m = (self.completed / elapsed_s * 60.0) if elapsed_s > 0 else 0.0
        avg_turns = (self.total_turns / self.completed) if self.completed else 0.0
        avg_plies = (self.total_plies / self.completed) if self.completed else 0.0
        avg_ms = (self.total_worker_ms / self.completed) if self.completed else 0.0

        print(f"Completed games : {self.completed} / {self.total_target} (errors: {self.errors})")
        print(f"Wall-clock time : {format_duration(elapsed_s)} ({rate_m:.1f} games/min)")
        print(f"Avg game length : {avg_turns:.1f} turns, {avg_plies:.1f} plies, {avg_ms/1000.0:.2f}s CPU/game")

        if self.completed == 0:
            print("=" * 86)
            return

        # Overall & Mirror first-move advantage stats
        b_all, o_all, d_all = self.winners["blue"], self.winners["orange"], self.winners["draw"]
        dec_all = b_all + o_all
        z_all, p_all = two_sided_binomial_p(b_all, dec_all)

        mb, mo, md = self.mirror_totals()
        m_dec = mb + mo
        z_mir, p_mir = two_sided_binomial_p(mb, m_dec)

        print("\n--- First-Move Advantage (Blue moves first) ---")
        if dec_all > 0:
            print(
                f"All games       : Blue {b_all} ({100*b_all/dec_all:.2f}%), "
                f"Orange {o_all} ({100*o_all/dec_all:.2f}%), Draws {d_all} "
                f"| z={z_all:+.3f}, p={p_all:.4g}"
            )
        if m_dec > 0:
            print(
                f"Mirror matches  : Blue {mb} ({100*mb/m_dec:.2f}%), "
                f"Orange {mo} ({100*mo/m_dec:.2f}%), Draws {md} "
                f"| z={z_mir:+.3f}, p={p_mir:.4g}"
            )

        print("\n--- Model Balance Verification ---")
        print(f"{'Agent':<20} {'Blue':>8} {'Orange':>8} {'Share':>8}")
        for a in AGENTS:
            bc = self.blue_models[a]
            oc = self.orange_models[a]
            share = 100.0 * (bc + oc) / (2.0 * self.completed)
            print(f"{a:<20} {bc:>8d} {oc:>8d} {share:>7.2f}%")

        print("\n--- Matchup Breakdown ---")
        print(
            f"{'Blue vs Orange':<18} {'Games':>6} {'Blue':>6} {'Orange':>6} {'Draw':>6} "
            f"{'Blue%':>7} {'AvgTurn':>8} {'AvgSec':>7}"
        )
        for b in AGENTS:
            for o in AGENTS:
                m = self.matchups.get((b, o))
                if not m or m["games"] == 0:
                    continue
                g = int(m["games"])
                bw, ow, dw = int(m["blue"]), int(m["orange"]), int(m["draw"])
                dec = bw + ow
                bpct = (100.0 * bw / dec) if dec > 0 else 0.0
                label = f"{AGENT_SHORT[b]} vs {AGENT_SHORT[o]}"
                print(
                    f"{label:<18} {g:>6d} {bw:>6d} {ow:>6d} {dw:>6d} "
                    f"{bpct:>6.1f}% {m['turns']/g:>8.1f} {(m['ms']/g)/1000.0:>7.2f}"
                )

        print("\n--- Termination Reasons ---")
        for reason, count in sorted(self.reasons.items(), key=lambda kv: -kv[1]):
            print(f"  {reason:<20}: {count:5d} ({100.0*count/self.completed:.1f}%)")
        print("=" * 86)


def worker_loop(
    worker_id: int,
    node_exe: str,
    workspace_dir: Path,
    output_dir: Path,
    compact_json: bool,
    job_queue: "queue.Queue[Optional[dict]]",
    result_queue: "queue.Queue[dict]",
    stop_event: threading.Event,
    procs: List[subprocess.Popen],
    procs_lock: threading.Lock,
) -> None:
    cmd = [
        node_exe,
        "-e",
        NODE_WORKER_JS,
        str(workspace_dir),
        str(output_dir),
        "1" if compact_json else "0",
    ]
    proc = subprocess.Popen(
        cmd,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        bufsize=1,
    )
    with procs_lock:
        procs.append(proc)

    assert proc.stdin is not None and proc.stdout is not None

    try:
        while not stop_event.is_set():
            try:
                job = job_queue.get(timeout=0.2)
            except queue.Empty:
                continue

            if job is None:
                job_queue.task_done()
                break

            try:
                proc.stdin.write(json.dumps(job) + "\n")
                proc.stdin.flush()
                line = proc.stdout.readline()
                if not line:
                    err_text = proc.stderr.read() if proc.stderr else "Worker exited unexpectedly"
                    result_queue.put({"error": f"Worker {worker_id} crashed: {err_text.strip()}"})
                    job_queue.task_done()
                    break
                result_queue.put(json.loads(line))
            except Exception as exc:
                if not stop_event.is_set():
                    result_queue.put({"error": f"Worker {worker_id} exception: {exc}"})
                job_queue.task_done()
                break
            else:
                job_queue.task_done()
    finally:
        try:
            if proc.stdin and not proc.stdin.closed:
                proc.stdin.close()
        except OSError:
            pass
        try:
            proc.terminate()
            proc.wait(timeout=2)
        except Exception:
            try:
                proc.kill()
            except Exception:
                pass


def parse_args() -> argparse.Namespace:
    default_workers = max(1, (os.cpu_count() or 4) - 1)
    parser = argparse.ArgumentParser(
        description="Generate balanced HexChess AI-vs-AI game records using ai.js & game.js."
    )
    parser.add_argument(
        "--games",
        type=int,
        default=5000,
        help="Total number of games to generate (default: 5000)",
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=default_workers,
        help=f"Number of parallel headless Node.js workers (default: {default_workers})",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path(__file__).resolve().parent / "records",
        help="Directory to write JSON game records (default: ./records)",
    )
    parser.add_argument(
        "--log-interval",
        type=float,
        default=10.0,
        help="Progress log interval in seconds (default: 10.0)",
    )
    parser.add_argument(
        "--log-every",
        type=int,
        default=25,
        help="Also log every N completed games (default: 25)",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=None,
        help="Optional random seed for matchup scheduling",
    )
    parser.add_argument(
        "--compact-json",
        action="store_true",
        help="Write minified JSON instead of 2-space pretty-printed JSON",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    workspace_dir = Path(__file__).resolve().parent
    output_dir = args.output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    # Verify prerequisites
    node_exe = shutil.which("node")
    if not node_exe:
        print("ERROR: Node.js ('node') was not found on PATH. It is required to run ai.js & game.js.", file=sys.stderr)
        return 1

    for req_file in ("game.js", "ai.js"):
        if not (workspace_dir / req_file).is_file():
            print(f"ERROR: Required file not found: {workspace_dir / req_file}", file=sys.stderr)
            return 1

    if args.games <= 0:
        print("ERROR: --games must be > 0", file=sys.stderr)
        return 1

    workers = max(1, min(args.workers, args.games))
    rng = random.Random(args.seed)

    # Build stratified color-balanced schedule
    schedule = build_balanced_schedule(args.games, rng)
    used_ids = load_existing_game_ids(output_dir)

    # Print startup banner and schedule verification
    blue_plan = defaultdict(int)
    orange_plan = defaultdict(int)
    for b, o in schedule:
        blue_plan[b] += 1
        orange_plan[o] += 1

    print("=" * 86)
    print(f"HexChess AI-vs-AI Batch Generator | Target: {args.games} games | Workers: {workers}")
    print(f"Output directory: {output_dir}")
    print("Planned model balance (Blue / Orange):")
    for a in AGENTS:
        share = 100.0 * blue_plan[a] / args.games
        print(f"  {a:<20}: Blue={blue_plan[a]:4d}  Orange={orange_plan[a]:4d}  ({share:5.2f}%)")
    print("Press Ctrl+C at any time for graceful stop + summary.")
    print("=" * 86, flush=True)

    job_queue: "queue.Queue[Optional[dict]]" = queue.Queue()
    result_queue: "queue.Queue[dict]" = queue.Queue()
    stop_event = threading.Event()
    procs: List[subprocess.Popen] = []
    procs_lock = threading.Lock()

    for idx, (b_agent, o_agent) in enumerate(schedule, start=1):
        gid = generate_unique_game_id(used_ids, rng)
        job_queue.put(
            {
                "jobId": idx,
                "gameId": gid,
                "blue": b_agent,
                "orange": o_agent,
            }
        )

    # Sentinel None per worker for clean shutdown
    for _ in range(workers):
        job_queue.put(None)

    threads: List[threading.Thread] = []
    for wid in range(workers):
        t = threading.Thread(
            target=worker_loop,
            args=(
                wid,
                node_exe,
                workspace_dir,
                output_dir,
                args.compact_json,
                job_queue,
                result_queue,
                stop_event,
                procs,
                procs_lock,
            ),
            daemon=True,
        )
        t.start()
        threads.append(t)

    stats = StatsTracker(args.games)
    start_time = time.monotonic()
    last_log_time = start_time
    interrupted = False

    def handle_sigint(signum, frame):
        nonlocal interrupted
        if not interrupted:
            interrupted = True
            print("\n[SIGINT] Stopping workers gracefully and printing summary...", flush=True)
            stop_event.set()
            with procs_lock:
                for p in procs:
                    try:
                        p.terminate()
                    except Exception:
                        pass

    prev_handler = signal.signal(signal.SIGINT, handle_sigint)

    try:
        while stats.completed + stats.errors < args.games and not stop_event.is_set():
            try:
                res = result_queue.get(timeout=0.5)
            except queue.Empty:
                # Check if all worker threads died unexpectedly
                if not any(t.is_alive() for t in threads):
                    break
                now = time.monotonic()
                if now - last_log_time >= args.log_interval and stats.completed > 0:
                    print(stats.format_progress_line(now - start_time), flush=True)
                    last_log_time = now
                continue

            if "error" in res:
                stats.errors += 1
                print(f"[ERROR] {res['error']}", file=sys.stderr, flush=True)
                continue

            stats.record(res)
            now = time.monotonic()
            if (
                stats.completed % args.log_every == 0
                or (now - last_log_time) >= args.log_interval
                or stats.completed == args.games
            ):
                print(stats.format_progress_line(now - start_time), flush=True)
                last_log_time = now
    finally:
        signal.signal(signal.SIGINT, prev_handler)
        stop_event.set()
        for t in threads:
            t.join(timeout=3.0)

    elapsed = time.monotonic() - start_time
    stats.print_final_report(elapsed)
    return 0 if stats.errors == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
