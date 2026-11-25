import * as THREE from 'three';
import type * as CANNON from 'cannon-es';
import type {
  DynamicBlockInstance,
  DynamicBlockSpec,
  ImpactEffectCallback,
  StaticBoxSpec,
} from '../types';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import type { ProceduralTextureSet } from '../textures';
import type { ProceduralAudio } from '../audio';
import { PuzzleSystem, type PuzzleCallbacks } from '../puzzles/PuzzleSystem';

export interface LevelLightingTheme {
  backgroundHex: number;
  fogHex: number;
  fogDensity: number;
  hemiSkyHex: number;
  hemiGroundHex: number;
  hemiIntensity: number;
  sunHex: number;
  sunIntensity: number;
  sunOffset: [number, number, number];
  rimHex: number;
  rimIntensity: number;
  skyStops: Array<[number, string]>;
  sunDiscPos?: [number, number, number];
  sunDiscColor?: number;
}

export interface BuiltLevel {
  root: THREE.Group;
  cameraColliders: THREE.Object3D[];
  dynamicBlocks: DynamicBlockInstance[];
  puzzleSystem: PuzzleSystem | null;
  spawnPos: [number, number, number];
  spawnYaw: number;
  fallResetY: number;
  minCameraY: number;
  lighting: LevelLightingTheme;
  defaultObjective: string;
  updateVisuals: (dt: number, elapsedSeconds: number) => void;
  resetDynamicBlocks: () => void;
  dispose: () => void;
}

export class LevelBuildHelper {
  public readonly root = new THREE.Group();
  public readonly cameraColliders: THREE.Object3D[] = [];
  public readonly dynamicBlocks: DynamicBlockInstance[] = [];
  public readonly puzzleSystem: PuzzleSystem;

  private readonly physics: PhysicsWorld;
  private readonly textures: ProceduralTextureSet;
  private readonly audio: ProceduralAudio;
  private readonly onImpactEffect?: ImpactEffectCallback;
  private readonly disposables: Array<{ dispose: () => void }> = [];
  private sharedStripeMat: THREE.MeshStandardMaterial | null = null;
  private sharedPlankCapMat: THREE.MeshStandardMaterial | null = null;
  private sharedBlockBandMat: THREE.MeshStandardMaterial | null = null;
  private cloudMesh: THREE.InstancedMesh | null = null;
  private readonly cloudDummy = new THREE.Object3D();
  private readonly cloudPuffSpecs: ReadonlyArray<[number, number, number, number]> = [
    [0, 0, 0, 4.4],
    [-3.5, -0.5, 0.5, 3.1],
    [3.4, -0.4, -0.5, 3.3],
    [1.1, 1.35, 0.3, 2.8],
  ];
  private readonly clouds: Array<{
    baseAngle: number;
    radius: number;
    speed: number;
    y: number;
  }> = [];
  private readonly customTickers: Array<(dt: number, elapsed: number) => void> = [];

  constructor(
    physics: PhysicsWorld,
    textures: ProceduralTextureSet,
    audio: ProceduralAudio,
    puzzleCallbacks: PuzzleCallbacks,
  ) {
    this.physics = physics;
    this.textures = textures;
    this.audio = audio;
    this.onImpactEffect = puzzleCallbacks.onImpactEffect;
    this.puzzleSystem = new PuzzleSystem(this.root, physics, textures, audio, puzzleCallbacks);
  }

  public track<T extends { dispose: () => void }>(item: T): T {
    this.disposables.push(item);
    return item;
  }

  public addTicker(fn: (dt: number, elapsed: number) => void): void {
    this.customTickers.push(fn);
  }

  public addSkyDome(stops: Array<[number, string]>, sunPos: [number, number, number] = [95, 118, 70], sunColor = 0xfff8e6): void {
    const skyTex = this.track(this.textures.createCustomSkyGradient(stops));
    const skyGeo = this.track(new THREE.SphereGeometry(280, 32, 24));
    const skyMat = this.track(
      new THREE.MeshBasicMaterial({
        map: skyTex,
        side: THREE.BackSide,
        fog: false,
        depthWrite: false,
      }),
    );
    const skyMesh = new THREE.Mesh(skyGeo, skyMat);
    skyMesh.renderOrder = -10;
    this.root.add(skyMesh);

    const sunGeo = this.track(new THREE.CircleGeometry(15, 28));
    const sunMat = this.track(
      new THREE.MeshBasicMaterial({
        color: sunColor,
        fog: false,
        transparent: true,
        opacity: 0.85,
      }),
    );
    const sunDisc = new THREE.Mesh(sunGeo, sunMat);
    sunDisc.position.set(...sunPos);
    sunDisc.lookAt(0, 0, 0);
    this.root.add(sunDisc);
  }

