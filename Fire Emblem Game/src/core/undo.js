/* ------------------------------------------------------------------
   UNDO
   A full state snapshot per player action. Unlimited, step by step,
   during your own turn only. The RNG stream is part of the snapshot,
   so redoing the same attack the same way gives the same result:
   undo fixes positioning mistakes, not bad luck.
------------------------------------------------------------------ */
(function (FE) {
  'use strict';

  var STACK_LIMIT = 200;

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

  FE.Undo = {
    reset: function (state) {
      state._undo = [];
    },
    /* call immediately BEFORE mutating state for a player action */
    push: function (state, label) {
      if (!state._undo) state._undo = [];
      if (state.phase !== 'player') return;
      state._undo.push({ label: label || 'action', blob: snapshot(state) });
      if (state._undo.length > STACK_LIMIT) state._undo.shift();
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
    pop: function (state) {
      if (!this.canUndo(state)) return false;
      var e = state._undo.pop();
      restore(state, e.blob);
      FE.recomputeSupports(state);
      FE.updateFog(state);
      return true;
    },
    /* rewind everything back to the start of this player turn */
    all: function (state) {
      if (!this.canUndo(state)) return false;
      while (state._undo.length > 1) state._undo.pop();
      return this.pop(state);
    },
    clear: function (state) { state._undo = []; }
  };

  FE.snapshotState = snapshot;
  FE.restoreState = restore;

})(window.FE = window.FE || {});
