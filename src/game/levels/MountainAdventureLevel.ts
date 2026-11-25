import * as THREE from 'three';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import type { ProceduralTextureSet } from '../textures';
import type { ProceduralAudio } from '../audio';
import type { PuzzleCallbacks } from '../puzzles/PuzzleSystem';
import { LevelBuildHelper, type BuiltLevel, type LevelLightingTheme } from './LevelBuilder';

const MOUNTAIN_LIGHTING: LevelLightingTheme = {
  backgroundHex: 0xcbe3f7,
  fogHex: 0xdbeaf6,
  fogDensity: 0.0052,
  hemiSkyHex: 0xa4d4fc,
  hemiGroundHex: 0xbdaea0,
  hemiIntensity: 0.94,
  sunHex: 0xfff5e4,
  sunIntensity: 2.12,
  sunOffset: [24, 34, 16],
  rimHex: 0xc9e0fa,
  rimIntensity: 0.6,
  skyStops: [
    [0.0, '#4f94d4'],
    [0.28, '#87c1ed'],
    [0.48, '#d4e9f7'],
    [0.54, '#f0eee8'],
    [0.72, '#d3e2ef'],
    [1.0, '#a8c3d9'],
  ],
  sunDiscPos: [105, 130, 60],
  sunDiscColor: 0xfff9ea,
};

