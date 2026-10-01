/* =========================================================================
 * generals.ts — castle Lords and the generals you recruit from them (PLAN 9).
 *
 * Every territory castle but yours and the warlord's has a Lord: a named
 * knight on AF's boss AI (pattern + signature move + palette), generated
 * per castle. Beat one in a castle siege before the throne falls and you
 * may recruit them. A general has a level (1-20, command = 0.10 + 0.01 x
 * level), a loyalty (0-100) and a place: a castle, an army, the reserve or
 * a Dominion cell. War (war.ts) runs their fortunes; this file holds the
 * data and the words.
 * ========================================================================= */

type GeneralStatus = 'lord' | 'reserve' | 'castle' | 'army' | 'captive' | 'gone';

interface General {
  id: string;                 // 'lord-<territory>'
  name: string;
  title: string;
  pattern: BossPattern;
  moves: BossMove[];
  color: string; accent: string;
  level: number;
  loyalty: number;
  status: GeneralStatus;
  at: number;                 // node: the castle they hold (lord / castle) or are held at (captive); -1 otherwise
  army: number;               // army id when leading one, else -1
  captiveT: number;           // seconds held (for the -1 per 20 s)
  warned: boolean;            // the <=25 line has been said
  recruited: number;          // times recruited (a re-recruit starts at 30)
  lordSince: number;          // when they last became a Dominion Lord (a defector takes over the castle that holds them)
}

/** Patterns and their signature moves (AF's boss AI). */
const LORD_PATTERNS: { pattern: BossPattern; moves: BossMove[]; color: string; accent: string }[] = [
  { pattern: 'brute', moves: ['slam', 'rush'], color: '#3d2f5c', accent: '#c79bff' },
  { pattern: 'sorcerer', moves: ['fan'], color: '#2a3f5f', accent: '#8fd0ff' },
  { pattern: 'stalker', moves: ['rush'], color: '#4a2a2a', accent: '#ff9a6b' },
  { pattern: 'skylord', moves: ['dive'], color: '#2f4a3a', accent: '#9fffc0' },
];

/** The Lord of a territory's castle (generated from the name table, PLAN 9.1). */
function makeLord(t: Territory, castle: number): General {
  const p = LORD_PATTERNS[t.id % LORD_PATTERNS.length];
  return {
    id: `lord-${t.id}`, name: `Lord ${LORD_NAMES[t.id % LORD_NAMES.length]}`, title: `Lord of ${t.name}`,
    pattern: p.pattern, moves: p.moves.slice(), color: p.color, accent: p.accent,
    level: clamp(WAR.lordLevel[t.tier - 1], 1, WAR.generalMaxLevel),
    loyalty: WAR.loyaltyStart, status: 'lord', at: castle, army: -1, captiveT: 0, warned: false, recruited: 0, lordSince: 0,
  };
}

/** PLAN 9.2: command = 0.10 + 0.01 x level, capped at 0.30. */
function command(g: General): number { return Math.min(WAR.commandMax, WAR.commandBase + WAR.commandPerLevel * g.level); }

/** The boss a general or Lord fights as (AF's boss data, PLAN 11.3). */
function generalBoss(g: General, tier: number): BossDefinition {
  return { id: g.id, name: g.name, title: g.title, tier, stats: WAR.lordStats, uniqueMaterials: [], pattern: g.pattern, moves: g.moves, color: g.color, accent: g.accent };
}

/** One portrait line per moment (PLAN 13 story: templates per general). */
function generalLine(g: General, moment: 'recruit' | 'low' | 'defect' | 'rescue'): string {
  const first = g.name.replace(/^Lord /, '');
  switch (moment) {
    case 'recruit': return `${g.name}: "Beaten fairly. My sword is yours, Knight."`;
    case 'low': return `${g.name}: "I begin to wonder whose war this is, Knight."`;
    case 'defect': return `${g.name}: "The Dominion pays its lords better. Farewell." (${first} defects)`;
    case 'rescue': return `${g.name}: "You came for me. I won't forget it."`;
  }
}
