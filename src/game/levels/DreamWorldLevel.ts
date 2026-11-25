import * as THREE from 'three';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import type { ProceduralTextureSet } from '../textures';
import type { ProceduralAudio } from '../audio';
import type { PuzzleCallbacks } from '../puzzles/PuzzleSystem';
import { LevelBuildHelper, type BuiltLevel, type LevelLightingTheme } from './LevelBuilder';

const DREAM_LIGHTING: LevelLightingTheme = {
  backgroundHex: 0xd9eefc,
  fogHex: 0xe6f2fa,
  fogDensity: 0.0048,
  hemiSkyHex: 0xb6e0ff,
  hemiGroundHex: 0xdec9b4,
  hemiIntensity: 0.96,
  sunHex: 0xfff4df,
  sunIntensity: 2.08,
  sunOffset: [20, 30, 18],
  rimHex: 0xd4e6ff,
  rimIntensity: 0.58,
  skyStops: [
    [0.0, '#62b3f2'],
    [0.3, '#9bd3fa'],
    [0.48, '#ddf0fc'],
    [0.54, '#f8ecdf'],
    [0.68, '#e6f0f8'],
    [1.0, '#c6dcf0'],
  ],
  sunDiscPos: [90, 125, 65],
  sunDiscColor: 0xfff8e4,
};