export function buildMountainAdventureLevel(
  physics: PhysicsWorld,
  textures: ProceduralTextureSet,
  audio: ProceduralAudio,
  callbacks: PuzzleCallbacks,
  foundRelics: string[] = [],
): BuiltLevel {
  const b = new LevelBuildHelper(physics, textures, audio, callbacks);
  b.addSkyDome(MOUNTAIN_LIGHTING.skyStops, MOUNTAIN_LIGHTING.sunDiscPos, MOUNTAIN_LIGHTING.sunDiscColor);

  const rockMat = b.track(
    new THREE.MeshStandardMaterial({
      color: 0xb9b4ab,
      map: textures.alpineStone,
      roughness: 0.9,
      metalness: 0.03,
    }),
  );
  const darkRockMat = b.track(
    new THREE.MeshStandardMaterial({
      color: 0x8f949e,
      map: textures.alpineStone,
      roughness: 0.92,
      flatShading: true,
    }),
  );
  const mossGrassMat = b.track(
    new THREE.MeshStandardMaterial({
      color: 0x84b584,
      roughness: 0.92,
    }),
  );
  const timberMat = b.track(
    new THREE.MeshStandardMaterial({
      color: 0xc7925d,
      map: textures.woodPlank,
      roughness: 0.8,
    }),
  );
  const snowMat = b.track(
    new THREE.MeshStandardMaterial({
      color: 0xf4f7fb,
      roughness: 0.84,
      flatShading: true,
    }),
  );

  // === STAGE 1: BASE CAMP & TIERED CLIFF CLIMB (y = 0 -> y = 3.6) ===
  b.addStaticBox({ size: [15, 3.6, 13], position: [0, -1.8, 0] }, mossGrassMat);
  b.addVisualBox([16, 16, 14], [0, -11.5, 0], darkRockMat, undefined, false);

  // Tiered granite cliff ledges (designed for tactile ledge grabbing, shimmying, and mantling!)
  b.addStaticBox({ size: [13, 1.4, 3.2], position: [0, 0.7, -6.2] }, rockMat);
  b.addStaticBox({ size: [11, 2.5, 3.4], position: [1.0, 1.25, -8.8] }, rockMat);
  // Upper plateau at y = 3.6
  b.addStaticBox({ size: [15, 4.0, 9.0], position: [0, 1.6, -13.6] }, rockMat);
  b.addVisualBox([14.4, 0.14, 8.4], [0, 3.62, -13.6], mossGrassMat, undefined, false);

  // Helper stepping crates on west flank for alternative boulder/block-assisted climb
  b.addDynamicObject({
    id: 'mt-crate-1',
    size: [0.95, 0.95, 0.95],
    initialPosition: [-4.2, 0.55, -2.5],
    color: 0xcf9b67,
    mass: 2.1,
    kind: 'crate',
  });
  b.addDynamicObject({
    id: 'mt-crate-2',
    size: [0.95, 0.95, 0.95],
    initialPosition: [-5.3, 0.55, -3.2],
    color: 0xcf9b67,
    mass: 2.1,
    kind: 'crate',
  });

  // Hidden East Cliff Ledge Alcove -> Secret Relic #1
  b.addStaticBox({ size: [3.6, 1.0, 3.2], position: [8.4, 2.1, -8.8] }, rockMat);
  b.puzzleSystem.addSecretRelic(
    { id: 'mt-relic-1', position: [8.6, 3.6, -8.8], label: 'Alpine Quartz' },
    foundRelics.includes('mt-relic-1'),
  );

  // === STAGE 2: WOODEN CHASM BRIDGE & MOVING CABLE PLATFORM ===
  b.puzzleSystem.addCheckpoint({
    id: 'mt-cp-1',
    index: 1,
    position: [0, 3.6, -13.2],
    spawnPos: [0, 5.0, -13.2],
    spawnYaw: 0,
    label: 'Checkpoint 1 · Cliff Overlook',
  });

  // Weathered wooden bridge across Chasm 1 (slightly angled & narrow for alpine tension)
  b.addStaticBox({ size: [2.9, 0.44, 9.6], position: [-1.5, 3.4, -22.2] }, timberMat);
  for (const pz of [-18.5, -22.2, -25.8]) {
    b.addVisualBox([0.2, 1.15, 0.2], [-2.85, 4.05, pz], timberMat);
    b.addVisualBox([0.2, 1.15, 0.2], [-0.15, 4.05, pz], timberMat);
  }

  // Mid-Crag Island (y = 3.6, z = -30.5)
  b.addStaticBox({ size: [12.5, 4.6, 9.5], position: [0, 1.3, -31.2] }, rockMat);
  b.addVisualBox([11.8, 0.14, 8.8], [0, 3.62, -31.2], mossGrassMat, undefined, false);

  // Cable Winch Lever powers the Alpine Moving Cable Platform
  b.puzzleSystem.addLever({
    id: 'mt-lever-cable',
    signalId: 'mt_cable',
    position: [3.8, 3.6, -32.8],
    rotationY: -Math.PI * 0.3,
    label: 'Alpine Cable Winch',
  });

  // Oscillating Alpine Cable Platform (crosses Chasm 2 and rises from y = 3.6 to y = 6.2!)
  b.puzzleSystem.addMovingPlatform({
    id: 'mt-cable-plat',
    size: [4.2, 0.55, 4.0],
    pointA: [0, 3.4, -37.8],
    pointB: [0, 5.95, -45.4],
    period: 7.4,
    requiredSignals: ['mt_cable'],
    style: 'alpine',
  });
  // Overhead visual steel cable & twin alpine timber towers
  b.addVisualBox([0.45, 7.0, 0.45], [-2.6, 6.8, -35.6], timberMat);
  b.addVisualBox([0.45, 7.0, 0.45], [2.6, 6.8, -35.6], timberMat);
  b.addVisualBox([5.8, 0.45, 0.45], [0, 10.1, -35.6], timberMat);

  // Optional East Goat-Path Rock Pillars -> Secret Relic #2 (and daredevil climb route!)
  b.addStaticBox({ size: [2.6, 1.4, 2.6], position: [8.4, 3.9, -32.2] }, rockMat);
  b.addStaticBox({ size: [2.8, 1.6, 2.8], position: [9.8, 4.9, -36.8] }, rockMat);
  b.addStaticBox({ size: [2.6, 1.6, 2.6], position: [8.2, 5.6, -42.2] }, rockMat);
  b.puzzleSystem.addSecretRelic(
    { id: 'mt-relic-2', position: [9.8, 6.8, -36.8], label: 'Eagle Feather Relic' },
    foundRelics.includes('mt-relic-2'),
  );

  // === STAGE 3: HEAVY BOULDER COUNTERWEIGHT & SUMMIT BRIDGE (y = 6.2) ===
  b.addStaticBox({ size: [17, 5.0, 14], position: [0, 3.7, -54.2] }, rockMat);
  b.addVisualBox([16.2, 0.14, 13.2], [0, 6.22, -54.2], mossGrassMat, undefined, false);

  b.puzzleSystem.addCheckpoint({
    id: 'mt-cp-2',
    index: 2,
    position: [0, 6.2, -49.2],
    spawnPos: [0, 7.6, -49.2],
    spawnYaw: 0,
    label: 'Checkpoint 2 · Boulder Ridge',
  });

  // Heavy Stone Counterweight Plate (minMass 4.5kg -> roll a heavy alpine boulder onto it!)
  b.puzzleSystem.addPressurePlate({
    id: 'mt-plate-boulder',
    signalId: 'mt_summit_bridge',
    position: [0, 6.2, -57.2],
    size: [2.6, 2.6],
    minMass: 4.5,
    latch: true,
    ignorePlayer: true,
    label: 'Summit Counterweight Scale',
    accentColor: 0x059669,
  });

  // Two heavy rolling mossy Alpine Boulders (dynamic spheres!)
  b.addDynamicObject({
    id: 'mt-boulder-1',
    size: [1.45, 1.45, 1.45],
    radius: 0.72,
    initialPosition: [-5.6, 7.1, -53.2],
    color: 0x9ca3af,
    mass: 5.5,
    kind: 'boulder',
  });
  b.addDynamicObject({
    id: 'mt-boulder-2',
    size: [1.45, 1.45, 1.45],
    radius: 0.72,
    initialPosition: [5.4, 7.1, -54.5],
    color: 0xa8a29e,
    mass: 5.5,
    kind: 'boulder',
  });

  // Summit Timber Bridge (rises into place once heavy boulder weights the scale)
  b.puzzleSystem.addMechanicalDoor({
    id: 'mt-summit-bridge',
    size: [4.0, 0.54, 9.2],
    closedPosition: [0, 1.8, -65.4],
    openPosition: [0, 6.08, -65.4],
    requiredSignals: ['mt_summit_bridge'],
    speed: 0.62,
    style: 'bridge',
    openToast: 'Summit Bridge raised!',
  });

  // Secret Relic #3: High West Rock Spire behind Boulder Ridge
  b.addStaticBox({ size: [3.4, 2.2, 3.6], position: [-9.2, 7.2, -56.5] }, rockMat);
  b.puzzleSystem.addSecretRelic(
    { id: 'mt-relic-3', position: [-9.2, 9.4, -56.5], label: 'Summit Edelweiss' },
    foundRelics.includes('mt-relic-3'),
  );

  // === SUMMIT PEAK FINISH DAIS ===
  b.addStaticBox({ size: [12, 5.2, 11], position: [0, 3.8, -75.0] }, rockMat);
  b.addVisualBox([11.4, 0.25, 10.4], [0, 6.42, -75.0], snowMat, undefined, false);
  b.puzzleSystem.addFinishZone({
    position: [0, 6.5, -75.2],
    radius: 2.5,
    label: 'Mountain Summit',
  });

  // === INSTANCED ALPINE PINES, ROCKS & DISTANT SNOW-CAPPED PEAKS ===
  b.addInstancedPineTrees(
    [
      [-6.2, 0, 4.8, 1.05],
      [6.2, 0, 4.5, 1.15],
      [6.4, 0, -2.5, 0.92],
      [-6.2, 3.6, -15.8, 1.0],
      [6.3, 3.6, -16.0, 1.12],
      [-5.4, 3.6, -34.2, 0.95],
      [5.5, 3.6, -28.0, 1.04],
      [-7.4, 6.2, -49.0, 1.0],
      [7.4, 6.2, -49.2, 1.1],
      [7.2, 6.2, -59.6, 0.92],
      [-4.6, 6.4, -79.2, 1.05],
      [4.8, 6.4, -79.0, 1.12],
    ],
    [0x4f8a6e, 0x5c997c, 0x6ca88a, 0x457d63],
  );

  b.addInstancedRocks([
    [-6.0, 0.3, 1.8, 0.9, 0.65, 0.8],
    [5.8, 3.9, -11.4, 0.85, 0.6, 0.8],
    [-4.8, 3.9, -28.4, 0.9, 0.55, 0.85],
    [6.6, 6.5, -51.4, 0.95, 0.7, 0.9],
  ]);

  // Distant monumental alpine peaks ring
  const peakGeo = b.track(new THREE.ConeGeometry(1, 1, 6));
  const capGeo = b.track(new THREE.ConeGeometry(0.42, 0.38, 6));
  const farPeakMat = b.track(
    new THREE.MeshStandardMaterial({ color: 0x99b3cc, roughness: 0.94, flatShading: true }),
  );
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const dist = 95 + (i % 3) * 20;
    const rad = 24 + (i % 4) * 7;
    const h = 50 + (i % 4) * 14;
    const px = Math.cos(a) * dist;
    const pz = -36 + Math.sin(a) * dist;

    const peak = new THREE.Mesh(peakGeo, farPeakMat);
    peak.scale.set(rad, h, rad);
    peak.position.set(px, -26 + h * 0.45, pz);
    peak.rotation.y = i * 0.6;
    b.root.add(peak);

    const cap = new THREE.Mesh(capGeo, snowMat);
    cap.scale.set(rad * 0.92, h * 0.92, rad * 0.92);
    cap.position.set(px, -26 + h * 0.79, pz);
    cap.rotation.y = i * 0.6;
    b.root.add(cap);
  }

  b.addDriftingClouds(10, 62, 26, 0xf8fbff);

  return b.finalize({
    spawnPos: [0, 1.6, 3.5],
    spawnYaw: 0,
    fallResetY: -12,
    minCameraY: -4,
    lighting: MOUNTAIN_LIGHTING,
    defaultObjective: 'Climb the alpine cliffs, power the cable platform, and roll a boulder onto the summit scale.',
  });
}