  public addStaticBox(
    spec: StaticBoxSpec,
    material: THREE.Material,
    registerCamera = true,
    castShadow = true,
  ): THREE.Mesh {
    const [w, h, d] = spec.size;
    const [x, y, z] = spec.position;
    const geo = this.track(new THREE.BoxGeometry(w, h, d));
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set(x, y, z);
    if (spec.rotationX) mesh.rotation.x = spec.rotationX;
    if (spec.rotationY) mesh.rotation.y = spec.rotationY;
    if (spec.rotationZ) mesh.rotation.z = spec.rotationZ;
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    mesh.updateMatrix();
    mesh.matrixAutoUpdate = false;
    this.root.add(mesh);

    this.physics.addStaticBox(spec);
    if (registerCamera) {
      this.cameraColliders.push(mesh);
    }
    return mesh;
  }

  public addVisualBox(
    size: [number, number, number],
    position: [number, number, number],
    material: THREE.Material,
    rotation?: [number, number, number],
    castShadow = true,
  ): THREE.Mesh {
    const geo = this.track(new THREE.BoxGeometry(...size));
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set(...position);
    if (rotation) mesh.rotation.set(...rotation);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    mesh.updateMatrix();
    mesh.matrixAutoUpdate = false;
    this.root.add(mesh);
    return mesh;
  }

