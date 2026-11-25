import * as THREE from 'three';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import type { ProceduralTextureSet } from '../textures';
import type { ProceduralAudio } from '../audio';
import type { PuzzleCallbacks } from '../puzzles/PuzzleSystem';
import { LevelBuildHelper, type BuiltLevel, type LevelLightingTheme } from './LevelBuilder';

const CASTLE_LIGHTING: LevelLightingTheme = {
  backgroundHex: 0xd8e4f5,
  fogHex: 0xe3e8f2,
  fogDensity: 0.0044,
  hemiSkyHex: 0xbdd4fa,
  hemiGroundHex: 0xc9b59e,
  hemiIntensity: 0.96,
  sunHex: 0xfff0d4,
  sunIntensity: 2.1,
  sunOffset: [22, 32, 18],
  rimHex: 0xc8d8f8,
  rimIntensity: 0.58,
  skyStops: [
    [0.0, '#5a83cf'],
    [0.3, '#97b7eb'],
    [0.48, '#e3e4f2'],
    [0.54, '#f5e1cf'],
    [0.72, '#dce2ee'],
    [1.0, '#b5c2d9'],
  ],
  sunDiscPos: [95, 118, 70],
  sunDiscColor: 0xfff4d8,
};

export function buildMedievalCastleLevel(
  physics: PhysicsWorld,
  textures: ProceduralTextureSet,
  audio: ProceduralAudio,
  callbacks: PuzzleCallbacks,
  foundRelics: string[] = [],
): BuiltLevel {
  const b = new LevelBuildHelper(physics, textures, audio, callbacks);
  b.addSkyDome(CASTLE_LIGHTING.skyStops, CASTLE_LIGHTING.sunDiscPos, CASTLE_LIGHTING.sunDiscColor);

  const stoneBrickMat = b.track(
    new THREE.MeshStandardMaterial({
      color: 0xd9d2c5,
      map: textures.castleBrick,
      roughness: 0.86,
      metalness: 0.04,
    }),
  );
  const darkStoneMat = b.track(
    new THREE.MeshStandardMaterial({
      color: 0x9b978f,
      map: textures.castleBrick,
      roughness: 0.9,
    }),
  );
  const flagstoneMat = b.track(
    new THREE.MeshStandardMaterial({
      color: 0xe6dfd2,
      map: textures.limestoneTile,
      roughness: 0.82,
    }),
  );
  const bannerCoralMat = b.track(
    new THREE.MeshStandardMaterial({
      color: 0xd96153,
      roughness: 0.74,
      side: THREE.DoubleSide,
    }),
  );
  const royalGoldMat = b.track(
    new THREE.MeshStandardMaterial({
      color: 0xdcc07b,
      map: textures.brushedBrass,
      roughness: 0.34,
      metalness: 0.74,
    }),
  );
  const roofSlateMat = b.track(
    new THREE.MeshStandardMaterial({
      color: 0x4c5d7a,
      roughness: 0.68,
      metalness: 0.16,
    }),
  );
  const moatWaterMat = b.track(
    new THREE.MeshStandardMaterial({
      color: 0x5ca4b8,
      roughness: 0.25,
      metalness: 0.18,
    }),
  );
  const grassMat = b.track(
    new THREE.MeshStandardMaterial({
      color: 0x89b882,
      roughness: 0.92,
    }),
  );

  // Decorative Moat Water & Surrounding Green Rolling Valley Floor
  b.addVisualBox([120, 0.5, 130], [0, -3.2, -26], moatWaterMat, undefined, false);
  b.addVisualBox([140, 2.0, 36], [0, -2.5, 22], grassMat, undefined, false);

  // === STAGE 1: OUTER BRIDGEHEAD & MOAT DRAWBRIDGE PUZZLE ===
  b.addStaticBox({ size: [14, 3.2, 11], position: [0, -1.6, 7.0] }, flagstoneMat);

  // Stepped stone watch pedestal on east side holding the Drawbridge Winch Lever
  b.addStaticBox({ size: [3.4, 1.4, 3.4], position: [5.2, 0.7, 3.6] }, stoneBrickMat);
  b.puzzleSystem.addLever({
    id: 'mc-lever-drawbridge',
    signalId: 'mc_drawbridge',
    position: [5.2, 1.4, 3.6],
    rotationY: -Math.PI * 0.35,
    label: 'Gatehouse Drawbridge Winch',
  });

  // Oak Drawbridge spanning the Moat (z = 1.5 to -8.5)
  b.puzzleSystem.addMechanicalDoor({
    id: 'mc-drawbridge',
    size: [4.8, 0.55, 10.6],
    closedPosition: [0, -3.4, -3.5],
    openPosition: [0, -0.22, -3.5],
    requiredSignals: ['mc_drawbridge'],
    speed: 0.68,
    style: 'bridge',
    openToast: 'Castle Drawbridge lowered!',
  });

  // Secret Relic #1 on West Outer Moat Buttress
  b.addStaticBox({ size: [2.6, 3.0, 2.6], position: [-6.8, -1.2, 1.8] }, darkStoneMat);
  b.addStaticBox({ size: [2.6, 3.0, 3.2], position: [-8.8, -1.0, -3.2] }, darkStoneMat);
  b.puzzleSystem.addSecretRelic(
    { id: 'mc-relic-1', position: [-8.8, 1.65, -3.2], label: 'Moat Signet' },
    foundRelics.includes('mc-relic-1'),
  );

  // === GATEHOUSE ARCHWAY (z = -8.5) ===
  b.addStaticBox({ size: [7.6, 7.5, 2.6], position: [-6.8, 3.75, -9.2] }, stoneBrickMat);
  b.addStaticBox({ size: [7.6, 7.5, 2.6], position: [6.8, 3.75, -9.2] }, stoneBrickMat);
  b.addStaticBox({ size: [6.6, 2.4, 2.8], position: [0, 6.3, -9.2] }, stoneBrickMat);

  // Flanking Gatehouse Round Towers with conical slate roofs
  const addCastleTower = (tx: number, ty: number, tz: number, height: number, radius = 2.6) => {
    const towerGeo = b.track(new THREE.CylinderGeometry(radius, radius + 0.2, height, 14));
    const tower = new THREE.Mesh(towerGeo, stoneBrickMat);
    tower.position.set(tx, ty + height * 0.5, tz);
    tower.castShadow = true;
    tower.receiveShadow = true;
    b.root.add(tower);

    const roofGeo = b.track(new THREE.ConeGeometry(radius + 0.55, 3.8, 14));
    const roof = new THREE.Mesh(roofGeo, roofSlateMat);
    roof.position.set(tx, ty + height + 1.9, tz);
    roof.castShadow = true;
    b.root.add(roof);

    const spireGeo = b.track(new THREE.CylinderGeometry(0.06, 0.06, 1.5, 6));
    const spire = new THREE.Mesh(spireGeo, royalGoldMat);
    spire.position.set(tx, ty + height + 4.3, tz);
    b.root.add(spire);
  };

  addCastleTower(-12.2, 0, -9.2, 10.5, 2.6);
  addCastleTower(12.2, 0, -9.2, 10.5, 2.6);

  // === STAGE 2: OUTER BAILEY COURTYARD, PORTCULLIS & HIDDEN PASSAGE ===
  b.addStaticBox({ size: [26, 3.6, 38], position: [0, -1.8, -27.5] }, flagstoneMat);

  b.puzzleSystem.addCheckpoint({
    id: 'mc-cp-1',
    index: 1,
    position: [0, 0, -13.2],
    spawnPos: [0, 1.4, -13.2],
    spawnYaw: 0,
    label: 'Checkpoint 1 · Castle Courtyard',
  });

  // East Curtain Wall + Climbable Rampart Walkway (y = 3.2) holding Portcullis Lever
  b.addStaticBox({ size: [2.4, 6.2, 23.0], position: [12.8, 3.1, -21.0] }, stoneBrickMat);
  b.addStaticBox({ size: [3.2, 3.2, 14.0], position: [10.0, 1.6, -22.5] }, darkStoneMat);
  // Stepped stone stairs up to East Rampart
  b.addStaticBox({ size: [3.0, 1.1, 2.4], position: [10.0, 0.55, -12.4] }, stoneBrickMat);
  b.addStaticBox({ size: [3.0, 2.15, 1.9], position: [10.0, 1.075, -14.55] }, stoneBrickMat);

  b.puzzleSystem.addLever({
    id: 'mc-lever-portcullis',
    signalId: 'mc_rune_r',
    position: [10.0, 3.2, -25.2],
    rotationY: -Math.PI * 0.5,
    label: 'East Battlement Portcullis Lever',
  });

  // Left Courtyard Rune Pressure Plate
  b.puzzleSystem.addPressurePlate({
    id: 'mc-plate-rune',
    signalId: 'mc_rune_l',
    position: [-6.0, 0, -25.2],
    size: [2.3, 2.3],
    minMass: 2.0,
    label: 'Courtyard Rune Plate',
    accentColor: 0x7c3aed,
  });

  // Movable Stone Masonry Crates in Courtyard
  b.addDynamicObject({
    id: 'mc-stone-1',
    size: [0.96, 0.96, 0.96],
    initialPosition: [-5.8, 0.58, -19.2],
    color: 0xbcb5a8,
    mass: 2.6,
    kind: 'block',
  });
  b.addDynamicObject({
    id: 'mc-stone-2',
    size: [0.96, 0.96, 0.96],
    initialPosition: [4.6, 0.58, -19.6],
    color: 0xd4a472,
    mass: 2.2,
    kind: 'crate',
  });

  // === HIDDEN PASSAGE IN WEST COURTYARD WALL (Secret Route & Relic #2!) ===
  // West Curtain Wall split cleanly to create a secret 2.8m-wide interior corridor bypassing the Portcullis!
  b.addStaticBox({ size: [2.2, 6.2, 11.2], position: [-12.2, 3.1, -15.4] }, stoneBrickMat);
  b.addStaticBox({ size: [2.2, 3.2, 4.4], position: [-12.2, 4.6, -23.0] }, stoneBrickMat); // Lintel over secret entrance
  b.addStaticBox({ size: [2.2, 6.2, 9.6], position: [-12.2, 3.1, -29.8] }, stoneBrickMat);
  b.addStaticBox({ size: [2.2, 3.2, 4.0], position: [-12.2, 4.6, -36.6] }, stoneBrickMat); // Lintel over secret exit
  b.addStaticBox({ size: [2.2, 6.2, 9.0], position: [-12.2, 3.1, -43.0] }, stoneBrickMat);

  // Secret Tunnel Floor, Outer Backing Wall & Roof
  b.addStaticBox({ size: [4.4, 3.6, 20.0], position: [-15.2, -1.8, -30.0] }, darkStoneMat);
  b.addStaticBox({ size: [1.6, 6.2, 20.0], position: [-17.4, 3.1, -30.0] }, stoneBrickMat);
  b.addStaticBox({ size: [5.4, 1.0, 20.0], position: [-15.2, 5.7, -30.0] }, darkStoneMat);

  // Movable Wooden Crate concealing the Hidden Passage entrance (pull it aside to enter!)
  b.addDynamicObject({
    id: 'mc-secret-crate',
    size: [1.35, 1.35, 1.35],
    initialPosition: [-10.9, 0.72, -23.0],
    color: 0xc99460,
    mass: 2.1,
    kind: 'crate',
  });

  b.puzzleSystem.addSecretRelic(
    { id: 'mc-relic-2', position: [-15.0, 1.25, -29.8], label: 'Royal Crown Shard' },
    foundRelics.includes('mc-relic-2'),
  );

  // === INNER PORTCULLIS WALL & MECHANICAL GATE (z = -31.5) ===
  b.addStaticBox({ size: [9.0, 6.8, 1.8], position: [-7.5, 3.4, -31.5] }, stoneBrickMat);
  b.addStaticBox({ size: [9.0, 6.8, 1.8], position: [7.5, 3.4, -31.5] }, stoneBrickMat);
  b.addStaticBox({ size: [6.4, 2.2, 2.0], position: [0, 5.9, -31.5] }, stoneBrickMat);

  // Hanging royal banners flanking the portcullis
  b.addVisualBox([1.1, 3.2, 0.08], [-4.4, 4.2, -30.5], bannerCoralMat);
  b.addVisualBox([1.1, 3.2, 0.08], [4.4, 4.2, -30.5], bannerCoralMat);

  b.puzzleSystem.addMechanicalDoor({
    id: 'mc-portcullis',
    size: [5.8, 4.8, 0.72],
    closedPosition: [0, 2.4, -31.5],
    openPosition: [0, 7.2, -31.5],
    requiredSignals: ['mc_rune_l', 'mc_rune_r'],
    mode: 'all',
    speed: 0.65,
    style: 'portcullis',
    openToast: 'Inner Portcullis raised!',
  });

  // === STAGE 3: INNER KEEP LIFT & ROYAL THRONE TERRACE (y = 0 -> y = 5.4) ===
  b.puzzleSystem.addCheckpoint({
    id: 'mc-cp-2',
    index: 2,
    position: [0, 0, -35.8],
    spawnPos: [0, 1.4, -35.8],
    spawnYaw: 0,
    label: 'Checkpoint 2 · Inner Keep Court',
  });

  // Latching Keep Lift Plate (place nearby crate onto plate to power the Royal Lift!)
  b.puzzleSystem.addPressurePlate({
    id: 'mc-plate-keep',
    signalId: 'mc_keep_lift',
    position: [5.6, 0, -39.5],
    size: [2.2, 2.2],
    minMass: 1.8,
    latch: true,
    ignorePlayer: true,
    label: 'Royal Lift Seal',
    accentColor: 0xd97706,
  });

  b.addDynamicObject({
    id: 'mc-keep-crate',
    size: [0.96, 0.96, 0.96],
    initialPosition: [6.4, 0.58, -35.8],
    color: 0xbcb5a8,
    mass: 2.4,
    kind: 'block',
  });

  // Moving Royal Stone Lift Platform rising to the Royal Keep Terrace (y = 5.4)
  b.puzzleSystem.addMovingPlatform({
    id: 'mc-keep-lift',
    size: [4.4, 0.56, 4.2],
    pointA: [0, 0.35, -43.0],
    pointB: [0, 5.15, -43.0],
    period: 6.6,
    requiredSignals: ['mc_keep_lift'],
    style: 'castle',
  });

  // === ROYAL KEEP TERRACE (y = 5.4) ===
  b.addStaticBox({ size: [22, 5.4, 15], position: [0, 2.7, -53.2] }, stoneBrickMat);
  b.addVisualBox([21.2, 0.14, 14.2], [0, 5.42, -53.2], flagstoneMat, undefined, false);
  // Royal carpet runner leading to Finish Zone
  b.addVisualBox([3.4, 0.06, 11.2], [0, 5.51, -52.8], bannerCoralMat, undefined, false);

  addCastleTower(-11.4, 5.4, -59.5, 9.5, 2.8);
  addCastleTower(11.4, 5.4, -59.5, 9.5, 2.8);

  // Secret Relic #3 atop West Keep Battlement Turret (climb stone stair blocks on west side!)
  b.addStaticBox({ size: [2.8, 1.4, 2.8], position: [-8.8, 6.1, -48.5] }, darkStoneMat);
  b.addStaticBox({ size: [3.2, 2.4, 3.6], position: [-9.2, 6.6, -52.2] }, stoneBrickMat);
  b.puzzleSystem.addSecretRelic(
    { id: 'mc-relic-3', position: [-9.2, 9.0, -52.2], label: 'Knight Chalice' },
    foundRelics.includes('mc-relic-3'),
  );

  // Finish Zone: Royal Keep Beacon
  b.puzzleSystem.addFinishZone({
    position: [0, 5.45, -56.4],
    radius: 2.5,
    label: 'Royal Keep Sanctuary',
  });

  // === INSTANCED CASTLE BATTLEMENTS / MERLONS ===
  const merlonGeo = b.track(new THREE.BoxGeometry(1.15, 1.15, 1.15));
  const merlonCoords: [number, number, number][] = [];
  for (let z = -11; z >= -31; z -= 2.5) {
    merlonCoords.push([12.8, 6.75, z]);
    merlonCoords.push([-12.2, 6.75, z]);
  }
  for (let x = -10; x <= 10; x += 2.5) {
    merlonCoords.push([x, 6.55, -60.2]);
  }
  const merlons = new THREE.InstancedMesh(merlonGeo, stoneBrickMat, merlonCoords.length);
  merlons.castShadow = true;
  merlons.receiveShadow = true;
  const dummy = new THREE.Object3D();
  merlonCoords.forEach(([mx, my, mz], i) => {
    dummy.position.set(mx, my, mz);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    merlons.setMatrixAt(i, dummy.matrix);
  });
  merlons.instanceMatrix.needsUpdate = true;
  merlons.computeBoundingSphere();
  b.root.add(merlons);

  // Surrounding pastel countryside pines beyond the moat
  b.addInstancedPineTrees([
    [-19, -1.5, 12, 1.1],
    [19, -1.5, 11, 1.2],
    [-24, -1.5, 4, 1.05],
    [25, -1.5, 5, 1.15],
    [-26, -1.5, -24, 1.25],
    [26, -1.5, -24, 1.2],
    [-25, -1.5, -52, 1.3],
    [25, -1.5, -52, 1.22],
  ]);

  b.addDriftingClouds(10, 62, 26, 0xfffaf2);

  return b.finalize({
    spawnPos: [0, 1.6, 9.2],
    spawnYaw: 0,
    fallResetY: -10,
    minCameraY: -2.2,
    lighting: CASTLE_LIGHTING,
    defaultObjective: 'Lower the drawbridge, raise the inner portcullis (or find the hidden passage!), and ascend the Royal Keep.',
  });
}