export function buildDreamWorldLevel(
  physics: PhysicsWorld,
  textures: ProceduralTextureSet,
  audio: ProceduralAudio,
  callbacks: PuzzleCallbacks,
  foundRelics: string[] = [],
): BuiltLevel {
  const b = new LevelBuildHelper(physics, textures, audio, callbacks);
  b.addSkyDome(DREAM_LIGHTING.skyStops, DREAM_LIGHTING.sunDiscPos, DREAM_LIGHTING.sunDiscColor);

  const grassMat = b.track(new THREE.MeshStandardMaterial({ color: 0x95c98f, roughness: 0.9 }));
  const stoneMat = b.track(
    new THREE.MeshStandardMaterial({
      color: 0xf2ece1,
      map: textures.limestoneTile,
      roughness: 0.8,
      metalness: 0.03,
    }),
  );
  const plasterMat = b.track(
    new THREE.MeshStandardMaterial({
      color: 0xf7f2ea,
      map: textures.mattePlaster,
      roughness: 0.85,
    }),
  );
  const rockUndersideMat = b.track(
    new THREE.MeshStandardMaterial({
      color: 0xc2b7ab,
      roughness: 0.94,
      flatShading: true,
    }),
  );
  const woodMat = b.track(
    new THREE.MeshStandardMaterial({
      color: 0xd9a874,
      map: textures.woodPlank,
      roughness: 0.78,
    }),
  );
  const coralMat = b.track(
    new THREE.MeshStandardMaterial({
      color: 0xe8947b,
      map: textures.mattePlaster,
      roughness: 0.76,
    }),
  );
  const periwinkleMat = b.track(
    new THREE.MeshStandardMaterial({
      color: 0x8ea8d8,
      map: textures.mattePlaster,
      roughness: 0.72,
    }),
  );

  // Helper to create a stylized floating island with tapered rocky underside
  const addFloatingIsland = (
    x: number,
    topY: number,
    z: number,
    w: number,
    d: number,
    thickness = 2.6,
    topMat: THREE.Material = grassMat,
  ) => {
    // Solid playable top slab
    b.addStaticBox({ size: [w, thickness, d], position: [x, topY - thickness * 0.5, z] }, topMat);
    // Decorative tapered cliff spire beneath
    const coneGeo = b.track(new THREE.ConeGeometry(Math.max(w, d) * 0.52, Math.max(w, d) * 0.62, 7));
    coneGeo.rotateX(Math.PI);
    const cone = new THREE.Mesh(coneGeo, rockUndersideMat);
    cone.position.set(x, topY - thickness - Math.max(w, d) * 0.28, z);
    cone.receiveShadow = true;
    b.root.add(cone);
  };

  // === ISLAND 1: Awakening Meadow ===
  addFloatingIsland(0, 0, 0, 14, 14, 2.8, grassMat);
  // Central stone inlay path
  b.addVisualBox([4.4, 0.08, 10.5], [0, 0.04, -1.2], stoneMat, undefined, false);

  // Introductory climb terrace on north side of Island 1 (height 1.6m: climbable OR stack blocks)
  b.addStaticBox({ size: [8.4, 1.6, 4.8], position: [0, 0.8, -5.2] }, stoneMat);
  // Low stone step flank on left so climbing feels welcoming
  b.addStaticBox({ size: [2.2, 0.8, 2.2], position: [-4.6, 0.4, -4.4] }, plasterMat);

  // Intro pastel wooden blocks to stack or carry
  b.addDynamicObject({
    id: 'dw-intro-1',
    size: [0.9, 0.9, 0.9],
    initialPosition: [2.6, 0.5, -0.8],
    initialRotationY: 0.14,
    color: 0xe8957a,
    mass: 2.0,
    kind: 'block',
  });
  b.addDynamicObject({
    id: 'dw-intro-2',
    size: [0.9, 0.9, 0.9],
    initialPosition: [3.7, 0.5, -1.3],
    initialRotationY: -0.1,
    color: 0xf3cf7a,
    mass: 2.0,
    kind: 'block',
  });

  // === TIMBER BRIDGE 1 (Island 1 -> Island 2) ===
  b.addStaticBox({ size: [3.4, 0.48, 8.6], position: [0, 1.36, -11.9] }, woodMat);
  // Decorative bridge side posts
  for (const bz of [-9.0, -11.9, -14.8]) {
    b.addVisualBox([0.22, 1.0, 0.22], [-1.55, 2.0, bz], coralMat);
    b.addVisualBox([0.22, 1.0, 0.22], [1.55, 2.0, bz], coralMat);
  }

  // === OPTIONAL EAST SIDE ISLAND (Exploration + Secret Relic #1) ===
  b.addStaticBox({ size: [2.4, 0.7, 2.4], position: [6.2, 1.1, -7.8] }, stoneMat);
  b.addStaticBox({ size: [2.4, 0.7, 2.4], position: [8.9, 1.35, -10.2] }, stoneMat);
  addFloatingIsland(12.2, 1.6, -12.8, 5.4, 5.4, 1.8, grassMat);
  b.puzzleSystem.addSecretRelic(
    { id: 'dw-relic-1', position: [12.2, 2.8, -12.8], label: 'Sky Blossom Shard' },
    foundRelics.includes('dw-relic-1'),
  );

  // === ISLAND 2: Sky Bridge Puzzle Terrace ===
  addFloatingIsland(0, 1.6, -24, 16, 16, 3.0, grassMat);
  b.addVisualBox([5.5, 0.08, 13.5], [0, 1.64, -24], stoneMat, undefined, false);

  b.puzzleSystem.addCheckpoint({
    id: 'dw-cp-1',
    index: 1,
    position: [0, 1.6, -18.2],
    spawnPos: [0, 3.0, -18.2],
    spawnYaw: 0,
    label: 'Checkpoint 1 · Cloud Bridge Terrace',
  });

  // Puzzle 1: Pressure Plate extends the Sky Bridge across the wide chasm
  // (In 2+ player online co-op, a partner Twin Plate also lights up on the east side!)
  b.puzzleSystem.addPressurePlate({
    id: 'dw-plate-bridge',
    signalId: 'dw_bridge',
    position: [-4.2, 1.6, -28.0],
    size: [2.3, 2.3],
    minMass: 1.5,
    label: 'Sky Bridge Plate',
  });

  b.puzzleSystem.addPressurePlate({
    id: 'dw-plate-bridge-coop',
    signalId: 'dw_bridge_coop',
    position: [4.2, 1.6, -28.0],
    size: [2.3, 2.3],
    minMass: 1.5,
    label: 'Co-op Twin Bridge Plate',
    accentColor: 0x38bdf8,
    multiplayerOnly: true,
  });

  // Blocks on Island 2 for weighting the bridge plate
  b.addDynamicObject({
    id: 'dw-mid-1',
    size: [0.95, 0.95, 0.95],
    initialPosition: [3.6, 2.2, -23.5],
    initialRotationY: 0.2,
    color: 0x8ea7d6,
    mass: 2.2,
    kind: 'block',
  });
  b.addDynamicObject({
    id: 'dw-mid-2',
    size: [0.95, 0.95, 0.95],
    initialPosition: [4.8, 2.2, -24.8],
    initialRotationY: -0.15,
    color: 0xa2cba4,
    mass: 2.2,
    kind: 'block',
  });

  // Retractable Sky Bridge (rises smoothly from cloud mist into walkable alignment!)
  b.puzzleSystem.addMechanicalDoor({
    id: 'dw-sky-bridge',
    size: [4.2, 0.56, 11.4],
    closedPosition: [0, -1.8, -37.5],
    openPosition: [0, 1.72, -37.5],
    requiredSignals: ['dw_bridge'],
    coopRequiredSignals: ['dw_bridge', 'dw_bridge_coop'],
    mode: 'all',
    speed: 0.72,
    style: 'bridge',
    openToast: 'Sky Bridge extended!',
  });

  // Alternative Route (West floating climb stones + Secret Relic #2!)
  b.addStaticBox({ size: [2.6, 0.85, 2.6], position: [-8.4, 2.1, -33.2] }, stoneMat);
  b.addStaticBox({ size: [2.6, 0.85, 2.6], position: [-9.2, 2.55, -37.5] }, stoneMat);
  b.addStaticBox({ size: [2.6, 0.85, 2.6], position: [-7.8, 2.65, -41.6] }, stoneMat);
  b.puzzleSystem.addSecretRelic(
    { id: 'dw-relic-2', position: [-9.2, 4.1, -37.5], label: 'Cloudhopper Relic' },
    foundRelics.includes('dw-relic-2'),
  );

  // === ISLAND 3: Summit Shrine ===
  addFloatingIsland(0, 2.2, -51.5, 17, 17, 3.2, stoneMat);
  // Decorative side meadow planters
  b.addVisualBox([3.0, 0.24, 12.5], [-6.8, 2.32, -51.5], grassMat);
  b.addVisualBox([3.0, 0.24, 12.5], [6.8, 2.32, -51.5], grassMat);

  b.puzzleSystem.addCheckpoint({
    id: 'dw-cp-2',
    index: 2,
    position: [0, 2.2, -45.2],
    spawnPos: [0, 3.6, -45.2],
    spawnYaw: 0,
    label: 'Checkpoint 2 · Summit Shrine Courtyard',
  });

  // Puzzle 2: Twin Shrine Gate (Left Pressure Plate + Right Elevated Lever)
  b.puzzleSystem.addPressurePlate({
    id: 'dw-plate-shrine',
    signalId: 'dw_shrine_l',
    position: [-4.5, 2.2, -49.5],
    size: [2.2, 2.2],
    minMass: 1.5,
    label: 'Shrine Weight Seal',
  });

  // Climbable plinth holding the right Shrine Lever
  b.addStaticBox({ size: [3.2, 1.8, 3.2], position: [5.0, 3.1, -49.5] }, plasterMat);
  b.addStaticBox({ size: [1.8, 0.9, 1.6], position: [5.0, 2.65, -47.2] }, stoneMat);
  b.puzzleSystem.addLever({
    id: 'dw-lever-shrine',
    signalId: 'dw_shrine_r',
    position: [5.0, 4.0, -49.5],
    rotationY: -Math.PI * 0.25,
    label: 'Shrine Sun Lever',
  });

  // Dynamic shrine blocks
  b.addDynamicObject({
    id: 'dw-shrine-blk-1',
    size: [0.92, 0.92, 0.92],
    initialPosition: [-4.4, 2.8, -46.2],
    color: 0xf0b589,
    mass: 2.2,
    kind: 'block',
  });
  b.addDynamicObject({
    id: 'dw-shrine-blk-2',
    size: [0.85, 0.85, 0.85],
    initialPosition: [3.2, 2.8, -46.2],
    color: 0xd9a7c7,
    mass: 1.9,
    kind: 'block',
  });

  // Shrine Wall & Archway framing the Mechanical Gate
  b.addStaticBox({ size: [5.4, 4.8, 1.4], position: [-5.3, 4.6, -53.0] }, plasterMat);
  b.addStaticBox({ size: [5.4, 4.8, 1.4], position: [5.3, 4.6, -53.0] }, plasterMat);
  b.addStaticBox({ size: [16.4, 1.2, 1.8], position: [0, 7.6, -53.0] }, coralMat);
  b.addVisualBox([4.6, 0.6, 1.2], [0, 8.5, -53.0], periwinkleMat);

  b.puzzleSystem.addMechanicalDoor({
    id: 'dw-shrine-gate',
    size: [5.2, 4.6, 0.85],
    closedPosition: [0, 4.5, -53.0],
    openPosition: [0, 9.2, -53.0],
    requiredSignals: ['dw_shrine_l', 'dw_shrine_r'],
    mode: 'all',
    speed: 0.7,
    style: 'stone-gate',
    color: 0xe6dfd3,
    openToast: 'Summit Shrine Gate unlocked!',
  });

  // Finish Zone beyond Shrine Gate
  b.puzzleSystem.addFinishZone({
    position: [0, 2.2, -57.2],
    radius: 2.4,
    label: 'Dream World Shrine',
  });

  // Secret Relic #3: Hidden rear terrace behind the finish dais (accessible via east flank)
  addFloatingIsland(5.6, 2.6, -64.0, 5.2, 4.4, 1.8, grassMat);
  b.addStaticBox({ size: [2.2, 0.45, 3.2], position: [5.4, 2.35, -60.8] }, woodMat);
  b.puzzleSystem.addSecretRelic(
    { id: 'dw-relic-3', position: [5.6, 3.85, -64.4], label: 'Dawn Star Shard' },
    foundRelics.includes('dw-relic-3'),
  );

  // === ENVIRONMENTAL DECORATION & BACKGROUND FLOATING ISLETS ===
  b.addInstancedPineTrees([
    [-5.6, 0, 5.4, 0.95],
    [5.8, 0, 5.2, 1.05],
    [-5.8, 0, -5.6, 0.88],
    [13.4, 1.6, -13.8, 0.82],
    [-6.6, 1.6, -17.8, 1.0],
    [6.6, 1.6, -17.5, 1.1],
    [6.8, 1.6, -30.2, 0.92],
    [-6.8, 1.6, -30.4, 0.98],
    [-7.2, 2.2, -57.6, 0.95],
    [7.2, 2.2, -57.6, 1.05],
  ]);

  b.addInstancedRocks([
    [-5.2, 0.3, 3.2, 0.7, 0.5, 0.6],
    [5.5, 0.3, 1.8, 0.65, 0.45, 0.65],
    [-6.8, 1.9, -22.2, 0.8, 0.55, 0.7],
    [6.9, 1.9, -26.5, 0.75, 0.5, 0.75],
  ]);

  // Distant scenic floating islets (zero physics overhead!)
  const bgIsletTopGeo = b.track(new THREE.CylinderGeometry(4.2, 3.6, 1.4, 7));
  const bgIsletConeGeo = b.track(new THREE.ConeGeometry(3.8, 5.6, 7));
  bgIsletConeGeo.rotateX(Math.PI);
  const bgSpecs: [number, number, number, number][] = [
    [-28, 3, -12, 1.2],
    [30, 5, -26, 1.4],
    [-32, 7, -46, 1.3],
    [26, 4, -56, 1.1],
    [0, 8, -86, 1.7],
    [-24, 1, 16, 1.0],
    [25, 2, 14, 1.15],
  ];
  for (const [ix, iy, iz, sc] of bgSpecs) {
    const g = new THREE.Group();
    g.position.set(ix, iy, iz);
    g.scale.setScalar(sc);
    const top = new THREE.Mesh(bgIsletTopGeo, grassMat);
    const bot = new THREE.Mesh(bgIsletConeGeo, rockUndersideMat);
    bot.position.y = -3.4;
    g.add(top, bot);
    b.root.add(g);
  }

  b.addDriftingClouds(12, 54, 19, 0xffffff);

  return b.finalize({
    spawnPos: [0, 1.6, 4.2],
    spawnYaw: 0,
    fallResetY: -12,
    minCameraY: -4,
    lighting: DREAM_LIGHTING,
    defaultObjective: 'Cross the floating islands, weight the sky plates, and reach the Summit Shrine.',
  });
}
