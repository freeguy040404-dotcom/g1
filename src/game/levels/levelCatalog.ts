import type { LevelCatalogEntry, LevelId } from '../types';

export const LEVEL_CATALOG: LevelCatalogEntry[] = [
  {
    id: 'dream-world',
    order: 1,
    numberLabel: '01',
    title: 'Dream World',
    subtitle: 'Sunlit Floating Archipelago',
    description:
      'Cross pastel floating meadow islands, stack blocks to scale cloud-stone cliffs, weight a sky plate to extend the bridge, and unlock the summit shrine.',
    puzzleTags: ['Block Stacking', 'Bridge Plate', 'Twin Shrine Lock'],
    accentColor: '#3b82f6',
    skyTopHex: '#67b7f5',
    skyBottomHex: '#f6e7d8',
    totalCheckpoints: 2,
    totalRelics: 3,
  },
  {
    id: 'warehouse',
    order: 2,
    numberLabel: '02',
    title: 'Warehouse',
    subtitle: 'Sunlit Industrial Logistics Hall',
    description:
      'Navigate towering shelving and steel trusses, maneuver heavy metal crates onto cargo scales, flip gantry switches, and ride the freight lift through bay doors.',
    puzzleTags: ['Heavy Cargo Scales', 'Bay Door Levers', 'Freight Lift'],
    accentColor: '#d97706',
    skyTopHex: '#8db4cf',
    skyBottomHex: '#ede1d0',
    totalCheckpoints: 2,
    totalRelics: 3,
  },
  {
    id: 'mountain-adventure',
    order: 3,
    numberLabel: '03',
    title: 'Mountain Adventure',
    subtitle: 'Alpine Cliffs & Chasms',
    description:
      'Climb sheer granite ledges, cross creaking timber bridges over misty chasms, ride oscillating cable platforms, and roll heavy boulders onto summit counterweights.',
    puzzleTags: ['Cliff Climbing', 'Cable Platforms', 'Boulder Counterweight'],
    accentColor: '#059669',
    skyTopHex: '#5298d6',
    skyBottomHex: '#e5eff7',
    totalCheckpoints: 2,
    totalRelics: 3,
  },
  {
    id: 'construction-site',
    order: 4,
    numberLabel: '04',
    title: 'Construction Site',
    subtitle: 'Golden-Hour High-Rise Works',
    description:
      'Scale blue steel scaffolding beneath a towering crane, swing on physics-based ropes across open girders, lay timber plank bridges, and power the rooftop hoist.',
    puzzleTags: ['Physics Rope Swing', 'Plank Bridges', 'Crane Hoist'],
    accentColor: '#ea580c',
    skyTopHex: '#5b82b8',
    skyBottomHex: '#f8c996',
    totalCheckpoints: 2,
    totalRelics: 3,
  },
  {
    id: 'medieval-castle',
    order: 5,
    numberLabel: '05',
    title: 'Medieval Castle',
    subtitle: 'Sunlit Fortress Keep',
    description:
      'Lower the moat drawbridge, coordinate courtyard levers and rune pressure plates to raise iron portcullis gates, uncover a secret wall passage, and ascend the keep.',
    puzzleTags: ['Drawbridge Winch', 'Portcullis Gates', 'Hidden Passage'],
    accentColor: '#7c3aed',
    skyTopHex: '#638bd6',
    skyBottomHex: '#f4dfd0',
    totalCheckpoints: 2,
    totalRelics: 3,
  },
  {
    id: 'observatory',
    order: 6,
    numberLabel: 'SB',
    title: 'Observatory Terrace',
    subtitle: 'Original Physics Sandbox (Steps 1–4)',
    description:
      'The classic sunlit mountain observatory plaza with wooden toy blocks, stone archways, and parapets preserved for freeform grabbing, pushing, pulling, and ledge climbing.',
    puzzleTags: ['Freeform Sandbox', 'Block Stacks', 'Ledge Practice'],
    accentColor: '#4f46e5',
    skyTopHex: '#6db3ee',
    skyBottomHex: '#f5ebe0',
    totalCheckpoints: 0,
    totalRelics: 0,
    isSandbox: true,
  },
];

export function getLevelCatalogEntry(levelId: LevelId): LevelCatalogEntry {
  return LEVEL_CATALOG.find((entry) => entry.id === levelId) ?? LEVEL_CATALOG[0];
}
