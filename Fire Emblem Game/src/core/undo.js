/* ------------------------------------------------------------------
   UNDO
   A full state snapshot per player action, and one more taken the
   instant before you end your turn. The stack is not cleared between
   turns, so undo walks backwards through the enemy phase and into the
   turn before it: if a unit dies to a counterattack you did not see
   coming, you can go back and not make the move that caused it.

   The RNG stream is part of every snapshot, so an enemy phase you
   rewind past will replay exactly as it did unless you change
   something. That is the point. Undo fixes positioning mistakes, not
   bad luck — rewinding a turn and pressing End Turn again gets you the
   same dead unit.

   Cost: a snapshot is about 18 KB on the largest chapter, so the whole
   history is bounded by bytes rather than by entries — a long chapter
   fits, and a pathological one drops its oldest turns instead of
   growing without limit.
------------------------------------------------------------------ */
(function (FE) {
  'use strict';

  var STACK_LIMIT = 900;          /* hard ceiling on entries */
  var BYTE_BUDGET = 8 * 1024 * 1024;
  var KEEP_MIN = 40;              /* never trim below this many entries */

  function snapshot(state) {
    return JSON.stringify({
      units: state.units,
      turn: state.turn,
      phase: state.phase,
      gold: state.gold,
      convoy: state.convoy,
      benched: state.benched,
      openedDoors: state.openedDoors,
      openedChests: state.openedChests,
      villages: state.villages,
      chests: state.chests,
      seized: state.seized || false,
      arenaRounds: state.arenaRounds,
      pendingReinf: state.pendingReinf,
      phase2Def: state.phase2Def || null,
      rng: state.rng.save(),
      visible: state.visible
    });
  }

  function restore(state, blob) {
    var s = JSON.parse(blob);
    state.units = s.units;
    state.turn = s.turn;
    state.phase = s.phase;
    state.gold = s.gold;
    state.convoy = s.convoy;
    state.benched = s.benched;
    state.openedDoors = s.openedDoors;
    state.openedChests = s.openedChests;
    state.villages = s.villages;
    state.chests = s.chests;
    state.seized = s.seized;
    state.arenaRounds = s.arenaRounds;
    state.pendingReinf = s.pendingReinf;
    state.phase2Def = s.phase2Def || null;
    state.rng.load(s.rng);
    state.visible = s.visible;
  }

  function trim(stack) {
    var bytes = 0, i;
    for (i = 0; i < stack.length; i++) bytes += stack[i].blob.length;
    while (stack.length > KEEP_MIN && (stack.length > STACK_LIMIT || bytes > BYTE_BUDGET)) {
      bytes -= stack[0].blob.length;
      stack.shift();
    }
  }

  FE.Undo = {
    reset: function (state) {
      state._undo = [];
    },
    /* call immediately BEFORE mutating state for a player action, and once
       more just before handing the board to the enemy */
    push: function (state, label) {
      if (!state._undo) state._undo = [];
      if (state.phase !== 'player') return;
      state._undo.push({
        label: label || 'action',
        turn: state.turn,
        blob: snapshot(state)
      });
      trim(state._undo);
    },
    canUndo: function (state) {
      return state.phase === 'player' && state._undo && state._undo.length > 0;
    },
    depth: function (state) {
      return (state._undo && state._undo.length) || 0;
    },
    lastLabel: function (state) {
      if (!state._undo || !state._undo.length) return null;
      return state._undo[state._undo.length - 1].label;
    },
    /* true when the next undo would step back over an enemy phase */
    crossesTurn: function (state) {
      if (!this.canUndo(state)) return false;
      var top = state._undo[state._undo.length - 1];
      return top.turn !== undefined && top.turn < state.turn;
    },
    /* how many of your own turns the history still reaches back */
    turnsBack: function (state) {
      if (!state._undo || !state._undo.length) return 0;
      var oldest = state._undo[0].turn;
      if (oldest === undefined) return 0;
      return Math.max(0, state.turn - oldest);
    },
    /* how many actions are undoable inside the current turn */
    thisTurn: function (state) {
      if (!state._undo) return 0;
      var n = 0;
      for (var i = state._undo.length - 1; i >= 0; i--) {
        if (state._undo[i].turn !== state.turn) break;
        n++;
      }
      return n;
    },
    pop: function (state) {
      if (!this.canUndo(state)) return false;
      var e = state._undo.pop();
      restore(state, e.blob);
      FE.recomputeSupports(state);
      FE.updateFog(state);
      return true;
    },
    /* rewind to the start of the current player turn. It stops at the turn
       boundary rather than running on into the enemy phase before it: going
       back a whole turn is a separate, deliberate press. */
    all: function (state) {
      if (!this.canUndo(state)) return false;
      var turn = state.turn, moved = false;
      while (this.thisTurn(state) > 0) {
        var e = state._undo.pop();
        restore(state, e.blob);
        moved = true;
        if (state.turn !== turn) break;
      }
      if (moved) { FE.recomputeSupports(state); FE.updateFog(state); }
      return moved;
    },
    clear: function (state) { state._undo = []; }
  };

  FE.snapshotState = snapshot;
  FE.restoreState = restore;

})(window.FE = window.FE || {});
