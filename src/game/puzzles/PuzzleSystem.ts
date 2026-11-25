import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import type {
  DynamicBlockInstance,
  ImpactEffectCallback,
  LevelId,
  LevelToastEvent,
} from '../types';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import type { ProceduralTextureSet } from '../textures';
import type { ProceduralAudio } from '../audio';
import type { PuzzleSyncSnapshot } from '../network/protocol';

// Reusable scratch helpers (zero GC per frame)
const _vecA = new THREE.Vector3();
const _vecB = new THREE.Vector3();
const _mid = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _quat = new THREE.Quaternion();

export interface PressurePlateConfig {
  id: string;
  signalId: string;
  position: [number, number, number];
  size?: [number, number];
  minMass?: number;
  latch?: boolean;
  ignorePlayer?: boolean;
  label?: string;
  accentColor?: number;
  /** When true, this cooperative partner plate only activates/renders in online multiplayer (2+ players) */
  multiplayerOnly?: boolean;
}

export interface LeverConfig {
  id: string;
  signalId: string;
  position: [number, number, number];
  rotationY?: number;
  label: string;
  initialOn?: boolean;
  accentColor?: number;
}

export interface MechanicalDoorConfig {
  id: string;
  size: [number, number, number];
  closedPosition: [number, number, number];
  openPosition: [number, number, number];
  rotationY?: number;
  requiredSignals: string[];
  /** Optional cooperative signal list active when 2+ players are in an online multiplayer room */
  coopRequiredSignals?: string[];
  mode?: 'all' | 'any';
  speed?: number;
  style?: 'stone-gate' | 'warehouse-door' | 'bridge' | 'portcullis' | 'crane-lift';
  color?: number;
  openToast?: string;
}

export interface MovingPlatformConfig {
  id: string;
  size: [number, number, number];
  pointA: [number, number, number];
  pointB: [number, number, number];
  period: number;
  phaseOffset?: number;
  requiredSignals?: string[];
  mode?: 'all' | 'any';
  style?: 'dream' | 'warehouse' | 'alpine' | 'construction' | 'castle';
}

export interface PhysicsRopeConfig {
  id: string;
  anchor: [number, number, number];
  length: number;
  segments?: number;
  handleMass?: number;
  handleColor?: number;
  initialSwingOffsetX?: number;
  initialSwingOffsetZ?: number;
}

export interface CheckpointConfig {
  id: string;
  index: number;
  position: [number, number, number];
  spawnPos: [number, number, number];
  spawnYaw?: number;
  radius?: number;
  label?: string;
}

export interface SecretRelicConfig {
  id: string;
  position: [number, number, number];
  label?: string;
}

export interface FinishZoneConfig {
  position: [number, number, number];
  radius?: number;
  label?: string;
}

interface PlateRuntime {
  config: PressurePlateConfig;
  group: THREE.Group;
  padMesh: THREE.Mesh;
  ringMat: THREE.MeshStandardMaterial;
  baseY: number;
  active: boolean;
  latched: boolean;
  depress: number;
}

interface LeverRuntime {
  config: LeverConfig;
  root: THREE.Group;
  armPivot: THREE.Group;
  beaconMat: THREE.MeshStandardMaterial;
  isOn: boolean;
  angle: number;
  worldPos: THREE.Vector3;
  cooldown: number;
}

interface DoorRuntime {
  config: MechanicalDoorConfig;
  group: THREE.Group;
  body: CANNON.Body;
  closedPos: THREE.Vector3;
  openPos: THREE.Vector3;
  progress: number;
  wasOpen: boolean;
  statusMat: THREE.MeshStandardMaterial | null;
}

interface PlatformRuntime {
  config: MovingPlatformConfig;
  group: THREE.Group;
  body: CANNON.Body;
  pointA: THREE.Vector3;
  pointB: THREE.Vector3;
  phase: number;
  active: boolean;
  prevPos: THREE.Vector3;
  currPos: THREE.Vector3;
  statusMat: THREE.MeshStandardMaterial | null;
}

interface RopeRuntime {
  config: PhysicsRopeConfig;
  anchorBody: CANNON.Body;
  linkBodies: CANNON.Body[];
  handleBlock: DynamicBlockInstance;
  segmentMeshes: THREE.Mesh[];
}

interface CheckpointRuntime {
  config: CheckpointConfig;
  crystalMesh: THREE.Mesh;
  crystalMat: THREE.MeshStandardMaterial;
  ringMat: THREE.MeshStandardMaterial;
  reached: boolean;
  worldPos: THREE.Vector3;
}

interface RelicRuntime {
  config: SecretRelicConfig;
  group: THREE.Group;
  collected: boolean;
  worldPos: THREE.Vector3;
}

interface FinishRuntime {
  config: FinishZoneConfig;
  root: THREE.Group;
  outerRing: THREE.Mesh;
  innerRing: THREE.Mesh;
  beaconOrb: THREE.Mesh;
  worldPos: THREE.Vector3;
  triggered: boolean;
}

export interface PuzzleCallbacks {
  onToast: (message: string, kind: LevelToastEvent['kind']) => void;
  onCheckpointReached: (
    index: number,
    spawnPos: [number, number, number],
    spawnYaw: number,
    label?: string,
  ) => void;
  onRelicFound: (relicId: string, label?: string) => void;
  onFinishReached: () => void;
  onLeverToggled?: (leverId: string, isOn: boolean, label: string) => void;
  onImpactEffect?: ImpactEffectCallback;
}

export class PuzzleSystem {
  public readonly root = new THREE.Group();
  public readonly cameraColliders: THREE.Object3D[] = [];
  public readonly dynamicBlocks: DynamicBlockInstance[] = [];

  private readonly physics: PhysicsWorld;
  private readonly textures: ProceduralTextureSet;
  private readonly audio: ProceduralAudio;
  private readonly callbacks: PuzzleCallbacks;

  private readonly signals = new Map<string, boolean>();
  private readonly plates: PlateRuntime[] = [];
  private readonly levers: LeverRuntime[] = [];
  private readonly doors: DoorRuntime[] = [];
  private readonly platforms: PlatformRuntime[] = [];
  private readonly ropes: RopeRuntime[] = [];
  private readonly checkpoints: CheckpointRuntime[] = [];
  private readonly relics: RelicRuntime[] = [];
  private finishZone: FinishRuntime | null = null;

  private readonly disposables: Array<{ dispose: () => void }> = [];
  private nearLeverLabel: string | null = null;
  private multiplayerCoopActive = false;

  constructor(
    parent: THREE.Object3D,
    physics: PhysicsWorld,
    textures: ProceduralTextureSet,
    audio: ProceduralAudio,
    callbacks: PuzzleCallbacks,
  ) {
    this.physics = physics;
    this.textures = textures;
    this.audio = audio;
    this.callbacks = callbacks;
    parent.add(this.root);
  }

