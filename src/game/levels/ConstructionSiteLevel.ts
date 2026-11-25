import * as THREE from 'three';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import type { ProceduralTextureSet } from '../textures';
import type { ProceduralAudio } from '../audio';
import type { PuzzleCallbacks } from '../puzzles/PuzzleSystem';
import { LevelBuildHelper, type BuiltLevel, type LevelLightingTheme } from './LevelBuilder';

const CONSTRUCTION_LIGHTING: LevelLightingTheme = {
  backgroundHex: 0xf1d4b8,
  fogHex: 0xf4dac2,
  fogDensity: 0.0046,
  hemiSkyHex: 0xffe2be,
  hemiGroundHex: 0xa69488,
  hemiIntensity: 0.96,
  sunHex: 0xffd7a3,
  sunIntensity: 2.15,
  sunOffset: [26, 24, 18],
  rimHex: 0x9ec5f0,
  rimIntensity: 0.56,
  skyStops: [
    [0.0, '#4f76ad'],
    [0.28, '#8ba6cc'],
    [0.46, '#f2c599'],
    [0.54, '#fce0be'],
    [0.7, '#ebd0ba'],
    [1.0, '#c2ad9e'],
  ],
  sunDiscPos: [105, 78, 65],
  sunDiscColor: 0xffe6b8,
};

