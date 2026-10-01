/* =========================================================================
 * talents.ts — four branches, 24 nodes, bought with skill points (SP) won
 * by conquest (PLAN 12.2). Blade, Arcana and Survival are AF's; Command
 * grows the warband and strengthens your troops. 42 SP buys the lot.
 * Dash, the Whirl finisher and the combo extensions all live here, so the
 * moveset is something you build rather than something you're handed.
 * ========================================================================= */

type Branch = 'blade' | 'arcana' | 'survival' | 'command';

interface TalentDef {
  id: string;
  name: string;
  branch: Branch;
  cost: number;
  needs?: string;
  desc: string;
}

const TALENTS: TalentDef[] = [
  // ---- Blade: the combo itself
  { id: 'edge', name: 'Keen Edge', branch: 'blade', cost: 1,
    desc: '+12% physical damage on every swing.' },
  { id: 'combo4', name: 'Extended Combo', branch: 'blade', cost: 1,
    desc: 'Adds a fourth swing to the ground combo before the finisher.' },
  { id: 'whirl', name: 'Whirl Finisher', branch: 'blade', cost: 2,
    desc: 'The ground finisher becomes a spinning blade that sweeps everything around you, hitting three times.' },
  { id: 'combo5', name: 'Relentless', branch: 'blade', cost: 2, needs: 'combo4',
    desc: 'A fifth swing. Long strings hit hard enough to stagger anything.' },
  { id: 'aerial', name: 'Aerial Mastery', branch: 'blade', cost: 2,
    desc: 'Adds a third aerial swing and keeps you airborne longer between them.' },
  { id: 'tempest', name: 'Tempest', branch: 'blade', cost: 3, needs: 'whirl',
    desc: 'Whirl runs wider, hits five times, and drags enemies into the blade.' },

  // ---- Arcana: magic and MP
  { id: 'flow', name: 'Flowing Mana', branch: 'arcana', cost: 1,
    desc: 'MP recharges 35% faster.' },
  { id: 'focus', name: 'Focus', branch: 'arcana', cost: 1,
    desc: '+18% spell power.' },
  { id: 'quickcast', name: 'Quick Cast', branch: 'arcana', cost: 2,
    desc: 'Cast recovery cut by 40%. Spells stop being a commitment.' },
  { id: 'surge', name: 'Storm Surge', branch: 'arcana', cost: 2, needs: 'focus',
    desc: 'Thunder strikes five targets instead of three, at a wider radius.' },
  { id: 'arcedge', name: 'Arcane Edge', branch: 'arcana', cost: 2,
    desc: 'Every melee hit that connects returns 1 MP.' },
  { id: 'efficure', name: 'Efficient Cure', branch: 'arcana', cost: 3, needs: 'flow',
    desc: 'Cure stops eating the whole gauge — it costs 45% of max MP instead.' },

  // ---- Survival: movement and staying alive
  { id: 'dash', name: 'Dash', branch: 'survival', cost: 1,
    desc: 'Quick evade with invulnerability frames. Cancels attack recovery.' },
  { id: 'vitality', name: 'Vitality', branch: 'survival', cost: 1,
    desc: '+20% max HP.' },
  { id: 'scavenger', name: 'Scavenger', branch: 'survival', cost: 1,
    desc: '+55% material drop rate.' },
  { id: 'airdash', name: 'Aerial Dodge', branch: 'survival', cost: 2, needs: 'dash',
    desc: 'Dash works in the air and you get a second charge.' },
  { id: 'ironskin', name: 'Iron Skin', branch: 'survival', cost: 2,
    desc: 'An extra 8% damage reduction on top of your armour.' },
  { id: 'secondwind', name: 'Second Wind', branch: 'survival', cost: 3, needs: 'vitality',
    desc: 'The first killing blow each wave leaves you at 35% HP instead.' },

  // ---- Command: the warband (PLAN 12.2; numbers in WAR.command)
  { id: 'banner', name: 'Rally Banner', branch: 'command', cost: 1,
    desc: 'Warband +8.' },
  { id: 'drill', name: 'Drillmaster', branch: 'command', cost: 1,
    desc: 'Your troops have +15% HP.' },
  { id: 'steel', name: 'Sharpened Steel', branch: 'command', cost: 1,
    desc: 'Your troops deal +15% damage.' },
  { id: 'muster', name: 'Muster', branch: 'command', cost: 2, needs: 'banner',
    desc: 'Warband +12, and reinforcements stream in 30% faster.' },
  { id: 'presence', name: "Warlord's Presence", branch: 'command', cost: 2,
    desc: 'Troops within 300 px of you deal +20% damage. General loyalty gains x1.5.' },
  { id: 'host', name: 'Grand Host', branch: 'command', cost: 3, needs: 'muster',
    desc: 'Warband +16, and your troops have a further +15% HP.' },
];

const BRANCHES: { id: Branch; name: string; color: string }[] = [
  { id: 'blade', name: 'Blade', color: '#ff9d5c' },
  { id: 'arcana', name: 'Arcana', color: '#7fb4ff' },
  { id: 'survival', name: 'Survival', color: '#69e29a' },
  { id: 'command', name: 'Command', color: '#ffd54a' },
];

function talentsIn(b: Branch): TalentDef[] { return TALENTS.filter((t) => t.branch === b); }

function talentById(id: string): TalentDef | undefined { return TALENTS.find((t) => t.id === id); }

type TalentSet = Record<string, boolean>;

function apSpent(set: TalentSet): number {
  let n = 0;
  for (const t of TALENTS) if (set[t.id]) n += t.cost;
  return n;
}

function canLearn(set: TalentSet, t: TalentDef, apFree: number): boolean {
  if (set[t.id]) return false;
  if (t.needs && !set[t.needs]) return false;
  return apFree >= t.cost;
}