  public addPressurePlate(config: PressurePlateConfig): void {
    const [w, d] = config.size ?? [2.1, 2.1];
    const [x, y, z] = config.position;
    const group = new THREE.Group();
    group.position.set(x, y, z);

    // Outer recessed bevel base frame
    const frameGeo = new THREE.BoxGeometry(w + 0.36, 0.14, d + 0.36);
    const frameMat = new THREE.MeshStandardMaterial({
      color: 0x3b4454,
      roughness: 0.52,
      metalness: 0.42,
    });
    const frameMesh = new THREE.Mesh(frameGeo, frameMat);
    frameMesh.position.y = 0.07;
    frameMesh.receiveShadow = true;
    frameMesh.castShadow = true;
    group.add(frameMesh);

    // Glowing indicator perimeter trim
    const ringGeo = new THREE.BoxGeometry(w + 0.18, 0.05, d + 0.18);
    const ringMat = new THREE.MeshStandardMaterial({
      color: config.accentColor ?? 0xf59e0b,
      emissive: config.accentColor ?? 0xd97706,
      emissiveIntensity: 0.55,
      roughness: 0.3,
      metalness: 0.25,
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.position.y = 0.135;
    group.add(ringMesh);

    // Depressible tactile pad
    const padGeo = new THREE.BoxGeometry(w, 0.14, d);
    const padMat = new THREE.MeshStandardMaterial({
      color: 0xe6dfd4,
      map: this.textures.metalPanel,
      roughness: 0.55,
      metalness: 0.25,
    });
    const padMesh = new THREE.Mesh(padGeo, padMat);
    padMesh.position.y = 0.18;
    padMesh.receiveShadow = true;
    padMesh.castShadow = true;
    group.add(padMesh);

    if (config.multiplayerOnly) {
      group.visible = this.multiplayerCoopActive;
    }
    this.root.add(group);
    this.disposables.push(frameGeo, frameMat, ringGeo, ringMat, padGeo, padMat);

    this.signals.set(config.signalId, false);
    this.plates.push({
      config,
      group,
      padMesh,
      ringMat,
      baseY: 0.18,
      active: false,
      latched: false,
      depress: 0,
    });
  }

  public addLever(config: LeverConfig): void {
    const [x, y, z] = config.position;
    const root = new THREE.Group();
    root.position.set(x, y, z);
    if (config.rotationY) {
      root.rotation.y = config.rotationY;
    }

    // Pedestal housing
    const baseGeo = new THREE.BoxGeometry(0.68, 0.72, 0.54);
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0x475569,
      roughness: 0.55,
      metalness: 0.45,
    });
    const baseMesh = new THREE.Mesh(baseGeo, baseMat);
    baseMesh.position.y = 0.36;
    baseMesh.castShadow = true;
    baseMesh.receiveShadow = true;
    root.add(baseMesh);

    // Top mounting collar
    const collarGeo = new THREE.CylinderGeometry(0.2, 0.24, 0.16, 14);
    const collarMat = new THREE.MeshStandardMaterial({
      color: 0xdcc07b,
      map: this.textures.brushedBrass,
      roughness: 0.32,
      metalness: 0.78,
    });
    const collarMesh = new THREE.Mesh(collarGeo, collarMat);
    collarMesh.position.y = 0.76;
    collarMesh.castShadow = true;
    root.add(collarMesh);

    // Status beacon crystal on front of pedestal
    const beaconGeo = new THREE.BoxGeometry(0.36, 0.12, 0.08);
    const beaconMat = new THREE.MeshStandardMaterial({
      color: config.initialOn ? 0x10b981 : 0xf59e0b,
      emissive: config.initialOn ? 0x10b981 : 0xd97706,
      emissiveIntensity: 0.7,
      roughness: 0.25,
    });
    const beaconMesh = new THREE.Mesh(beaconGeo, beaconMat);
    beaconMesh.position.set(0, 0.48, 0.28);
    root.add(beaconMesh);

    // Pivoting lever shaft & tactile handle orb
    const armPivot = new THREE.Group();
    armPivot.position.set(0, 0.8, 0);
    const startAngle = config.initialOn ? 0.62 : -0.62;
    armPivot.rotation.z = startAngle;

    const shaftGeo = new THREE.CylinderGeometry(0.048, 0.058, 0.82, 10);
    const shaftMesh = new THREE.Mesh(shaftGeo, collarMat);
    shaftMesh.position.y = 0.41;
    shaftMesh.castShadow = true;
    armPivot.add(shaftMesh);

    const knobGeo = new THREE.SphereGeometry(0.14, 16, 12);
    const knobMat = new THREE.MeshStandardMaterial({
      color: config.accentColor ?? 0xe76f51,
      roughness: 0.38,
      metalness: 0.18,
    });
    const knobMesh = new THREE.Mesh(knobGeo, knobMat);
    knobMesh.position.y = 0.84;
    knobMesh.castShadow = true;
    armPivot.add(knobMesh);

    root.add(armPivot);
    this.root.add(root);

    // Static pedestal collider so player walks around it naturally
    this.physics.addStaticBox({
      size: [0.68, 0.78, 0.54],
      position: [x, y + 0.39, z],
      rotationY: config.rotationY,
    });
    this.cameraColliders.push(baseMesh);

    this.disposables.push(
      baseGeo,
      baseMat,
      collarGeo,
      collarMat,
      beaconGeo,
      beaconMat,
      shaftGeo,
      knobGeo,
      knobMat,
    );

    const isOn = Boolean(config.initialOn);
    this.signals.set(config.signalId, isOn);
    this.levers.push({
      config,
      root,
      armPivot,
      beaconMat,
      isOn,
      angle: startAngle,
      worldPos: new THREE.Vector3(x, y + 0.9, z),
      cooldown: 0,
    });
  }

