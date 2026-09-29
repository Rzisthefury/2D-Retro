# Aerial Finisher: Open World Redesign
## Complete Implementation Specification

---

## 1. DESIGN OVERVIEW

### Current State
- Wave-by-wave battle arena with crafting menu
- Single combat zone, progression through wave difficulty
- All mechanics in one Game loop

### Target State
- Open world with 10+ themed locations
- Non-linear exploration from central hub
- Random enemy spawns during travel
- Required wave battles at each location (2-3 bosses per area)
- Bosses unlock: new areas + new wave tiers + unique materials
- Superbosses (hard mode) give better loot, optional
- Scattered crafting stations
- Level 1-100 progression with 5x difficulty scaling per tier
- Save anywhere
- No level/gear requirements on materials or recipes
- Infinite enemy respawns during travel

---

## 2. ARCHITECTURE CHANGES

### 2.1 Current File Structure
```
src/
  config.ts      → TUNING, attack data, spells, enemies, stat curves
  core.ts        → Math, input, WebAudio, VFX
  entities.ts    → Player, Enemy, Projectile, AI
  render.ts      → Arena, characters, VFX, HUD, menu
  main.ts        → Game loop, waves, progression, save
  items.ts       → Materials, weapon/armor tiers, recipes
  talents.ts     → Talent tree, AP system
  music.ts       → Audio synthesis, sections, intensity layers
```

### 2.2 New/Modified Files Required
```
NEW:
  world.ts       → Location definitions, world graph, travel system
  location.ts    → Individual location data, boss definitions, enemy spawning
  travel.ts      → Overworld state, enemy encounters during transit
  superboss.ts   → Hard-mode boss variants, difficulty modifiers
  
MODIFIED:
  config.ts      → Add location data, enemy tier definitions, difficulty curves
  main.ts        → Add world/location management, replace wave loop with world loop
  render.ts      → Add world map/location UI, travel visualization
  entities.ts    → Scale enemy stats based on location tier
  music.ts       → Area-specific music themes (optional enhancement)
```

---

## 3. DATA STRUCTURES & SYSTEMS

### 3.1 World System (world.ts)
```typescript
interface Location {
  id: string;                    // "forest-1", "volcano-2", etc
  name: string;
  theme: string;                 // "Forest", "Volcano", "Ruins", etc
  tier: number;                  // 1-10, affects difficulty scaling
  description: string;
  
  // Enemies
  enemyTypes: string[];          // 3-5 enemy type IDs native to this location
  enemyLevelRange: [min, max];   // e.g., [10, 20]
  spawnRate: number;             // enemies per minute during travel
  
  // Bosses (2-3 per area)
  bosses: BossDefinition[];
  
  // Connections
  connectedLocations: string[];  // Adjacent areas accessible from here
  hubDistance: number;           // Travel time back to hub
  
  // Crafting
  hasCraftingStation: boolean;
  
  // Progression
  requiredTier?: number;         // Must clear tier X to access
}

interface BossDefinition {
  id: string;
  name: string;
  tier: number;                  // Inherits from location
  stats: {
    hp: number;
    attack: number;
    defense: number;
  };
  
  // Unlocks
  unlocksArea?: string;          // New location opened by defeating this
  unlocksWaveTier?: number;      // New wave difficulty available
  uniqueMaterials: string[];     // Special drops only from this boss
  
  // Superboss variant
  superboss: {
    statMultiplier: number;      // e.g., 1.5x
    dropMultiplier: number;      // e.g., 2x materials
  };
  
  // Combat
  attacks: AttackDef[];          // Boss-specific attack patterns
  pattern: string;               // AI behavior pattern
}

interface WorldState {
  currentLocation: string;       // Current location ID or "hub"
  discoveredLocations: Set<string>;
  completedBosses: Map<string, boolean>; // Boss ID → defeated
  completedSuperbosses: Map<string, boolean>;
  unlockedAreas: Set<string>;
  unlockedWaveTiers: Set<number>;
}
```

### 3.2 Location System (location.ts)
```typescript
interface LocationEncounter {
  enemyType: string;
  count: number;
  level: number;
  loot: LootTable;
}

interface TravelState {
  from: string;
  to: string;
  progress: number;              // 0-1, how far along travel
  activeEnemies: Enemy[];        // Spawned during this trip
  enemyWave: number;             // Which enemy wave this is
}

// Location data: 10+ definitions with unique themes
const LOCATIONS: Map<string, Location> = {
  "forest-1": { /* tier 1 location */ },
  "forest-2": { /* tier 2 location */ },
  "volcano-1": { /* tier 1 location */ },
  // ... 10+ total
}
```

