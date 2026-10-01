/* =========================================================================
 * dungeon.ts — the inside of a region's dungeon.
 *
 * A dungeon is a line of rooms: an entrance hall, then for each of the
 * region's bosses two wave rooms and the boss's room. A room's east door
 * stays shut until the room is clear. Beaten bosses are checkpoints: the
 * hall has a waystone for every section you have reached, and a beaten
 * boss's room holds two altars — rematch it, or face its Ascendant.
 * Leave (B) and the rooms refill; bosses stay beaten.
 * ========================================================================= */

type RoomKind = 'hall' | 'wave' | 'boss';

interface DungeonRoom {
  kind: RoomKind;
  section: number;           // which boss this room leads to
  boss: BossDefinition | null;
}

interface DungeonRun {
  region: string;
  rooms: DungeonRoom[];
  index: number;             // room you are in
  doorOpen: boolean;
  fighting: boolean;         // a wave or a boss is live in this room
}

/** Two wave rooms before each boss. */
const ROOMS_PER_SECTION = 2;

function dungeonRooms(loc: WorldLocation): DungeonRoom[] {
  const rooms: DungeonRoom[] = [{ kind: 'hall', section: 0, boss: null }];
  loc.bosses.forEach((b, s) => {
    for (let i = 0; i < ROOMS_PER_SECTION; i++) rooms.push({ kind: 'wave', section: s, boss: null });
    rooms.push({ kind: 'boss', section: s, boss: b });
  });
  return rooms;
}

/** Index of the first room of a section. */
function sectionStart(run: DungeonRun, section: number): number {
  return run.rooms.findIndex((r) => r.section === section && r.kind !== 'hall');
}

/** Sections you may warp to from the hall: up to and including the first unbeaten boss. */
function reachableSections(w: WorldState, loc: WorldLocation): number[] {
  const out: number[] = [];
  for (let s = 0; s < loc.bosses.length; s++) {
    out.push(s);
    if (!bossDefeated(w, loc.bosses[s].id)) break;
  }
  return out;
}

/** Wave size grows with how deep into the dungeon the room is. */
function roomWave(run: DungeonRun): number {
  const r = run.rooms[run.index];
  const inSection = run.rooms.slice(0, run.index).filter((x) => x.section === r.section && x.kind === 'wave').length;
  return 2 + r.section * 2 + inSection;
}

/* --------------------------------------------------------- room props */

// Positions are in the fixed 960x540 room (the arena rect from Game).

const ROOM_DOOR = { w: 26, h: 96 };                    // east wall opening
const WAYSTONE_Y = 150;
const ALTAR = { y: 250, dx: 120, r: 26 };               // two altars either side of centre

interface RoomProp { kind: 'waystone' | 'altar'; x: number; y: number; label: string; act: () => void; color: string; }

function waystoneX(a: { x: number; w: number }, i: number, n: number): number {
  return a.x + a.w / 2 + (i - (n - 1) / 2) * 150;
}