  public addMechanicalDoor(config: MechanicalDoorConfig): void {
    const [w, h, d] = config.size;
    const style = config.style ?? 'stone-gate';
    const group = new THREE.Group();
    group.position.set(...config.closedPosition);
    if (config.rotationY) {
      group.rotation.y = config.rotationY;
    }

    const coreGeo = new THREE.BoxGeometry(w, h, d);
    let coreMat: THREE.MeshStandardMaterial;

    if (style === 'warehouse-door') {
      coreMat = new THREE.MeshStandardMaterial({
        color: config.color ?? 0x7c8ea3,
        map: this.textures.metalPanel,
        roughness: 0.48,
        metalness: 0.52,
      });
    } else if (style === 'bridge') {
      coreMat = new THREE.MeshStandardMaterial({
        color: config.color ?? 0xd8a872,
        map: this.textures.woodPlank,
        roughness: 0.76,
        metalness: 0.05,
      });
    } else if (style === 'portcullis') {
      coreMat = new THREE.MeshStandardMaterial({
        color: config.color ?? 0x3b4252,
        map: this.textures.metalPanel,
        roughness: 0.42,
        metalness: 0.72,
      });
    } else if (style === 'crane-lift') {
      coreMat = new THREE.MeshStandardMaterial({
        color: config.color ?? 0xe8a838,
        map: this.textures.cautionStripe,
        roughness: 0.52,
        metalness: 0.32,
      });
    } else {
      coreMat = new THREE.MeshStandardMaterial({
        color: config.color ?? 0xd6cfc2,
        map: this.textures.castleBrick,
        roughness: 0.82,
        metalness: 0.04,
      });
    }

    const coreMesh = new THREE.Mesh(coreGeo, coreMat);
    coreMesh.castShadow = true;
    coreMesh.receiveShadow = true;
    group.add(coreMesh);
    this.cameraColliders.push(coreMesh);
    this.disposables.push(coreGeo, coreMat);

    // Architectural trim & glowing status bar
    const trimMat = new THREE.MeshStandardMaterial({
      color: 0xdcc07b,
      map: this.textures.brushedBrass,
      roughness: 0.34,
      metalness: 0.72,
    });
    const statusMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      emissive: 0xd97706,
      emissiveIntensity: 0.55,
      roughness: 0.3,
    });
    this.disposables.push(trimMat, statusMat);

    if (style === 'portcullis') {
      const barGeo = new THREE.CylinderGeometry(0.075, 0.075, h + 0.08, 8);
      const count = Math.max(3, Math.floor(w / 0.55));
      for (let i = 0; i < count; i++) {
        const bx = -w * 0.42 + (i / Math.max(1, count - 1)) * w * 0.84;
        const bar = new THREE.Mesh(barGeo, trimMat);
        bar.position.set(bx, 0, d * 0.5 + 0.03);
        group.add(bar);
      }
      this.disposables.push(barGeo);
    } else if (style === 'warehouse-door' || style === 'crane-lift') {
      const stripeGeo = new THREE.BoxGeometry(w + 0.04, 0.24, d + 0.04);
      const stripeMat = new THREE.MeshStandardMaterial({
        map: this.textures.cautionStripe,
        roughness: 0.62,
      });
      const stripe = new THREE.Mesh(stripeGeo, stripeMat);
      stripe.position.y = -h * 0.5 + 0.22;
      group.add(stripe);
      this.disposables.push(stripeGeo, stripeMat);
    }

    // Subtle status light bar on door/bridge edge
    const lightGeo = new THREE.BoxGeometry(Math.min(w * 0.45, 1.4), 0.14, d + 0.08);
    const lightMesh = new THREE.Mesh(lightGeo, statusMat);
    lightMesh.position.y = style === 'bridge' ? h * 0.5 + 0.02 : h * 0.32;
    group.add(lightMesh);
    this.disposables.push(lightGeo);

    this.root.add(group);
    const body = this.physics.addKinematicBox(config.size, config.closedPosition, config.rotationY ?? 0);

    this.doors.push({
      config,
      group,
      body,
      closedPos: new THREE.Vector3(...config.closedPosition),
      openPos: new THREE.Vector3(...config.openPosition),
      progress: 0,
      wasOpen: false,
      statusMat,
    });
  }

  public addMovingPlatform(config: MovingPlatformConfig): void {
    const [w, h, d] = config.size;
    const style = config.style ?? 'dream';
    const group = new THREE.Group();
    group.position.set(...config.pointA);

    const deckGeo = new THREE.BoxGeometry(w, h, d);
    const palette: Record<string, { color: number; map: THREE.CanvasTexture; metal: number }> = {
      dream: { color: 0xf0e4d2, map: this.textures.pastelWood, metal: 0.06 },
      warehouse: { color: 0x7a8a9e, map: this.textures.metalPanel, metal: 0.56 },
      alpine: { color: 0xc29361, map: this.textures.woodPlank, metal: 0.06 },
      construction: { color: 0xe6a637, map: this.textures.cautionStripe, metal: 0.34 },
      castle: { color: 0xbfb5a5, map: this.textures.castleBrick, metal: 0.08 },
    };
    const chosen = palette[style] ?? palette.dream;
    const deckMat = new THREE.MeshStandardMaterial({
      color: chosen.color,
      map: chosen.map,
      roughness: 0.62,
      metalness: chosen.metal,
    });
    const deckMesh = new THREE.Mesh(deckGeo, deckMat);
    deckMesh.castShadow = true;
    deckMesh.receiveShadow = true;
    group.add(deckMesh);
    this.cameraColliders.push(deckMesh);

    // Perimeter bumper rail + corner glow beacons
    const trimGeo = new THREE.BoxGeometry(w + 0.14, h * 0.45, d + 0.14);
    const trimMat = new THREE.MeshStandardMaterial({
      color: 0x3b4454,
      roughness: 0.45,
      metalness: 0.48,
    });
    const trimMesh = new THREE.Mesh(trimGeo, trimMat);
    trimMesh.position.y = -h * 0.25;
    group.add(trimMesh);

    const statusMat = new THREE.MeshStandardMaterial({
      color: config.requiredSignals?.length ? 0xf59e0b : 0x10b981,
      emissive: config.requiredSignals?.length ? 0xd97706 : 0x059669,
      emissiveIntensity: 0.55,
      roughness: 0.3,
    });
    const cornerGeo = new THREE.CylinderGeometry(0.11, 0.11, 0.18, 10);
    const offsets: [number, number][] = [
      [-w * 0.44, -d * 0.44],
      [w * 0.44, -d * 0.44],
      [-w * 0.44, d * 0.44],
      [w * 0.44, d * 0.44],
    ];
    for (const [ox, oz] of offsets) {
      const c = new THREE.Mesh(cornerGeo, statusMat);
      c.position.set(ox, h * 0.5 + 0.08, oz);
      group.add(c);
    }

    this.root.add(group);
    this.disposables.push(deckGeo, deckMat, trimGeo, trimMat, statusMat, cornerGeo);

    const body = this.physics.addKinematicBox(config.size, config.pointA, 0);
    const startPos = new THREE.Vector3(...config.pointA);

    this.platforms.push({
      config,
      group,
      body,
      pointA: startPos.clone(),
      pointB: new THREE.Vector3(...config.pointB),
      phase: config.phaseOffset ?? 0,
      active: !config.requiredSignals || config.requiredSignals.length === 0,
      prevPos: startPos.clone(),
      currPos: startPos.clone(),
      statusMat,
    });
  }

  public addPhysicsRope(config: PhysicsRopeConfig): DynamicBlockInstance {
    const segments = Math.max(4, config.segments ?? 7);
    const segLen = config.length / segments;
    const [ax, ay, az] = config.anchor;

    // Static top anchor body
    const anchorBody = new CANNON.Body({
      type: CANNON.Body.STATIC,
      position: new CANNON.Vec3(ax, ay, az),
    });
    this.physics.world.addBody(anchorBody);

    // Anchor pulley bracket visual
    const bracketGeo = new THREE.CylinderGeometry(0.24, 0.28, 0.24, 14);
    const bracketMat = new THREE.MeshStandardMaterial({
      color: 0x3b4456,
      roughness: 0.45,
      metalness: 0.65,
    });
    const bracketMesh = new THREE.Mesh(bracketGeo, bracketMat);
    bracketMesh.position.set(ax, ay, az);
    bracketMesh.castShadow = true;
    this.root.add(bracketMesh);
    this.disposables.push(bracketGeo, bracketMat);

    const ropeMat = new THREE.MeshStandardMaterial({
      color: 0xd6b07c,
      roughness: 0.88,
      metalness: 0.04,
    });
    const segGeo = new THREE.CylinderGeometry(0.055, 0.055, 1, 8);
    this.disposables.push(ropeMat, segGeo);

    const linkBodies: CANNON.Body[] = [];
    const segmentMeshes: THREE.Mesh[] = [];
    let prevBody: CANNON.Body = anchorBody;

    const swingX = config.initialSwingOffsetX ?? 0;
    const swingZ = config.initialSwingOffsetZ ?? 0;

    for (let i = 1; i < segments; i++) {
      const t = i / segments;
      const lx = ax + swingX * t;
      const ly = ay - segLen * i;
      const lz = az + swingZ * t;
      const linkBody = new CANNON.Body({
        mass: 0.35,
        shape: new CANNON.Sphere(0.08),
        position: new CANNON.Vec3(lx, ly, lz),
        linearDamping: 0.16,
        angularDamping: 0.35,
      });
      linkBody.collisionResponse = false; // Lightweight rope nodes won't snag player awkwardly
      this.physics.world.addBody(linkBody);
      this.physics.addDistanceConstraint(prevBody, linkBody, segLen, 1e5);
      linkBodies.push(linkBody);
      prevBody = linkBody;

      const mesh = new THREE.Mesh(segGeo, ropeMat);
      mesh.castShadow = true;
      this.root.add(mesh);
      segmentMeshes.push(mesh);
    }

    // Final segment mesh connecting last link to grabbable rope handle
    const lastSegMesh = new THREE.Mesh(segGeo, ropeMat);
    lastSegMesh.castShadow = true;
    this.root.add(lastSegMesh);
    segmentMeshes.push(lastSegMesh);

    // Bottom grabbable rope handle block (works natively with HandTargetingSystem & HandGrabSystem!)
    const handlePos: [number, number, number] = [ax + swingX, ay - config.length, az + swingZ];
    const handleGroup = new THREE.Group();
    handleGroup.position.set(...handlePos);

    const gripGeo = new THREE.BoxGeometry(0.54, 0.54, 0.54);
    const gripMat = new THREE.MeshStandardMaterial({
      color: config.handleColor ?? 0xf97316,
      map: this.textures.cautionStripe,
      roughness: 0.52,
      metalness: 0.18,
    });
    const gripMesh = new THREE.Mesh(gripGeo, gripMat);
    gripMesh.castShadow = true;
    gripMesh.receiveShadow = true;
    handleGroup.add(gripMesh);

    const ringGeo = new THREE.TorusGeometry(0.32, 0.05, 10, 20);
    const ringMat = new THREE.MeshStandardMaterial({
      color: 0xdcc07b,
      roughness: 0.32,
      metalness: 0.78,
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.position.y = 0.28;
    handleGroup.add(ringMesh);
    this.root.add(handleGroup);
    this.disposables.push(gripGeo, gripMat, ringGeo, ringMat);

    const handleBody = this.physics.addDynamicBox(
      [0.54, 0.54, 0.54],
      handlePos,
      config.handleMass ?? 1.9,
      0,
    );
    handleBody.linearDamping = 0.08; // Preserves playful rope pendulum swing!
    this.physics.addDistanceConstraint(prevBody, handleBody, segLen, 1e5);

    const handleBlock: DynamicBlockInstance = {
      spec: {
        id: config.id,
        size: [0.54, 0.54, 0.54],
        initialPosition: handlePos,
        color: config.handleColor ?? 0xf97316,
        mass: config.handleMass ?? 1.9,
        kind: 'rope-handle',
      },
      mesh: handleGroup,
      body: handleBody,
    };
    this.dynamicBlocks.push(handleBlock);

    this.ropes.push({
      config,
      anchorBody,
      linkBodies,
      handleBlock,
      segmentMeshes,
    });

    return handleBlock;
  }

  public addCheckpoint(config: CheckpointConfig): void {
    const [x, y, z] = config.position;
    const group = new THREE.Group();
    group.position.set(x, y, z);

    // Floor stone ring
    const baseGeo = new THREE.CylinderGeometry(1.15, 1.32, 0.14, 24);
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0xe8e2d7,
      map: this.textures.limestoneTile,
      roughness: 0.75,
      metalness: 0.05,
    });
    const baseMesh = new THREE.Mesh(baseGeo, baseMat);
    baseMesh.position.y = 0.07;
    baseMesh.receiveShadow = true;
    group.add(baseMesh);

    const ringGeo = new THREE.TorusGeometry(1.06, 0.06, 10, 28);
    ringGeo.rotateX(Math.PI / 2);
    const ringMat = new THREE.MeshStandardMaterial({
      color: 0x60a5fa,
      emissive: 0x2563eb,
      emissiveIntensity: 0.45,
      roughness: 0.28,
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.position.y = 0.15;
    group.add(ringMesh);

    // Side beacon pillar + floating crystal
    const postGeo = new THREE.CylinderGeometry(0.14, 0.2, 1.75, 10);
    const postMat = new THREE.MeshStandardMaterial({
      color: 0x475569,
      roughness: 0.5,
      metalness: 0.45,
    });
    const postMesh = new THREE.Mesh(postGeo, postMat);
    postMesh.position.set(1.25, 0.88, 0);
    postMesh.castShadow = true;
    group.add(postMesh);

    const crystalGeo = new THREE.OctahedronGeometry(0.28, 0);
    const crystalMat = new THREE.MeshStandardMaterial({
      color: 0x93c5fd,
      emissive: 0x2563eb,
      emissiveIntensity: 0.55,
      roughness: 0.2,
      metalness: 0.25,
    });
    const crystalMesh = new THREE.Mesh(crystalGeo, crystalMat);
    crystalMesh.position.set(1.25, 2.2, 0);
    crystalMesh.castShadow = true;
    group.add(crystalMesh);

    this.root.add(group);
    this.disposables.push(baseGeo, baseMat, ringGeo, ringMat, postGeo, postMat, crystalGeo, crystalMat);

    this.checkpoints.push({
      config,
      crystalMesh,
      crystalMat,
      ringMat,
      reached: false,
      worldPos: new THREE.Vector3(x, y + 0.9, z),
    });
  }

  public addSecretRelic(config: SecretRelicConfig, alreadyFound = false): void {
    const [x, y, z] = config.position;
    const group = new THREE.Group();
    group.position.set(x, y, z);

    const gemGeo = new THREE.OctahedronGeometry(0.38, 0);
    const gemMat = new THREE.MeshStandardMaterial({
      color: 0xfde047,
      emissive: 0xf59e0b,
      emissiveIntensity: 0.65,
      roughness: 0.18,
      metalness: 0.72,
    });
    const gemMesh = new THREE.Mesh(gemGeo, gemMat);
    gemMesh.castShadow = true;
    group.add(gemMesh);

    const haloGeo = new THREE.TorusGeometry(0.54, 0.036, 10, 24);
    const haloMat = new THREE.MeshStandardMaterial({
      color: 0xfef08a,
      emissive: 0xd97706,
      emissiveIntensity: 0.5,
      roughness: 0.25,
    });
    const haloMesh = new THREE.Mesh(haloGeo, haloMat);
    group.add(haloMesh);

    group.visible = !alreadyFound;
    this.root.add(group);
    this.disposables.push(gemGeo, gemMat, haloGeo, haloMat);

    this.relics.push({
      config,
      group,
      collected: alreadyFound,
      worldPos: new THREE.Vector3(x, y, z),
    });
  }

  public addFinishZone(config: FinishZoneConfig): void {
    const [x, y, z] = config.position;
    const radius = config.radius ?? 2.35;
    const root = new THREE.Group();
    root.position.set(x, y, z);

    // Grand octagonal finish plinth
    const plinthGeo = new THREE.CylinderGeometry(radius, radius + 0.35, 0.28, 16);
    const plinthMat = new THREE.MeshStandardMaterial({
      color: 0xf8f3e8,
      map: this.textures.limestoneTile,
      roughness: 0.65,
      metalness: 0.08,
    });
    const plinthMesh = new THREE.Mesh(plinthGeo, plinthMat);
    plinthMesh.position.y = 0.14;
    plinthMesh.receiveShadow = true;
    root.add(plinthMesh);

    // Rotating golden outer & inner portal rings
    const outerGeo = new THREE.TorusGeometry(radius * 0.86, 0.09, 12, 40);
    outerGeo.rotateX(Math.PI / 2);
    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xfbbf24,
      emissive: 0xd97706,
      emissiveIntensity: 0.62,
      roughness: 0.24,
      metalness: 0.78,
    });
    const outerRing = new THREE.Mesh(outerGeo, goldMat);
    outerRing.position.y = 0.34;
    root.add(outerRing);

    const innerGeo = new THREE.TorusGeometry(radius * 0.56, 0.06, 10, 32);
    const emeraldMat = new THREE.MeshStandardMaterial({
      color: 0x34d399,
      emissive: 0x059669,
      emissiveIntensity: 0.75,
      roughness: 0.2,
      metalness: 0.35,
    });
    const innerRing = new THREE.Mesh(innerGeo, emeraldMat);
    innerRing.position.y = 2.05;
    root.add(innerRing);

    const orbGeo = new THREE.OctahedronGeometry(0.45, 0);
    const beaconOrb = new THREE.Mesh(orbGeo, goldMat);
    beaconOrb.position.y = 2.05;
    beaconOrb.castShadow = true;
    root.add(beaconOrb);

    // 4 decorative corner goal pillars
    const pillarGeo = new THREE.CylinderGeometry(0.14, 0.2, 2.35, 10);
    const pillarMat = new THREE.MeshStandardMaterial({
      color: 0xdcc07b,
      map: this.textures.brushedBrass,
      roughness: 0.32,
      metalness: 0.72,
    });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const p = new THREE.Mesh(pillarGeo, pillarMat);
      p.position.set(Math.cos(a) * (radius * 0.85), 1.18, Math.sin(a) * (radius * 0.85));
      p.castShadow = true;
      root.add(p);
    }

    this.root.add(root);
    this.disposables.push(
      plinthGeo,
      plinthMat,
      outerGeo,
      goldMat,
      innerGeo,
      emeraldMat,
      orbGeo,
      pillarGeo,
      pillarMat,
    );

    this.finishZone = {
      config,
      root,
      outerRing,
      innerRing,
      beaconOrb,
      worldPos: new THREE.Vector3(x, y + 1.0, z),
      triggered: false,
    };
  }

  private evaluateSignalCondition(requiredSignals?: string[], mode: 'all' | 'any' = 'all'): boolean {
    if (!requiredSignals || requiredSignals.length === 0) return true;
    if (mode === 'any') {
      return requiredSignals.some((id) => Boolean(this.signals.get(id)));
    }
    return requiredSignals.every((id) => Boolean(this.signals.get(id)));
  }

  public tryToggleNearestLever(playerPos: THREE.Vector3): boolean {
    let best: LeverRuntime | null = null;
    let bestDist = 2.85;
    for (const lever of this.levers) {
      if (lever.cooldown > 0) continue;
      const dist = playerPos.distanceTo(lever.worldPos);
      if (dist < bestDist) {
        bestDist = dist;
        best = lever;
      }
    }
    if (!best) return false;
    this.flipLever(best);
    return true;
  }

  private flipLever(lever: LeverRuntime, emitNetwork = true): void {
    lever.isOn = !lever.isOn;
    lever.cooldown = 0.4;
    this.signals.set(lever.config.signalId, lever.isOn);
    lever.beaconMat.color.setHex(lever.isOn ? 0x10b981 : 0xf59e0b);
    lever.beaconMat.emissive.setHex(lever.isOn ? 0x059669 : 0xd97706);
    this.audio.playLeverToggle(lever.isOn, {
      x: lever.worldPos.x,
      y: lever.worldPos.y,
      z: lever.worldPos.z,
    });
    this.callbacks.onToast(
      `${lever.config.label} ${lever.isOn ? 'activated' : 'reset'}`,
      'puzzle',
    );
    if (emitNetwork) {
      this.callbacks.onLeverToggled?.(lever.config.id, lever.isOn, lever.config.label);
    }
  }

  public setMultiplayerCoopActive(active: boolean): void {
    if (this.multiplayerCoopActive === active) return;
    this.multiplayerCoopActive = active;
    for (const plate of this.plates) {
      if (plate.config.multiplayerOnly) {
        plate.group.visible = active;
        if (!active) {
          plate.active = false;
          plate.latched = false;
          this.signals.set(plate.config.signalId, false);
        }
      }
    }
  }

  public applyRemoteLeverToggle(leverId: string, isOn: boolean, actorName?: string): void {
    const lever = this.levers.find((l) => l.config.id === leverId);
    if (!lever || lever.isOn === isOn) return;
    lever.isOn = isOn;
    lever.cooldown = 0.25;
    this.signals.set(lever.config.signalId, isOn);
    lever.beaconMat.color.setHex(isOn ? 0x10b981 : 0xf59e0b);
    lever.beaconMat.emissive.setHex(isOn ? 0x059669 : 0xd97706);
    this.audio.playLeverToggle(isOn, {
      x: lever.worldPos.x,
      y: lever.worldPos.y,
      z: lever.worldPos.z,
    });
    const who = actorName ? `${actorName}: ` : '';
    this.callbacks.onToast(
      `${who}${lever.config.label} ${isOn ? 'activated' : 'reset'}`,
      'puzzle',
    );
  }

  public getNetworkSnapshot(
    levelId: LevelId,
    checkpointIndex: number,
    checkpointSpawnPos: [number, number, number] | null,
    checkpointSpawnYaw: number,
    completed: boolean,
  ): PuzzleSyncSnapshot {
    return {
      levelId,
      serverTime: Date.now(),
      levers: this.levers.map((l) => ({ id: l.config.id, isOn: l.isOn })),
      plates: this.plates.map((p) => ({
        id: p.config.id,
        active: p.active,
        latched: p.latched,
      })),
      doors: this.doors.map((d) => ({
        id: d.config.id,
        progress: Math.round(d.progress * 1000) / 1000,
        wasOpen: d.wasOpen,
      })),
      platforms: this.platforms.map((p) => ({
        id: p.config.id,
        phase: Math.round(p.phase * 1000) / 1000,
        active: p.active,
      })),
      checkpointIndex,
      checkpointSpawnPos,
      checkpointSpawnYaw,
      collectedRelics: this.getRelicsFoundIds(),
      completed,
    };
  }

  public applyNetworkSnapshot(
    snapshot: PuzzleSyncSnapshot,
    isHost: boolean,
  ): {
    newlyCollectedRelics: string[];
    newlyCompleted: boolean;
  } {
    // 1. Levers (always apply from authoritative room snapshot)
    for (const syncedLever of snapshot.levers) {
      const lever = this.levers.find((l) => l.config.id === syncedLever.id);
      if (!lever) continue;
      if (lever.isOn !== syncedLever.isOn) {
        lever.isOn = syncedLever.isOn;
        this.signals.set(lever.config.signalId, lever.isOn);
        lever.beaconMat.color.setHex(lever.isOn ? 0x10b981 : 0xf59e0b);
        lever.beaconMat.emissive.setHex(lever.isOn ? 0x059669 : 0xd97706);
      }
    }

    // 2. Guests sync authoritative plates, doors & moving platforms from host snapshot
    if (!isHost) {
      for (const syncedPlate of snapshot.plates) {
        const plate = this.plates.find((p) => p.config.id === syncedPlate.id);
        if (!plate) continue;
        if (plate.active !== syncedPlate.active) {
          this.audio.playPlatePress(syncedPlate.active, {
            x: plate.config.position[0],
            y: plate.config.position[1],
            z: plate.config.position[2],
          });
        }
        plate.active = syncedPlate.active;
        plate.latched = syncedPlate.latched;
        this.signals.set(plate.config.signalId, syncedPlate.active);
      }

      for (const syncedDoor of snapshot.doors) {
        const door = this.doors.find((d) => d.config.id === syncedDoor.id);
        if (!door) continue;
        if (syncedDoor.wasOpen && !door.wasOpen) {
          this.audio.playDoorMovement(true, {
            x: door.body.position.x,
            y: door.body.position.y,
            z: door.body.position.z,
          });
          if (door.config.openToast) {
            this.callbacks.onToast(door.config.openToast, 'puzzle');
          }
        } else if (!syncedDoor.wasOpen && door.wasOpen) {
          this.audio.playDoorMovement(false, {
            x: door.body.position.x,
            y: door.body.position.y,
            z: door.body.position.z,
          });
        }
        door.wasOpen = syncedDoor.wasOpen;
        // Gently blend progress toward host value so doors slide smoothly with zero stutter
        door.progress =
          Math.abs(door.progress - syncedDoor.progress) > 0.35
            ? syncedDoor.progress
            : THREE.MathUtils.lerp(door.progress, syncedDoor.progress, 0.45);
      }

      for (const syncedPlat of snapshot.platforms) {
        const plat = this.platforms.find((p) => p.config.id === syncedPlat.id);
        if (!plat) continue;
        plat.active = syncedPlat.active;
        const phaseDiff = syncedPlat.phase - plat.phase;
        plat.phase =
          Math.abs(phaseDiff) > 1.2
            ? syncedPlat.phase
            : plat.phase + phaseDiff * 0.35;
      }
    }

    // 3. Shared Checkpoints
    for (const cp of this.checkpoints) {
      if (cp.config.index <= snapshot.checkpointIndex && !cp.reached) {
        cp.reached = true;
        cp.crystalMat.color.setHex(0x6ee7b7);
        cp.crystalMat.emissive.setHex(0x059669);
        cp.ringMat.color.setHex(0x34d399);
        cp.ringMat.emissive.setHex(0x059669);
      }
    }

    // 4. Shared Relics
    const newlyCollectedRelics: string[] = [];
    for (const relicId of snapshot.collectedRelics) {
      const relic = this.relics.find((r) => r.config.id === relicId);
      if (relic && !relic.collected) {
        relic.collected = true;
        relic.group.visible = false;
        newlyCollectedRelics.push(relicId);
      }
    }

    // 5. Shared Completion
    let newlyCompleted = false;
    if (snapshot.completed && this.finishZone && !this.finishZone.triggered) {
      this.finishZone.triggered = true;
      newlyCompleted = true;
    }

    return { newlyCollectedRelics, newlyCompleted };
  }

  public getNearLeverLabel(): string | null {
    return this.nearLeverLabel;
  }

  /**
   * Called inside the 60 Hz Cannon-es physics substep so kinematic doors & moving platforms
   * carry the player and blocks with exact analytical velocities.
   */
  public stepPhysics(
    fixedDt: number,
    playerBody: CANNON.Body,
    allDynamicBlocks: DynamicBlockInstance[],
    remotePlayerPositions: THREE.Vector3[] = [],
    isGuestRemoteSimulated = false,
  ): void {
    // 1. Evaluate weight-activated Pressure Plates (single-player + cooperative multi-player)
    if (!isGuestRemoteSimulated) {
      for (const plate of this.plates) {
        if (plate.config.multiplayerOnly && !this.multiplayerCoopActive) {
          continue;
        }
        const [px, py, pz] = plate.config.position;
        const [w, d] = plate.config.size ?? [2.1, 2.1];
        const halfW = w * 0.5 + 0.22;
        const halfD = d * 0.5 + 0.22;
        const minMass = plate.config.minMass ?? 1.5;

        let totalMass = 0;

        // Local player standing on plate (unless this plate requires an object/boulder)
        if (
          !plate.config.ignorePlayer &&
          Math.abs(playerBody.position.x - px) <= halfW &&
          Math.abs(playerBody.position.z - pz) <= halfD &&
          playerBody.position.y >= py - 0.1 &&
          playerBody.position.y <= py + 1.55
        ) {
          totalMass += playerBody.mass;
        }

        // Cooperative remote players standing on the same or separate plates
        if (!plate.config.ignorePlayer && remotePlayerPositions.length > 0) {
          for (const rp of remotePlayerPositions) {
            if (
              Math.abs(rp.x - px) <= halfW + 0.12 &&
              Math.abs(rp.z - pz) <= halfD + 0.12 &&
              rp.y >= py - 0.15 &&
              rp.y <= py + 1.75
            ) {
              totalMass += playerBody.mass;
            }
          }
        }

        // Dynamic blocks / crates / boulders resting on plate
        for (const blk of allDynamicBlocks) {
          const bp = blk.body.position;
          if (
            Math.abs(bp.x - px) <= halfW + 0.18 &&
            Math.abs(bp.z - pz) <= halfD + 0.18 &&
            bp.y >= py - 0.15 &&
            bp.y <= py + 2.6
          ) {
            totalMass += blk.body.mass;
          }
        }

        const pressedNow = plate.latched || totalMass >= minMass;
        if (pressedNow && plate.config.latch) {
          plate.latched = true;
        }

        if (pressedNow !== plate.active) {
          plate.active = pressedNow;
          this.signals.set(plate.config.signalId, pressedNow);
          this.audio.playPlatePress(pressedNow, { x: px, y: py, z: pz });
          if (pressedNow && plate.config.label) {
            this.callbacks.onToast(`${plate.config.label} engaged`, 'puzzle');
          }
        }
      }
    }

    // 2. Step Mechanical Doors / Drawbridges / Retractable Bridges
    for (const door of this.doors) {
      const prevProg = door.progress;
      if (!isGuestRemoteSimulated) {
        const requiredSignals =
          this.multiplayerCoopActive && door.config.coopRequiredSignals
            ? door.config.coopRequiredSignals
            : door.config.requiredSignals;
        const shouldOpen = this.evaluateSignalCondition(
          requiredSignals,
          door.config.mode ?? 'all',
        );
        if (shouldOpen && !door.wasOpen) {
          door.wasOpen = true;
          this.audio.playDoorMovement(true, {
            x: door.body.position.x,
            y: door.body.position.y,
            z: door.body.position.z,
          });
          if (door.config.openToast) {
            this.callbacks.onToast(door.config.openToast, 'puzzle');
          }
        } else if (!shouldOpen && door.wasOpen) {
          door.wasOpen = false;
          this.audio.playDoorMovement(false, {
            x: door.body.position.x,
            y: door.body.position.y,
            z: door.body.position.z,
          });
        }

        const target = shouldOpen ? 1 : 0;
        const speed = door.config.speed ?? 0.65;
        if (door.progress < target) {
          door.progress = Math.min(target, door.progress + speed * fixedDt);
        } else if (door.progress > target) {
          door.progress = Math.max(target, door.progress - speed * fixedDt);
        }
      } else {
        // Guest predicts smooth motion between host sync ticks using wasOpen target
        const target = door.wasOpen ? 1 : 0;
        const speed = door.config.speed ?? 0.65;
        if (door.progress < target) {
          door.progress = Math.min(target, door.progress + speed * fixedDt);
        } else if (door.progress > target) {
          door.progress = Math.max(target, door.progress - speed * fixedDt);
        }
      }

      const prevX = door.body.position.x;
      const prevY = door.body.position.y;
      const prevZ = door.body.position.z;

      // Smoothstep easing for heavy mechanical feel
      const s = door.progress * door.progress * (3 - 2 * door.progress);
      const nx = THREE.MathUtils.lerp(door.closedPos.x, door.openPos.x, s);
      const ny = THREE.MathUtils.lerp(door.closedPos.y, door.openPos.y, s);
      const nz = THREE.MathUtils.lerp(door.closedPos.z, door.openPos.z, s);

      door.body.position.set(nx, ny, nz);
      if (Math.abs(door.progress - prevProg) > 1e-6) {
        door.body.velocity.set((nx - prevX) / fixedDt, (ny - prevY) / fixedDt, (nz - prevZ) / fixedDt);
      } else {
        door.body.velocity.set(0, 0, 0);
      }
    }

    // 3. Step Moving Platforms (oscillating lifts / cable cars / gantries)
    for (const plat of this.platforms) {
      if (!isGuestRemoteSimulated) {
        const enabled = this.evaluateSignalCondition(
          plat.config.requiredSignals,
          plat.config.mode ?? 'all',
        );
        plat.active = enabled;
      }
      if (plat.active) {
        plat.phase += (Math.PI * 2 * fixedDt) / Math.max(2, plat.config.period);
      }
      const blend = 0.5 - 0.5 * Math.cos(plat.phase);
      plat.prevPos.copy(plat.currPos);
      plat.currPos.lerpVectors(plat.pointA, plat.pointB, blend);

      const vx = (plat.currPos.x - plat.prevPos.x) / fixedDt;
      const vy = (plat.currPos.y - plat.prevPos.y) / fixedDt;
      const vz = (plat.currPos.z - plat.prevPos.z) / fixedDt;

      plat.body.position.set(plat.currPos.x, plat.currPos.y, plat.currPos.z);
      plat.body.velocity.set(vx, vy, vz);
    }
  }

  public updateVisuals(
    dt: number,
    elapsedSeconds: number,
    playerPos: THREE.Vector3,
    leftHandGrabAttempt: boolean,
    rightHandGrabAttempt: boolean,
  ): void {
    // 1. Pressure plates visual depression & glow
    for (const plate of this.plates) {
      const targetDepress = plate.active ? 0.065 : 0;
      plate.depress = THREE.MathUtils.damp(plate.depress, targetDepress, 14, dt);
      plate.padMesh.position.y = plate.baseY - plate.depress;
      plate.ringMat.color.setHex(plate.active ? 0x10b981 : (plate.config.accentColor ?? 0xf59e0b));
      plate.ringMat.emissive.setHex(plate.active ? 0x059669 : 0xd97706);
    }

    // 2. Levers visual smooth swing + proximity prompt + hand-grab activation
    let closestLeverLabel: string | null = null;
    let closestLeverDist = 2.85;
    for (const lever of this.levers) {
      if (lever.cooldown > 0) {
        lever.cooldown = Math.max(0, lever.cooldown - dt);
      }
      const targetAngle = lever.isOn ? 0.62 : -0.62;
      lever.angle = THREE.MathUtils.damp(lever.angle, targetAngle, 12, dt);
      lever.armPivot.rotation.z = lever.angle;

      const dist = playerPos.distanceTo(lever.worldPos);
      if (dist < closestLeverDist) {
        closestLeverDist = dist;
        closestLeverLabel = lever.config.label;
        if (lever.cooldown <= 0 && (leftHandGrabAttempt || rightHandGrabAttempt) && dist < 2.2) {
          this.flipLever(lever);
        }
      }
    }
    this.nearLeverLabel = closestLeverLabel;

    // 3. Doors visual sync
    for (const door of this.doors) {
      door.group.position.set(door.body.position.x, door.body.position.y, door.body.position.z);
      if (door.statusMat) {
        const open = door.progress > 0.65;
        door.statusMat.color.setHex(open ? 0x10b981 : 0xf59e0b);
        door.statusMat.emissive.setHex(open ? 0x059669 : 0xd97706);
      }
    }

    // 4. Moving platforms visual sync
    for (const plat of this.platforms) {
      plat.group.position.set(plat.body.position.x, plat.body.position.y, plat.body.position.z);
      if (plat.statusMat) {
        plat.statusMat.color.setHex(plat.active ? 0x10b981 : 0xf59e0b);
        plat.statusMat.emissive.setHex(plat.active ? 0x059669 : 0xd97706);
      }
    }

    // 5. Physics ropes visual segment alignment
    for (const rope of this.ropes) {
      const chainBodies: CANNON.Body[] = [
        rope.anchorBody,
        ...rope.linkBodies,
        rope.handleBlock.body,
      ];
      for (let i = 0; i < rope.segmentMeshes.length; i++) {
        const bA = chainBodies[i];
        const bB = chainBodies[i + 1];
        if (!bA || !bB) continue;
        _vecA.set(bA.position.x, bA.position.y, bA.position.z);
        _vecB.set(bB.position.x, bB.position.y, bB.position.z);
        _mid.addVectors(_vecA, _vecB).multiplyScalar(0.5);
        _dir.subVectors(_vecB, _vecA);
        const len = Math.max(0.05, _dir.length());
        _dir.divideScalar(len);
        _quat.setFromUnitVectors(_up, _dir);

        const mesh = rope.segmentMeshes[i];
        mesh.position.copy(_mid);
        mesh.quaternion.copy(_quat);
        mesh.scale.set(1, len, 1);
      }
    }

    // 6. Checkpoints proximity & beacon spin
    for (const cp of this.checkpoints) {
      cp.crystalMesh.rotation.y = elapsedSeconds * (cp.reached ? 2.1 : 1.1);
      cp.crystalMesh.position.y = (cp.reached ? 2.42 : 2.18) + Math.sin(elapsedSeconds * 2.8) * 0.1;

      if (!cp.reached) {
        const radius = cp.config.radius ?? 2.25;
        const dx = playerPos.x - cp.worldPos.x;
        const dz = playerPos.z - cp.worldPos.z;
        const dy = Math.abs(playerPos.y - cp.worldPos.y);
        if (dx * dx + dz * dz <= radius * radius && dy < 2.4) {
          cp.reached = true;
          cp.crystalMat.color.setHex(0x6ee7b7);
          cp.crystalMat.emissive.setHex(0x059669);
          cp.ringMat.color.setHex(0x34d399);
          cp.ringMat.emissive.setHex(0x059669);
          this.audio.playCheckpointChime();
          const cpLabel = cp.config.label ?? `Checkpoint ${cp.config.index} reached`;
          this.callbacks.onCheckpointReached(
            cp.config.index,
            cp.config.spawnPos,
            cp.config.spawnYaw ?? 0,
            cpLabel,
          );
          this.callbacks.onToast(cpLabel, 'checkpoint');
        }
      }
    }

    // 7. Secret Relics proximity & shimmer
    for (const relic of this.relics) {
      if (relic.collected) continue;
      relic.group.rotation.y = elapsedSeconds * 1.8;
      relic.group.position.y = relic.worldPos.y + Math.sin(elapsedSeconds * 3.1) * 0.14;

      if (playerPos.distanceTo(relic.worldPos) < 1.65) {
        relic.collected = true;
        relic.group.visible = false;
        this.audio.playRelicCollect();
        const relicLabel = relic.config.label ?? 'Secret Relic';
        this.callbacks.onRelicFound(relic.config.id, relicLabel);
        this.callbacks.onToast(
          relic.config.label ? `Secret Relic: ${relic.config.label}` : 'Secret Relic discovered!',
          'relic',
        );
      }
    }

    // 8. Finish Zone proximity & animated portal rings
    if (this.finishZone) {
      const fz = this.finishZone;
      fz.outerRing.rotation.z = elapsedSeconds * 0.7;
      fz.innerRing.rotation.y = elapsedSeconds * 1.4;
      fz.innerRing.rotation.x = Math.sin(elapsedSeconds * 1.1) * 0.25;
      fz.beaconOrb.rotation.y = -elapsedSeconds * 2.0;
      fz.beaconOrb.position.y = 2.05 + Math.sin(elapsedSeconds * 2.6) * 0.18;

      if (!fz.triggered) {
        const radius = fz.config.radius ?? 2.35;
        const dx = playerPos.x - fz.worldPos.x;
        const dz = playerPos.z - fz.worldPos.z;
        const dy = Math.abs(playerPos.y - fz.worldPos.y);
        if (dx * dx + dz * dz <= radius * radius && dy < 2.4) {
          fz.triggered = true;
          this.audio.playLevelComplete();
          this.callbacks.onFinishReached();
        }
      }
    }
  }

  public resetPuzzles(): void {
    for (const plate of this.plates) {
      plate.active = false;
      plate.latched = false;
      plate.depress = 0;
      this.signals.set(plate.config.signalId, false);
    }
    for (const lever of this.levers) {
      lever.isOn = Boolean(lever.config.initialOn);
      lever.angle = lever.isOn ? 0.62 : -0.62;
      lever.cooldown = 0;
      this.signals.set(lever.config.signalId, lever.isOn);
      lever.beaconMat.color.setHex(lever.isOn ? 0x10b981 : 0xf59e0b);
      lever.beaconMat.emissive.setHex(lever.isOn ? 0x059669 : 0xd97706);
    }
    for (const door of this.doors) {
      door.progress = 0;
      door.wasOpen = false;
      door.body.position.set(door.closedPos.x, door.closedPos.y, door.closedPos.z);
      door.body.velocity.set(0, 0, 0);
      door.group.position.copy(door.closedPos);
    }
    for (const plat of this.platforms) {
      plat.phase = plat.config.phaseOffset ?? 0;
      plat.currPos.copy(plat.pointA);
      plat.prevPos.copy(plat.pointA);
      plat.body.position.set(plat.pointA.x, plat.pointA.y, plat.pointA.z);
      plat.body.velocity.set(0, 0, 0);
    }
    for (const rope of this.ropes) {
      const [ax, ay, az] = rope.config.anchor;
      const segs = rope.linkBodies.length + 1;
      const segLen = rope.config.length / segs;
      for (let i = 0; i < rope.linkBodies.length; i++) {
        const b = rope.linkBodies[i];
        b.position.set(ax, ay - segLen * (i + 1), az);
        b.velocity.set(0, 0, 0);
        b.angularVelocity.set(0, 0, 0);
      }
      const [hx, hy, hz] = rope.handleBlock.spec.initialPosition;
      rope.handleBlock.body.position.set(hx, hy, hz);
      rope.handleBlock.body.velocity.set(0, 0, 0);
      rope.handleBlock.body.angularVelocity.set(0, 0, 0);
    }
    for (const cp of this.checkpoints) {
      cp.reached = false;
      cp.crystalMat.color.setHex(0x93c5fd);
      cp.crystalMat.emissive.setHex(0x2563eb);
      cp.ringMat.color.setHex(0x60a5fa);
      cp.ringMat.emissive.setHex(0x2563eb);
    }
    if (this.finishZone) {
      this.finishZone.triggered = false;
    }
  }

  public resetDynamicRopes(): void {
    for (const rope of this.ropes) {
      const [ax, ay, az] = rope.config.anchor;
      const segs = rope.linkBodies.length + 1;
      const segLen = rope.config.length / segs;
      for (let i = 0; i < rope.linkBodies.length; i++) {
        const b = rope.linkBodies[i];
        b.position.set(ax, ay - segLen * (i + 1), az);
        b.velocity.set(0, 0, 0);
        b.angularVelocity.set(0, 0, 0);
      }
      const [hx, hy, hz] = rope.handleBlock.spec.initialPosition;
      rope.handleBlock.body.position.set(hx, hy, hz);
      rope.handleBlock.body.velocity.set(0, 0, 0);
      rope.handleBlock.body.angularVelocity.set(0, 0, 0);
    }
  }

  public getRelicsFoundIds(): string[] {
    return this.relics.filter((r) => r.collected).map((r) => r.config.id);
  }

  public getTotalRelics(): number {
    return this.relics.length;
  }

  public getTotalCheckpoints(): number {
    return this.checkpoints.length;
  }

  public dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables.length = 0;
  }
}