### 3.3 Difficulty Scaling
```typescript
// In config.ts
const TIER_SCALING = {
  hpMultiplier: (tier: number) => 1 + (tier - 1) * 0.8,
  attackMultiplier: (tier: number) => 1 + (tier - 1) * 0.9,
  defenseMultiplier: (tier: number) => 1 + (tier - 1) * 0.7,
  xpMultiplier: (tier: number) => 1 + (tier - 1) * 1.2,
};

// Every enemy in tier 3 area has 5x stats of tier 1
// Superboss multiplies on top: 1.5x additional
```

### 3.4 Travel System
```typescript
interface TravelEncounter {
  type: "enemy" | "boss" | "safe";
  enemies?: Enemy[];
  boss?: BossDefinition;
  lootReward?: Loot;
}

// During travel from location A to B:
// - Randomly spawn 0-3 enemy encounters
// - Each encounter has 1-5 enemies
// - Enemies respawn infinitely until you reach destination
// - Can return to previous location or continue
```

---

## 4. IMPLEMENTATION PHASES

### PHASE 1: World Foundation (Days 1-2)
**Goal:** Core world system, location definitions, basic travel

1. Create `world.ts` with Location and WorldState interfaces
2. Create `location.ts` with 10+ location definitions (use existing enemy types, tier them)
3. Add world state to Game class in `main.ts`
4. Create basic location UI (text display: "You are in Forest 1")
5. Implement travel between hub and one location (test only)
6. Add location to save/load system

**Success Criteria:**
- Can navigate: Hub → Forest-1 → Hub
- Locations track discovered status
- State persists on save/load

---

### PHASE 2: Boss System & Unlocks (Days 3-4)
**Goal:** Boss definitions, defeat tracking, area/wave unlocks

1. Define 20-30 bosses across 10+ locations (2-3 per location)
2. Add boss encounters to locations
3. Implement defeat tracking in WorldState
4. Create unlock logic: defeating boss A unlocks area B + wave tier C
5. Modify `main.ts` to track unlocked areas/tiers (gate access)
6. Update save system to store boss defeats and unlocked content

**Success Criteria:**
- Defeat a boss → new area becomes accessible
- Wave tiers unlock based on boss defeats
- Cannot enter areas you haven't unlocked

---

### PHASE 3: Enemy Spawning & Travel (Days 5-6)
**Goal:** Random encounters during travel, infinite respawns, location-specific enemies

1. Implement travel state machine (in transit, at location, in battle)
2. Create random enemy spawning during travel (based on location tier)
3. Tie enemy types to locations (forest enemies in forest, volcano in volcano)
4. Implement infinite respawn system (enemies respawn on defeat during travel)
5. Add travel visualization/UI (simple: "Traveling to Forest-2...")
6. Handle returning to previous location mid-travel

**Success Criteria:**
- Travel spawns random enemies
- Enemies scale with location tier
- Defeating enemies doesn't stop more from spawning
- Can return to previous location

---

### PHASE 4: Crafting Stations (Days 7-8)
**Goal:** Distributed crafting, location-specific stations

1. Add `hasCraftingStation` to locations (hub + 5-6 scattered)
2. Create location-based crafting UI (different per station visually)
3. Move crafting logic from menu to station (still instant craft)
4. Link superboss loot → unique recipes (optional: new crafting locations unlock)
5. Update render.ts to show crafting UI only at stations

**Success Criteria:**
- Can only craft at crafting stations
- All recipes available at all stations (no gating)
- Stations feel like destinations worth visiting

---

### PHASE 5: Superboss System (Days 9-10)
**Goal:** Hard mode bosses, better loot, difficulty variants

1. Add superboss variant to each BossDefinition
2. Implement superboss spawn/encounter (separate boss battle or same arena, harder)
3. Create superboss loot tables (2x materials, exclusive drops)
4. Implement superboss tracking separate from main bosses
5. Add superboss unlock logic (beat main boss first? Or always available?)
6. Update progression to NOT require superbosses (optional only)

**Success Criteria:**
- Can fight hard-mode versions of bosses
- Superbosses drop better loot
- Beating them is optional, doesn't gate progression

---

### PHASE 6: Polish & Integration (Days 11-12)
**Goal:** UI, audio, save/load, testing