  public addDynamicObject(spec: DynamicBlockSpec): DynamicBlockInstance {
    const kind = spec.kind ?? 'block';
    const [w, h, d] = spec.size;
    const group = new THREE.Group();
    let body: CANNON.Body;

    if (kind === 'boulder') {
      const radius = spec.radius ?? Math.min(w, h, d) * 0.5;
      const boulderGeo = this.track(new THREE.DodecahedronGeometry(radius, 1));
      const boulderMat = this.track(
        new THREE.MeshStandardMaterial({
          color: spec.color,
          map: this.textures.alpineStone,
          roughness: 0.9,
          metalness: 0.04,
          flatShading: true,
        }),
      );
      const coreMesh = new THREE.Mesh(boulderGeo, boulderMat);
      coreMesh.castShadow = true;
      coreMesh.receiveShadow = true;
      group.add(coreMesh);

      body = this.physics.addDynamicSphere(radius, spec.initialPosition, spec.mass, 0.22, 0.34);
    } else if (kind === 'metal-crate') {
      const coreGeo = this.track(new THREE.BoxGeometry(w, h, d));
      const coreMat = this.track(
        new THREE.MeshStandardMaterial({
          color: spec.color,
          map: this.textures.metalPanel,
          roughness: 0.42,
          metalness: 0.65,
        }),
      );
      const coreMesh = new THREE.Mesh(coreGeo, coreMat);
      coreMesh.castShadow = true;
      coreMesh.receiveShadow = true;
      group.add(coreMesh);

      const stripeGeo = this.track(new THREE.BoxGeometry(w + 0.02, h * 0.16, d + 0.02));
      if (!this.sharedStripeMat) {
        this.sharedStripeMat = this.track(
          new THREE.MeshStandardMaterial({
            map: this.textures.cautionStripe,
            roughness: 0.58,
            metalness: 0.2,
          }),
        );
      }
      const stripeMesh = new THREE.Mesh(stripeGeo, this.sharedStripeMat);
      group.add(stripeMesh);

      body = this.physics.addDynamicBox(spec.size, spec.initialPosition, spec.mass, spec.initialRotationY ?? 0);
    } else if (kind === 'crate') {
      const coreGeo = this.track(new THREE.BoxGeometry(w, h, d));
      const coreMat = this.track(
        new THREE.MeshStandardMaterial({
          color: spec.color,
          map: this.textures.woodCrate,
          roughness: 0.78,
          metalness: 0.04,
        }),
      );
      const coreMesh = new THREE.Mesh(coreGeo, coreMat);
      coreMesh.castShadow = true;
      coreMesh.receiveShadow = true;
      group.add(coreMesh);

      body = this.physics.addDynamicBox(spec.size, spec.initialPosition, spec.mass, spec.initialRotationY ?? 0);
    } else if (kind === 'plank') {
      const coreGeo = this.track(new THREE.BoxGeometry(w, h, d));
      const coreMat = this.track(
        new THREE.MeshStandardMaterial({
          color: spec.color,
          map: this.textures.woodPlank,
          roughness: 0.76,
          metalness: 0.04,
        }),
      );
      const coreMesh = new THREE.Mesh(coreGeo, coreMat);
      coreMesh.castShadow = true;
      coreMesh.receiveShadow = true;
      group.add(coreMesh);

      // End iron brackets along the plank's longest horizontal axis
      const alongZ = d > w;
      const capGeo = this.track(
        new THREE.BoxGeometry(
          alongZ ? w + 0.02 : 0.18,
          h + 0.02,
          alongZ ? 0.18 : d + 0.02,
        ),
      );
      if (!this.sharedPlankCapMat) {
        this.sharedPlankCapMat = this.track(
          new THREE.MeshStandardMaterial({
            color: 0x475569,
            roughness: 0.48,
            metalness: 0.55,
          }),
        );
      }
      const leftCap = new THREE.Mesh(capGeo, this.sharedPlankCapMat);
      const rightCap = new THREE.Mesh(capGeo, this.sharedPlankCapMat);
      if (alongZ) {
        leftCap.position.z = -d * 0.45;
        rightCap.position.z = d * 0.45;
      } else {
        leftCap.position.x = -w * 0.45;
        rightCap.position.x = w * 0.45;
      }
      group.add(leftCap, rightCap);

      body = this.physics.addDynamicBox(spec.size, spec.initialPosition, spec.mass, spec.initialRotationY ?? 0);
    } else {
      const coreGeo = this.track(new THREE.BoxGeometry(w, h, d));
      const coreMat = this.track(
        new THREE.MeshStandardMaterial({
          color: spec.color,
          map: this.textures.pastelWood,
          roughness: 0.66,
          metalness: 0.04,
        }),
      );
      const coreMesh = new THREE.Mesh(coreGeo, coreMat);
      coreMesh.castShadow = true;
      coreMesh.receiveShadow = true;
      group.add(coreMesh);

      const bandGeo = this.track(new THREE.BoxGeometry(w + 0.016, h * 0.14, d + 0.016));
      if (!this.sharedBlockBandMat) {
        this.sharedBlockBandMat = this.track(
          new THREE.MeshStandardMaterial({
            color: 0xf8f4ec,
            roughness: 0.78,
            metalness: 0.02,
          }),
        );
      }
      const bandMesh = new THREE.Mesh(bandGeo, this.sharedBlockBandMat);
      group.add(bandMesh);

      body = this.physics.addDynamicBox(spec.size, spec.initialPosition, spec.mass, spec.initialRotationY ?? 0);
    }

    group.position.set(...spec.initialPosition);
    if (spec.initialRotationY) {
      group.rotation.y = spec.initialRotationY;
    }
    this.root.add(group);

    let lastImpactMs = -1000;
    const impactPos = { x: 0, y: 0, z: 0 };
    body.addEventListener('collide', (event: { contact?: CANNON.ContactEquation }) => {
      const impact = event.contact ? Math.abs(event.contact.getImpactVelocityAlongNormal()) : 0;
      if (impact > 1.35) {
        const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
        if (nowMs - lastImpactMs < 110) return;
        lastImpactMs = nowMs;

        impactPos.x = body.position.x;
        impactPos.y = body.position.y - h * 0.35;
        impactPos.z = body.position.z;
        this.audio.playObjectCollision(kind, impact, spec.mass, impactPos);
        if (impact > 2.8 && this.onImpactEffect) {
          const effectKind =
            kind === 'metal-crate'
              ? 'metal'
              : kind === 'boulder'
                ? 'stone'
                : 'wood';
          const intensity = THREE.MathUtils.clamp((impact - 2.2) / 6.5, 0.25, 1.35);
          this.onImpactEffect(impactPos.x, impactPos.y, impactPos.z, intensity, effectKind);
        }
      }
    });

    const instance: DynamicBlockInstance = { spec, mesh: group, body };
    this.dynamicBlocks.push(instance);
    return instance;
  }