export function buildConstructionSiteLevel(
  physics: PhysicsWorld,
  textures: ProceduralTextureSet,
  audio: ProceduralAudio,
  callbacks: PuzzleCallbacks,
  foundRelics: string[] = [],
): BuiltLevel {
  const b = new LevelBuildHelper(physics, textures, audio, callbacks);
  b.addSkyDome(
    CONSTRUCTION_LIGHTING.skyStops,
    CONSTRUCTION_LIGHTING.sunDiscPos,
    CONSTRUCTION_LIGHTING.sunDiscColor,
  );

  const concreteMat = b.track(
    new THREE.MeshStandardMaterial({
      color: 0xd1cec7,
      map: textures.industrialConcrete,
      roughness: 0.86,
      metalness: 0.05,
    }),
  );
  const craneYellowMat = b.track(
    new THREE.MeshStandardMaterial({
      color: 0xf0ad2e,
      roughness: 0.45,
      metalness: 0.38,
    }),
  );
  const scaffoldBlueMat = b.track(
    new THREE.MeshStandardMaterial({
      color: 0x3b6ea5,
      map: textures.metalPanel,
      roughness: 0.48,
      metalness: 0.56,
    }),
  );
  const plankDeckMat = b.track(
    new THREE.MeshStandardMaterial({
      color: 0xd6a56e,
      map: textures.woodPlank,
      roughness: 0.78,
    }),
  );
  const girderMat = b.track(
    new THREE.MeshStandardMaterial({
      color: 0xa64b3b,
      roughness: 0.58,
      metalness: 0.52,
    }),
  );
  const cautionMat = b.track(
    new THREE.MeshStandardMaterial({
      map: textures.cautionStripe,
      roughness: 0.56,
    }),
  );

  // === STAGE 1: CONCRETE ENTRY DECK & TIMBER PLANK BRIDGE PUZZLE ===
  b.addStaticBox({ size: [15, 2.8, 12], position: [0, -1.4, 2.0] }, concreteMat);
  b.addVisualBox([15.2, 0.3, 0.25], [0, -0.15, -4.0], cautionMat);

  // Movable Construction Timber Planks for bridging Gap 1 (3.8m gap z = -4.0 to -7.8)
  b.addDynamicObject({
    id: 'cs-plank-1',
    size: [1.15, 0.24, 5.2],
    initialPosition: [-3.4, 0.35, -0.4],
    initialRotationY: 0.06,
    color: 0xd9a66c,
    mass: 2.3,
    kind: 'plank',
  });
  b.addDynamicObject({
    id: 'cs-plank-2',
    size: [1.15, 0.24, 5.2],
    initialPosition: [3.2, 0.35, -0.2],
    initialRotationY: -0.08,
    color: 0xd9a66c,
    mass: 2.3,
    kind: 'plank',
  });
  // Narrow central red steel I-beam (walkable tightrope or plank support!)
  b.addStaticBox({ size: [0.62, 0.5, 4.4], position: [0, -0.35, -6.0] }, girderMat);

  // Alternative East Scaffolding Bypass + Secret Relic #1
  b.addStaticBox({ size: [2.6, 0.4, 6.2], position: [9.0, 0.4, -5.8] }, plankDeckMat);
  b.addStaticBox({ size: [2.4, 1.0, 2.4], position: [7.8, 0.2, -1.8] }, scaffoldBlueMat);
  b.puzzleSystem.addSecretRelic(
    { id: 'cs-relic-1', position: [9.2, 1.75, -6.2], label: 'Surveyor Prism' },
    foundRelics.includes('cs-relic-1'),
  );

  // === STAGE 2: CRANE LAUNCH DECK & PHYSICS-BASED ROPE SWING ===
  b.addStaticBox({ size: [15, 2.8, 11], position: [0, -1.4, -13.5] }, concreteMat);
  // Elevated launch platform (y = 1.6) facing the rope chasm
  b.addStaticBox({ size: [10, 1.6, 4.2], position: [0, 0.8, -17.0] }, plankDeckMat);
  b.addStaticBox({ size: [2.6, 0.8, 2.2], position: [-3.2, 0.4, -14.2] }, concreteMat);

  b.puzzleSystem.addCheckpoint({
    id: 'cs-cp-1',
    index: 1,
    position: [0, 0, -11.2],
    spawnPos: [0, 1.4, -11.2],
    spawnYaw: 0,
    label: 'Checkpoint 1 · Tower Crane Deck',
  });

  // Towering Yellow Construction Crane Structure (composite multi-part landmark!)
  const craneBaseX = -10.5;
  const craneBaseZ = -21.5;
  b.addStaticBox({ size: [4.2, 4.2, 4.2], position: [craneBaseX, 1.4, craneBaseZ] }, concreteMat);
  // Vertical yellow crane mast
  b.addVisualBox([1.4, 15.5, 1.4], [craneBaseX, 11.2, craneBaseZ], craneYellowMat);
  // Crane operator cab
  b.addVisualBox([2.4, 2.2, 2.4], [craneBaseX + 1.4, 13.8, craneBaseZ], scaffoldBlueMat);
  // Horizontal jib boom extending over the rope swing chasm!
  b.addVisualBox([24.0, 1.1, 1.2], [craneBaseX + 9.5, 15.6, craneBaseZ - 0.6], craneYellowMat);
  // Overhead steel support beam at y = 9.0 where the physics ropes anchor
  b.addVisualBox([12.0, 0.5, 0.5], [1.5, 9.2, -22.8], girderMat);
  b.addVisualBox([0.16, 6.2, 0.16], [-2.5, 12.4, -22.8], scaffoldBlueMat);
  b.addVisualBox([0.16, 6.2, 0.16], [5.5, 12.4, -22.8], scaffoldBlueMat);

  // TWO REAL CANNON-ES PHYSICS ROPES hanging over the chasm (z = -19.1 to -26.8)
  b.puzzleSystem.addPhysicsRope({
    id: 'cs-rope-1',
    anchor: [-0.8, 9.1, -22.6],
    length: 6.4,
    segments: 7,
    handleMass: 1.8,
    handleColor: 0xf97316,
    initialSwingOffsetZ: 1.6,
  });
  b.puzzleSystem.addPhysicsRope({
    id: 'cs-rope-2',
    anchor: [3.2, 9.1, -23.1],
    length: 6.4,
    segments: 7,
    handleMass: 1.8,
    handleColor: 0xeab308,
    initialSwingOffsetZ: 1.2,
  });

  // Alternative Solution to Rope Swing: Emergency Steel Catwalk Lever on Crane Base
  b.addStaticBox({ size: [3.2, 1.6, 3.0], position: [-7.2, 0.8, -17.2] }, scaffoldBlueMat);
  b.puzzleSystem.addLever({
    id: 'cs-lever-catwalk',
    signalId: 'cs_catwalk',
    position: [-7.2, 1.6, -17.2],
    rotationY: Math.PI * 0.35,
    label: 'Crane Catwalk Extension',
  });
  b.puzzleSystem.addMechanicalDoor({
    id: 'cs-emergency-catwalk',
    size: [2.8, 0.45, 9.2],
    closedPosition: [-6.8, -1.6, -23.0],
    openPosition: [-6.8, 1.4, -23.0],
    requiredSignals: ['cs_catwalk'],
    speed: 0.72,
    style: 'crane-lift',
    openToast: 'Steel Catwalk lowered across the gap!',
  });

  // Secret Relic #2 atop the Crane Counterweight Block
  b.puzzleSystem.addSecretRelic(
    { id: 'cs-relic-2', position: [craneBaseX, 4.6, craneBaseZ], label: 'Crane Operator Badge' },
    foundRelics.includes('cs-relic-2'),
  );

  // === STAGE 3: MULTI-STAGE SCAFFOLDING & ROOFTOP HOIST (y = 1.6 -> y = 7.6) ===
  b.addStaticBox({ size: [17, 3.2, 14], position: [0, 0.0, -33.6] }, concreteMat);

  b.puzzleSystem.addCheckpoint({
    id: 'cs-cp-2',
    index: 2,
    position: [0, 1.6, -29.2],
    spawnPos: [0, 3.0, -29.2],
    spawnYaw: 0,
    label: 'Checkpoint 2 · Scaffolding Tower Base',
  });

  // Stage A: Heavy Concrete Counterweight Scale (requires 4.0kg concrete/metal block)
  b.puzzleSystem.addPressurePlate({
    id: 'cs-plate-hoist',
    signalId: 'cs_hoist_a',
    position: [-5.6, 1.6, -35.0],
    size: [2.5, 2.5],
    minMass: 4.0,
    label: 'Hoist Counterweight Scale',
    accentColor: 0xf59e0b,
  });

  b.addDynamicObject({
    id: 'cs-weight-1',
    size: [1.05, 1.05, 1.05],
    initialPosition: [-3.2, 2.2, -31.8],
    color: 0x8e99a8,
    mass: 4.8,
    kind: 'metal-crate',
  });
  b.addDynamicObject({
    id: 'cs-crate-help',
    size: [0.95, 0.95, 0.95],
    initialPosition: [4.0, 2.2, -31.5],
    color: 0xd9a773,
    mass: 2.1,
    kind: 'crate',
  });

  // Stage B: East Modular Blue Scaffolding Tower leading to Hoist Breaker Lever (y = 5.0)
  b.addStaticBox({ size: [4.2, 0.35, 5.4], position: [6.8, 3.15, -32.2] }, plankDeckMat);
  b.addStaticBox({ size: [4.2, 0.35, 6.2], position: [6.8, 4.9, -35.8] }, plankDeckMat);
  b.addStaticBox({ size: [2.2, 1.2, 2.0], position: [6.8, 2.2, -29.2] }, scaffoldBlueMat);

  b.puzzleSystem.addLever({
    id: 'cs-lever-hoist',
    signalId: 'cs_hoist_b',
    position: [6.8, 5.08, -36.8],
    rotationY: -Math.PI * 0.35,
    label: 'Rooftop Hoist Breaker',
  });

  // Multi-Stage Rooftop Construction Hoist (requires BOTH counterweight scale AND breaker lever!)
  b.puzzleSystem.addMovingPlatform({
    id: 'cs-rooftop-hoist',
    size: [4.6, 0.56, 4.4],
    pointA: [0, 1.88, -42.8],
    pointB: [0, 7.35, -42.8],
    period: 6.8,
    requiredSignals: ['cs_hoist_a', 'cs_hoist_b'],
    mode: 'all',
    style: 'construction',
  });
  // Hoist tower guide mast
  b.addVisualBox([0.36, 10.5, 0.36], [-2.55, 6.2, -45.0], craneYellowMat);
  b.addVisualBox([0.36, 10.5, 0.36], [2.55, 6.2, -45.0], craneYellowMat);

  // Secret Relic #3: High East Scaffolding Catwalk (jump off hoist near top!)
  b.addStaticBox({ size: [3.6, 0.38, 4.8], position: [7.6, 7.35, -42.6] }, plankDeckMat);
  b.puzzleSystem.addSecretRelic(
    { id: 'cs-relic-3', position: [7.6, 8.65, -42.6], label: 'Golden Hardhat' },
    foundRelics.includes('cs-relic-3'),
  );

  // === ROOFTOP FINISH DECK (y = 7.6) ===
  b.addStaticBox({ size: [14, 3.0, 11], position: [0, 6.1, -50.8] }, concreteMat);
  b.addVisualBox([14.2, 0.28, 0.28], [0, 7.55, -45.3], cautionMat);
  b.puzzleSystem.addFinishZone({
    position: [0, 7.6, -51.2],
    radius: 2.5,
    label: 'High-Rise Rooftop Helipad',
  });

  // === INSTANCED SCAFFOLDING VERTICAL POLES & DISTANT GOLDEN SKYLINE ===
  const poleGeo = b.track(new THREE.CylinderGeometry(0.11, 0.11, 8.5, 8));
  const poleCoords: [number, number, number][] = [
    [4.8, 5.4, -29.6],
    [8.8, 5.4, -29.6],
    [4.8, 5.4, -34.8],
    [8.8, 5.4, -34.8],
    [4.8, 5.4, -38.8],
    [8.8, 5.4, -38.8],
    [5.9, 6.0, -40.3],
    [9.3, 6.0, -40.3],
    [5.9, 6.0, -44.8],
    [9.3, 6.0, -44.8],
    [7.8, 3.2, -3.0],
    [10.2, 3.2, -3.0],
    [7.8, 3.2, -8.6],
    [10.2, 3.2, -8.6],
  ];
  const poles = new THREE.InstancedMesh(poleGeo, scaffoldBlueMat, poleCoords.length);
  poles.castShadow = true;
  const dummy = new THREE.Object3D();
  poleCoords.forEach(([px, py, pz], idx) => {
    dummy.position.set(px, py, pz);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    poles.setMatrixAt(idx, dummy.matrix);
  });
  poles.instanceMatrix.needsUpdate = true;
  poles.computeBoundingSphere();
  b.root.add(poles);

  // Distant sunlit city tower silhouettes for golden-hour altitude feel
  const towerGeo = b.track(new THREE.BoxGeometry(1, 1, 1));
  const towerMat = b.track(
    new THREE.MeshStandardMaterial({ color: 0xc2b2a8, roughness: 0.9 }),
  );
  const towerCount = 18;
  const towers = new THREE.InstancedMesh(towerGeo, towerMat, towerCount);
  for (let i = 0; i < towerCount; i++) {
    const a = (i / towerCount) * Math.PI * 2;
    const dist = 78 + (i % 3) * 20;
    const h = 28 + (i % 5) * 14;
    const w = 10 + (i % 3) * 5;
    dummy.position.set(Math.cos(a) * dist, -30 + h * 0.5, -24 + Math.sin(a) * dist);
    dummy.rotation.set(0, a * 0.5, 0);
    dummy.scale.set(w, h, w);
    dummy.updateMatrix();
    towers.setMatrixAt(i, dummy.matrix);
  }
  towers.instanceMatrix.needsUpdate = true;
  towers.computeBoundingSphere();
  b.root.add(towers);

  b.addDriftingClouds(9, 60, 24, 0xfff0dc);

  return b.finalize({
    spawnPos: [0, 1.6, 4.2],
    spawnYaw: 0,
    fallResetY: -12,
    minCameraY: -4,
    lighting: CONSTRUCTION_LIGHTING,
    defaultObjective: 'Bridge the girder gap, swing across the crane ropes, and power the rooftop hoist.',
  });
}