1. Create world map/location selection UI
2. Add location-specific music themes (stretch goal)
3. Implement travel time/distance (affects XP gain during travel)
4. Add location descriptions/atmosphere
5. Test save/load with full world state
6. Balance difficulty curve (test at levels 1, 20, 50, 100)
7. Fix edge cases (can't return to hub from boss room, etc)

**Success Criteria:**
- Game is playable end-to-end
- No softlocks (can always reach boss, craft, level up)
- Save/load works completely
- Difficulty feels right at all levels

---

## 5. SPECIFIC IMPLEMENTATION DETAILS

### 5.1 Modifying main.ts
```typescript
// Current: Game.tick() runs wave loop
// New: Game.tick() runs world state machine

enum GameScreen {
  title = 'title',
  play = 'play',        // Will now include world exploration + battles
  location = 'location', // NEW: at a location, can interact
  travel = 'travel',    // NEW: moving between locations
  battle = 'battle',    // Existing wave battle
  crafting = 'crafting' // Existing crafting at stations
}

// Game.screen determines what runs each tick
// Transitions: location → travel → location, or location → battle → location
```

### 5.2 Enemy Scaling
```typescript
// In entities.ts, modify Enemy constructor:
Enemy.scale(tier: number) {
  const multiplier = TIER_SCALING.hpMultiplier(tier);
  this.maxHp *= multiplier;
  this.hp = this.maxHp;
  this.attack *= TIER_SCALING.attackMultiplier(tier);
  this.defense *= TIER_SCALING.defenseMultiplier(tier);
}

// Boss stats inherit from location tier, then superboss modifier
```

### 5.3 Progression Gating
```typescript
// When entering a location:
if (!game.world.unlockedAreas.has(locationId)) {
  // Show error: "This area is locked. Defeat [Boss Name] to unlock."
  return false;
}

// When starting a wave tier:
if (!game.world.unlockedWaveTiers.has(tier)) {
  // Show error: "Defeat [Boss Name] to unlock Wave Tier X"
  return false;
}
```

### 5.4 Save File Structure
```typescript
// Existing save includes: level, exp, best wave, materials, gear, talents, consumables
// Add:
{
  // ... existing ...
  world: {
    currentLocation: "forest-1",
    discoveredLocations: ["hub", "forest-1", "forest-2"],
    completedBosses: { "forest-1-boss-1": true, ... },
    completedSuperbosses: { "forest-1-boss-1": false, ... },
    unlockedAreas: ["forest-1", "forest-2"],
    unlockedWaveTiers: [1, 2]
  }
}
```

---

## 6. LOCATION DEFINITIONS TEMPLATE

You'll need to define ~10-12 locations. Here's a template:

```typescript
{
  id: "area-tier",
  name: "Area Name",
  theme: "Forest" | "Volcano" | "Ruins" | "Desert" | "Sky" | etc,
  tier: 1-10,
  description: "Description of the area",
  
  enemyTypes: ["enemy-1", "enemy-2", "enemy-3"],
  enemyLevelRange: [level_min, level_max],
  spawnRate: 2, // per minute during travel
  
  bosses: [
    { id: "boss-1", name: "Boss Name", /* stats */, unlocksArea: "next-area", ... },
    { id: "boss-2", name: "Boss Name", /* stats */, unlocksWaveTier: 3, ... },
    // ... 2-3 bosses
  ],
  
  connectedLocations: ["area-1", "area-2", "hub"],
  hubDistance: 30, // seconds of travel
  
  hasCraftingStation: true,
}
```

Suggestion: Create one complete location fully, then copy/modify for the rest (faster).

---

## 7. KEY DECISIONS TO MAKE BEFORE CODING

1. **Music system:** Keep current (same music always) or area-specific themes?
2. **Tutorial/onboarding:** How does player learn the new system?
3. **Fast travel:** Can player teleport back to hub instantly, or must travel?
4. **Difficulty display:** Show player recommended level for each location?
5. **Quest markers:** Text hints for next boss, or figure it out themselves?

---

## 8. TESTING CHECKLIST

- [ ] Can navigate all locations without errors
- [ ] Boss unlocks work (defeat boss → area accessible)
- [ ] Difficulty scaling feels right (tier 1 vs tier 5)
- [ ] Grinding viable (level 20 → 50 takes reasonable time)
- [ ] No softlocks (always have valid path forward)
- [ ] Save/load preserves all world state
- [ ] Superbosses give 2x loot
- [ ] Crafting only works at stations
- [ ] Enemy spawns during travel
- [ ] XP gain scales per tier
- [ ] Level 100 is achievable
- [ ] Touch controls work in new UI

---

## 9. ESTIMATED SCOPE

- **Code changes:** ~1500 lines new code (new files), ~500 lines modifications (existing)
- **Data definitions:** ~500 lines (bosses, locations)
- **Total effort:** 2-3 weeks solo dev pace, 3-5 days with Claude Code full-time

---

## 10. STRETCH GOALS (After MVP)

- Area-specific music
- Quest system ("Defeat 3 bosses, unlock story chapter")
- NPC merchants at stations
- Procedural location generation
- New Game+ with stat carry-over
- Leaderboards for speedrun
- Additional playable characters

---

## HOW TO USE THIS SPEC WITH CLAUDE CODE

1. Copy this entire document
2. Run Claude Code with Opus:
   ```
   claude code --model opus-4-1 "Implement Aerial Finisher open world redesign per spec: [paste spec]"
   ```
3. Claude will:
   - Ask clarifications if needed
   - Build files phase-by-phase
   - Commit after each phase
   - Push to GitHub (if auth is fixed)

4. After each phase, test locally:
   ```
   tsc -p tsconfig.json
   node build.js
   open dist/index.html
   ```

---

**Ready to ship this to Claude Code + Opus?**
