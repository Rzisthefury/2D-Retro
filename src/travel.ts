/* =========================================================================
 * travel.ts — being on the road between two locations. Progress runs on a
 * clock; you can turn back at any point and the trip reverses.
 * ========================================================================= */

interface TravelState {
  from: string;
  to: string;
  progress: number;          // 0-1
  duration: number;          // seconds end to end
  elapsed: number;
}

function newTravel(from: string, to: string): TravelState {
  return { from, to, progress: 0, duration: Math.max(4, roadTime(from, to)), elapsed: 0 };
}

/** The place whose enemies and look the road takes: the harder end of it. */
function roadScene(t: TravelState): WorldLocation {
  const a = locById(t.from), b = locById(t.to);
  return b.tier >= a.tier ? b : a;
}

/** Turn around: same road, the other way, from wherever you are on it. */
function reverseTravel(t: TravelState) {
  const f = t.from;
  t.from = t.to;
  t.to = f;
  t.progress = 1 - t.progress;
}

function secondsLeft(t: TravelState): number {
  return Math.max(0, (1 - t.progress) * t.duration);
}