  public addInstancedPineTrees(
    trees: Array<[number, number, number, number]>,
    palette: number[] = [0x74a98c, 0x82b69a, 0x6b9e84, 0x8ec0a4],
  ): void {
    const count = trees.length;
    if (count === 0) return;

    const trunkGeo = this.track(new THREE.CylinderGeometry(0.22, 0.32, 1.7, 7));
    const trunkMat = this.track(new THREE.MeshStandardMaterial({ color: 0x8e725e, roughness: 0.9 }));
    const tier1Geo = this.track(new THREE.ConeGeometry(1.65, 2.8, 8));
    const tier2Geo = this.track(new THREE.ConeGeometry(1.22, 2.3, 8));
    const foliageMat = this.track(
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.85,
        flatShading: true,
      }),
    );

    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, count);
    const tier1 = new THREE.InstancedMesh(tier1Geo, foliageMat, count);
    const tier2 = new THREE.InstancedMesh(tier2Geo, foliageMat, count);
    trunks.castShadow = true;
    tier1.castShadow = true;
    tier1.receiveShadow = true;
    tier2.castShadow = true;
    tier2.receiveShadow = true;

    const dummy = new THREE.Object3D();
    const tint = new THREE.Color();

    for (let i = 0; i < count; i++) {
      const [x, y, z, scale] = trees[i];
      const rot = i * 1.17;

      dummy.position.set(x, y + 0.85 * scale, z);
      dummy.rotation.set(0, rot, 0);
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      trunks.setMatrixAt(i, dummy.matrix);

      dummy.position.set(x, y + 2.55 * scale, z);
      dummy.updateMatrix();
      tier1.setMatrixAt(i, dummy.matrix);

      dummy.position.set(x, y + 4.05 * scale, z);
      dummy.rotation.set(0, rot + 0.4, 0);
      dummy.updateMatrix();
      tier2.setMatrixAt(i, dummy.matrix);

      tint.setHex(palette[i % palette.length]);
      tier1.setColorAt(i, tint);
      tier2.setColorAt(i, tint.clone().offsetHSL(0, 0, 0.04));
    }

    trunks.instanceMatrix.needsUpdate = true;
    tier1.instanceMatrix.needsUpdate = true;
    tier2.instanceMatrix.needsUpdate = true;
    if (tier1.instanceColor) tier1.instanceColor.needsUpdate = true;
    if (tier2.instanceColor) tier2.instanceColor.needsUpdate = true;
    trunks.computeBoundingSphere();
    tier1.computeBoundingSphere();
    tier2.computeBoundingSphere();

    this.root.add(trunks, tier1, tier2);
  }

  public addInstancedRocks(
    rocks: Array<[number, number, number, number, number, number]>,
    palette: number[] = [0xbeb8ae, 0xa8aeb8, 0xcac3b7],
  ): void {
    const count = rocks.length;
    if (count === 0) return;

    const rockGeo = this.track(new THREE.DodecahedronGeometry(1, 0));
    const rockMat = this.track(
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.92,
        flatShading: true,
      }),
    );
    const mesh = new THREE.InstancedMesh(rockGeo, rockMat, count);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    const dummy = new THREE.Object3D();
    const tint = new THREE.Color();

    for (let i = 0; i < count; i++) {
      const [x, y, z, sx, sy, sz] = rocks[i];
      dummy.position.set(x, y, z);
      dummy.rotation.set(i * 0.45, i * 0.9, i * 0.3);
      dummy.scale.set(sx, sy, sz);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      tint.setHex(palette[i % palette.length]);
      mesh.setColorAt(i, tint);
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    this.root.add(mesh);
  }

  private syncClouds(elapsedSeconds: number): void {
    if (!this.cloudMesh || this.clouds.length === 0) return;
    const dummy = this.cloudDummy;
    const puffs = this.cloudPuffSpecs;
    let instanceIdx = 0;

    for (let i = 0; i < this.clouds.length; i++) {
      const cloud = this.clouds[i];
      const angle = cloud.baseAngle + elapsedSeconds * cloud.speed;
      const cx = Math.cos(angle) * cloud.radius;
      const cy = cloud.y + Math.sin(elapsedSeconds * 0.4 + cloud.baseAngle) * 0.55;
      const cz = Math.sin(angle) * cloud.radius;
      const yaw = Math.atan2(-cx, -cz);
      const cosY = Math.cos(yaw);
      const sinY = Math.sin(yaw);

      for (let p = 0; p < puffs.length; p++) {
        const [px, py, pz, s] = puffs[p];
        dummy.position.set(
          cx + px * cosY + pz * sinY,
          cy + py,
          cz - px * sinY + pz * cosY,
        );
        dummy.rotation.set(0, yaw, 0);
        dummy.scale.set(s * 1.32, s * 0.76, s * 0.95);
        dummy.updateMatrix();
        this.cloudMesh.setMatrixAt(instanceIdx++, dummy.matrix);
      }
    }
    this.cloudMesh.instanceMatrix.needsUpdate = true;
  }

  public addDriftingClouds(
    count = 10,
    minRadius = 56,
    baseY = 22,
    cloudColor = 0xffffff,
  ): void {
    const puffGeo = this.track(new THREE.SphereGeometry(1, 12, 10));
    const cloudMat = this.track(
      new THREE.MeshStandardMaterial({
        color: cloudColor,
        roughness: 0.96,
        metalness: 0,
      }),
    );

    const totalInstances = count * this.cloudPuffSpecs.length;
    const instanced = new THREE.InstancedMesh(puffGeo, cloudMat, totalInstances);
    instanced.frustumCulled = false;
    instanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.root.add(instanced);
    this.cloudMesh = instanced;

    for (let i = 0; i < count; i++) {
      const baseAngle = (i / count) * Math.PI * 2;
      const radius = minRadius + (i % 3) * 26;
      const y = baseY + (i % 4) * 5.8;
      this.clouds.push({
        baseAngle,
        radius,
        speed: 0.007 + (i % 3) * 0.0035,
        y,
      });
    }

    this.syncClouds(0);
  }

  public finalize(config: {
    spawnPos: [number, number, number];
    spawnYaw: number;
    fallResetY: number;
    minCameraY: number;
    lighting: LevelLightingTheme;
    defaultObjective: string;
  }): BuiltLevel {
    // Merge puzzle system dynamic blocks (such as physics rope handles) and camera colliders
    const allDynamic = [...this.dynamicBlocks, ...this.puzzleSystem.dynamicBlocks];
    const allCamColliders = [...this.cameraColliders, ...this.puzzleSystem.cameraColliders];

    return {
      root: this.root,
      cameraColliders: allCamColliders,
      dynamicBlocks: allDynamic,
      puzzleSystem: this.puzzleSystem,
      spawnPos: config.spawnPos,
      spawnYaw: config.spawnYaw,
      fallResetY: config.fallResetY,
      minCameraY: config.minCameraY,
      lighting: config.lighting,
      defaultObjective: config.defaultObjective,
      updateVisuals: (dt, elapsedSeconds) => {
        for (const item of allDynamic) {
          item.mesh.position.set(
            item.body.position.x,
            item.body.position.y,
            item.body.position.z,
          );
          item.mesh.quaternion.set(
            item.body.quaternion.x,
            item.body.quaternion.y,
            item.body.quaternion.z,
            item.body.quaternion.w,
          );
        }

        this.syncClouds(elapsedSeconds);

        for (const fn of this.customTickers) {
          fn(dt, elapsedSeconds);
        }
      },
      resetDynamicBlocks: () => {
        for (const item of this.dynamicBlocks) {
          const [x, y, z] = item.spec.initialPosition;
          item.body.position.set(x, y, z);
          item.body.velocity.set(0, 0, 0);
          item.body.angularVelocity.set(0, 0, 0);
          item.body.quaternion.setFromEuler(0, item.spec.initialRotationY ?? 0, 0);
          item.body.wakeUp();
        }
        this.puzzleSystem.resetDynamicRopes();
      },
      dispose: () => {
        this.puzzleSystem.dispose();
        for (const d of this.disposables) {
          d.dispose();
        }
        this.disposables.length = 0;
      },
    };
  }
}
