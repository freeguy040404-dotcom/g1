import * as THREE from 'three';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import type { ProceduralTextureSet } from '../textures';
import type { ProceduralAudio } from '../audio';
import type { PuzzleCallbacks } from '../puzzles/PuzzleSystem';
import { LevelBuildHelper, type BuiltLevel, type LevelLightingTheme } from './LevelBuilder';

const WAREHOUSE_LIGHTING: LevelLightingTheme = {
  backgroundHex: 0xdce4ec,
  fogHex: 0xe4e8ec,
  fogDensity: 0.0042,
  hemiSkyHex: 0xd4e6f7,
  hemiGroundHex: 0xc9bfb2,
  hemiIntensity: 1.05,
  sunHex: 0xfff1d6,
  sunIntensity: 1.95,
  sunOffset: [16, 32, 14],
  rimHex: 0xc2d8f0,
  rimIntensity: 0.55,
  skyStops: [
    [0.0, '#7ba4c7'],
    [0.35, '#b6cfe3'],
    [0.52, '#f0e4d3'],
    [1.0, '#cfd8e0'],
  ],
  sunDiscPos: [80, 130, 50],
  sunDiscColor: 0xfff5dc,
};

export function buildWarehouseLevel(
  physics: PhysicsWorld,
  textures: ProceduralTextureSet,
  audio: ProceduralAudio,
  callbacks: PuzzleCallbacks,
  foundRelics: string[] = [],
): BuiltLevel {
  const b = new LevelBuildHelper(physics, textures, audio, callbacks);
  b.addSkyDome(WAREHOUSE_LIGHTING.skyStops, WAREHOUSE_LIGHTING.sunDiscPos, WAREHOUSE_LIGHTING.sunDiscColor);

  const floorMat = b.track(
    new THREE.MeshStandardMaterial({
      color: 0xd8d5ce,
      map: textures.industrialConcrete,
      roughness: 0.82,
      metalness: 0.06,
    }),
  );
  const wallMat = b.track(
    new THREE.MeshStandardMaterial({
      color: 0xe6e1d7,
      map: textures.mattePlaster,
      roughness: 0.86,
      metalness: 0.04,
    }),
  );
  const steelMat = b.track(
    new THREE.MeshStandardMaterial({
      color: 0x4c5d73,
      map: textures.metalPanel,
      roughness: 0.45,
      metalness: 0.62,
    }),
  );
  const safetyMat = b.track(
    new THREE.MeshStandardMaterial({
      map: textures.cautionStripe,
      roughness: 0.55,
      metalness: 0.2,
    }),
  );
  const rackWoodMat = b.track(
    new THREE.MeshStandardMaterial({
      color: 0xc99a68,
      map: textures.woodPlank,
      roughness: 0.78,
    }),
  );
  const terracottaTrimMat = b.track(
    new THREE.MeshStandardMaterial({
      color: 0xd97954,
      roughness: 0.68,
      metalness: 0.14,
    }),
  );

  // === MAIN WAREHOUSE FLOOR & PERIMETER SHELL ===
  b.addStaticBox({ size: [34, 3.0, 68], position: [0, -1.5, -24] }, floorMat, true, false);
  // Outer sunlit concrete yard surround
  b.addVisualBox([90, 2, 120], [0, -2.5, -24], wallMat, undefined, false);

  // Perimeter Warehouse Walls (open skylight roof for bright sunny atmosphere)
  b.addStaticBox({ size: [1.6, 12, 68], position: [-16.2, 6, -24] }, wallMat);
  b.addStaticBox({ size: [1.6, 12, 68], position: [16.2, 6, -24] }, wallMat);
  b.addStaticBox({ size: [34, 12, 1.6], position: [0, 6, 9.5] }, wallMat);
  b.addStaticBox({ size: [34, 12, 1.6], position: [0, 6, -57.5] }, wallMat);

  // Overhead instanced steel roof trusses (draw-call optimized!)
  const trussGeo = b.track(new THREE.BoxGeometry(31.5, 0.55, 0.55));
  const trussCount = 9;
  const trusses = new THREE.InstancedMesh(trussGeo, steelMat, trussCount);
  trusses.castShadow = true;
  const dummy = new THREE.Object3D();
  for (let i = 0; i < trussCount; i++) {
    dummy.position.set(0, 11.4, 6 - i * 7.6);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    trusses.setMatrixAt(i, dummy.matrix);
  }
  trusses.instanceMatrix.needsUpdate = true;
  trusses.computeBoundingSphere();
  b.root.add(trusses);

  // === ZONE 1: RECEIVING BAY (Heavy Cargo Scale -> Bay Door 1) ===
  // Partition wall separating Zone 1 & Zone 2 at z = -12
  b.addStaticBox({ size: [12.5, 9.5, 1.4], position: [-9.2, 4.75, -12] }, wallMat);
  b.addStaticBox({ size: [12.5, 9.5, 1.4], position: [9.2, 4.75, -12] }, wallMat);
  b.addStaticBox({ size: [7.2, 4.2, 1.5], position: [0, 7.4, -12] }, terracottaTrimMat);

  // Heavy Cargo Scale (requires 4.0 kg: either 1 heavy metal crate OR 2 wooden boxes stacked/placed together!)
  b.puzzleSystem.addPressurePlate({
    id: 'wh-scale-1',
    signalId: 'wh_door1',
    position: [-5.0, 0, -6.5],
    size: [2.5, 2.5],
    minMass: 4.0,
    label: 'Heavy Cargo Scale (4kg)',
    accentColor: 0xea580c,
  });

  // Heavy metal crate + wooden crates in Zone 1
  b.addDynamicObject({
    id: 'wh-metal-1',
    size: [1.05, 1.05, 1.05],
    initialPosition: [4.2, 0.6, -4.5],
    initialRotationY: 0.1,
    color: 0x94a3b8,
    mass: 4.8,
    kind: 'metal-crate',
  });
  b.addDynamicObject({
    id: 'wh-wood-1',
    size: [0.92, 0.92, 0.92],
    initialPosition: [-3.2, 0.55, -1.2],
    initialRotationY: -0.08,
    color: 0xd9a773,
    mass: 2.1,
    kind: 'crate',
  });
  b.addDynamicObject({
    id: 'wh-wood-2',
    size: [0.92, 0.92, 0.92],
    initialPosition: [-1.8, 0.55, -1.5],
    initialRotationY: 0.16,
    color: 0xd9a773,
    mass: 2.1,
    kind: 'crate',
  });

  // Mechanical Sliding Bay Door 1
  b.puzzleSystem.addMechanicalDoor({
    id: 'wh-bay-door-1',
    size: [6.0, 5.2, 0.85],
    closedPosition: [0, 2.6, -12.0],
    openPosition: [0, 7.8, -12.0],
    requiredSignals: ['wh_door1'],
    speed: 0.68,
    style: 'warehouse-door',
    openToast: 'Loading Bay Door 1 opened!',
  });

  // East Storage Shelving + Climbable Crate Steps -> Secret Relic #1
  b.addStaticBox({ size: [3.2, 0.35, 11.5], position: [12.8, 3.3, -3.5] }, rackWoodMat);
  b.addStaticBox({ size: [2.2, 1.6, 2.2], position: [11.2, 0.8, 3.2] }, steelMat);
  b.addVisualBox([0.3, 6.4, 0.3], [11.3, 3.2, -9.0], steelMat);
  b.addVisualBox([0.3, 6.4, 0.3], [11.3, 3.2, 2.0], steelMat);
  b.addVisualBox([0.3, 6.4, 0.3], [14.3, 3.2, -9.0], steelMat);
  b.addVisualBox([0.3, 6.4, 0.3], [14.3, 3.2, 2.0], steelMat);

  b.puzzleSystem.addSecretRelic(
    { id: 'wh-relic-1', position: [12.8, 4.5, -5.5], label: 'Manifest Token' },
    foundRelics.includes('wh-relic-1'),
  );

  // === ZONE 2: MACHINERY HALL (Moving Gantry + Freight Lift) ===
  b.puzzleSystem.addCheckpoint({
    id: 'wh-cp-1',
    index: 1,
    position: [0, 0, -15.5],
    spawnPos: [0, 1.4, -15.5],
    spawnYaw: 0,
    label: 'Checkpoint 1 · Machinery Hall',
  });

  // West Control Deck (climbable 1.8m steel deck holding the Freight Lift Power Lever)
  b.addStaticBox({ size: [5.2, 1.8, 7.6], position: [-11.5, 0.9, -22.5] }, steelMat);
  b.addStaticBox({ size: [2.4, 0.9, 2.2], position: [-7.8, 0.45, -19.2] }, safetyMat);
  b.puzzleSystem.addLever({
    id: 'wh-lever-lift',
    signalId: 'wh_lift_power',
    position: [-11.5, 1.8, -24.5],
    rotationY: Math.PI * 0.4,
    label: 'Freight Lift Power Switch',
  });

  // Moving Overhead Machinery: Continuous Horizontal Cargo Gantry (alternative way to East Catwalk!)
  b.puzzleSystem.addMovingPlatform({
    id: 'wh-gantry-horiz',
    size: [4.2, 0.55, 3.6],
    pointA: [-6.8, 2.2, -21.5],
    pointB: [8.2, 2.2, -21.5],
    period: 7.5,
    style: 'warehouse',
  });

  // East Catwalk Steps (climbable alternative route onto Mezzanine!)
  b.addStaticBox({ size: [4.2, 3.2, 6.5], position: [12.4, 1.6, -22.5] }, steelMat);
  b.addStaticBox({ size: [3.2, 0.45, 5.5], position: [12.4, 4.2, -27.2] }, rackWoodMat);

  // Central Freight Lift Platform (powered by West Control Deck Lever -> rises to Mezzanine y = 4.4)
  b.puzzleSystem.addMovingPlatform({
    id: 'wh-freight-lift',
    size: [4.6, 0.55, 4.4],
    pointA: [0, 0.35, -25.4],
    pointB: [0, 4.15, -25.4],
    period: 6.4,
    requiredSignals: ['wh_lift_power'],
    style: 'construction',
  });
  // Decorative vertical lift guide rails
  b.addVisualBox([0.32, 8.6, 0.32], [-2.55, 4.3, -27.4], steelMat);
  b.addVisualBox([0.32, 8.6, 0.32], [2.55, 4.3, -27.4], steelMat);

  // === ZONE 3: UPPER DISPATCH MEZZANINE (y = 4.4) ===
  b.addStaticBox({ size: [31.2, 4.4, 28.0], position: [0, 2.2, -42.5] }, floorMat);
  // Safety stripe trim along mezzanine front edge
  b.addVisualBox([31.0, 0.38, 0.22], [0, 4.25, -28.45], safetyMat);

  b.puzzleSystem.addCheckpoint({
    id: 'wh-cp-2',
    index: 2,
    position: [0, 4.4, -31.2],
    spawnPos: [0, 5.8, -31.2],
    spawnYaw: 0,
    label: 'Checkpoint 2 · Dispatch Mezzanine',
  });

  // Secret Relic #2 tucked behind East Mezzanine rack
  b.addStaticBox({ size: [2.8, 2.4, 4.2], position: [12.6, 5.6, -33.2] }, rackWoodMat);
  b.puzzleSystem.addSecretRelic(
    { id: 'wh-relic-2', position: [13.2, 7.8, -33.2], label: 'Foreman Key' },
    foundRelics.includes('wh-relic-2'),
  );

  // Mezzanine Partition Wall & Dispatch Bay Door 2 (at z = -45.5)
  b.addStaticBox({ size: [12.5, 6.2, 1.4], position: [-9.2, 7.5, -45.5] }, wallMat);
  b.addStaticBox({ size: [12.5, 6.2, 1.4], position: [9.2, 7.5, -45.5] }, wallMat);
  b.addStaticBox({ size: [7.2, 2.0, 1.5], position: [0, 10.6, -45.5] }, terracottaTrimMat);

  // Puzzle 3: Dual Dispatch Lock (West Lever + East Weight Scale)
  b.puzzleSystem.addLever({
    id: 'wh-lever-dispatch',
    signalId: 'wh_door2_a',
    position: [-7.4, 4.4, -39.5],
    rotationY: Math.PI * 0.25,
    label: 'Dispatch Release Lever',
  });

  b.puzzleSystem.addPressurePlate({
    id: 'wh-scale-2',
    signalId: 'wh_door2_b',
    position: [6.4, 4.4, -39.5],
    size: [2.3, 2.3],
    minMass: 1.8,
    label: 'Dispatch Cargo Pad',
  });

  // Mezzanine movable crates
  b.addDynamicObject({
    id: 'wh-mezz-crate-1',
    size: [0.95, 0.95, 0.95],
    initialPosition: [4.2, 5.0, -35.2],
    color: 0xd9a773,
    mass: 2.2,
    kind: 'crate',
  });
  b.addDynamicObject({
    id: 'wh-mezz-crate-2',
    size: [1.0, 1.0, 1.0],
    initialPosition: [-5.8, 5.0, -35.0],
    color: 0x94a3b8,
    mass: 4.2,
    kind: 'metal-crate',
  });

  b.puzzleSystem.addMechanicalDoor({
    id: 'wh-bay-door-2',
    size: [6.0, 5.0, 0.85],
    closedPosition: [0, 6.9, -45.5],
    openPosition: [0, 11.8, -45.5],
    requiredSignals: ['wh_door2_a', 'wh_door2_b'],
    mode: 'all',
    speed: 0.72,
    style: 'warehouse-door',
    openToast: 'Dispatch Bay Door opened!',
  });

  // Secret Relic #3: High West Maintenance Catwalk (climb metal crate near wall to reach)
  b.addStaticBox({ size: [3.2, 0.4, 7.0], position: [-12.5, 6.9, -39.5] }, steelMat);
  b.puzzleSystem.addSecretRelic(
    { id: 'wh-relic-3', position: [-12.5, 8.1, -41.2], label: 'Golden Gear' },
    foundRelics.includes('wh-relic-3'),
  );

  // Finish Zone in Dispatch Bay
  b.puzzleSystem.addFinishZone({
    position: [0, 4.4, -51.5],
    radius: 2.4,
    label: 'Warehouse Dispatch Exit',
  });

  // === INSTANCED DECORATIVE BACKGROUND STACKED CRATES ===
  const bgCrateGeo = b.track(new THREE.BoxGeometry(1.4, 1.4, 1.4));
  const bgCrateMat = b.track(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.woodCrate,
      roughness: 0.82,
    }),
  );
  const bgCrateCoords: [number, number, number][] = [
    [-13.5, 0.7, 5.5],
    [-13.5, 2.1, 5.5],
    [-11.8, 0.7, 5.8],
    [-13.8, 0.7, -7.8],
    [-13.8, 2.1, -7.8],
    [13.4, 0.7, -16.5],
    [13.4, 2.1, -16.5],
    [12.8, 5.1, -51.0],
    [-12.8, 5.1, -51.0],
    [-12.8, 6.5, -51.0],
  ];
  const bgCrates = new THREE.InstancedMesh(bgCrateGeo, bgCrateMat, bgCrateCoords.length);
  bgCrates.castShadow = true;
  bgCrates.receiveShadow = true;
  const tint = new THREE.Color();
  bgCrateCoords.forEach(([cx, cy, cz], idx) => {
    dummy.position.set(cx, cy, cz);
    dummy.rotation.set(0, idx * 0.22, 0);
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    bgCrates.setMatrixAt(idx, dummy.matrix);
    tint.setHex(idx % 3 === 0 ? 0xd4a472 : idx % 3 === 1 ? 0xc49566 : 0x9aa8b8);
    bgCrates.setColorAt(idx, tint);
  });
  bgCrates.instanceMatrix.needsUpdate = true;
  if (bgCrates.instanceColor) bgCrates.instanceColor.needsUpdate = true;
  bgCrates.computeBoundingSphere();
  b.root.add(bgCrates);

  return b.finalize({
    spawnPos: [0, 1.6, 5.2],
    spawnYaw: 0,
    fallResetY: -10,
    minCameraY: 0.45,
    lighting: WAREHOUSE_LIGHTING,
    defaultObjective: 'Weight the cargo scales, activate the freight lift, and open the dispatch bay doors.',
  });
}
