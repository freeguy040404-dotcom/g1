import type * as THREE from 'three';
import type * as CANNON from 'cannon-es';

export type CampaignLevelId =
  | 'dream-world'
  | 'warehouse'
  | 'mountain-adventure'
  | 'construction-site'
  | 'medieval-castle';

export type LevelId = CampaignLevelId | 'observatory';

export interface Vec3Tuple {
  x: number;
  y: number;
  z: number;
}

export interface StaticBoxSpec {
  size: [number, number, number];
  position: [number, number, number];
  rotationY?: number;
  rotationX?: number;
  rotationZ?: number;
}

export type DynamicObjectKind =
  | 'block'
  | 'crate'
  | 'metal-crate'
  | 'boulder'
  | 'plank'
  | 'rope-handle';

export interface DynamicBlockSpec {
  id: string;
  size: [number, number, number];
  initialPosition: [number, number, number];
  initialRotationY?: number;
  color: number;
  mass: number;
  kind?: DynamicObjectKind;
  radius?: number;
  resetLocked?: boolean;
}

export interface DynamicBlockInstance {
  spec: DynamicBlockSpec;
  mesh: THREE.Group;
  body: CANNON.Body;
}

export type HandSide = 'left' | 'right';

export type InteractiveSurfaceKind = 'block' | 'ledge';

export interface GrabTargetMetadata {
  block: DynamicBlockInstance | null;
  body: CANNON.Body;
  worldPoint: THREE.Vector3;
  localAnchor: CANNON.Vec3;
  worldNormal: THREE.Vector3;
  wallNormal: THREE.Vector3;
  ledgeTopY: number;
  ledgeId: string | null;
  distanceFromShoulder: number;
  surfaceKind: InteractiveSurfaceKind;
}

export interface HandTargetState {
  side: HandSide;
  isAiming: boolean;
  isTargetingBlock: boolean;
  isTargetingLedge: boolean;
  isInReach: boolean;
  isLockedOn: boolean;
  shoulderWorldPos: THREE.Vector3;
  handTipWorldPos: THREE.Vector3;
  aimWorldPoint: THREE.Vector3;
  target: GrabTargetMetadata | null;
}

export interface HandAimDirective {
  active: boolean;
  lockedOn: boolean;
  worldTarget: THREE.Vector3;
}

export type HandInteractionMode =
  | 'idle'
  | 'aiming'
  | 'carry'
  | 'push'
  | 'pull'
  | 'hang'
  | 'climb';

export interface HandHudStatus {
  active: boolean;
  locked: boolean;
  held: boolean;
  mode: HandInteractionMode;
  surfaceKind: InteractiveSurfaceKind | null;
  outOfReach: boolean;
  blockId: string | null;
}

export interface HeldBlockState {
  side: HandSide;
  block: DynamicBlockInstance;
  body: CANNON.Body;
  localAnchor: CANNON.Vec3;
  worldAnchor: THREE.Vector3;
  holdTarget: THREE.Vector3;
  holdVelocity: THREE.Vector3;
  mode: 'carry' | 'push' | 'pull';
}

export interface LedgeGrabState {
  side: HandSide;
  ledgeId: string;
  body: CANNON.Body;
  localAnchor: CANNON.Vec3;
  worldAnchor: THREE.Vector3;
  wallNormal: THREE.Vector3;
  ledgeTopY: number;
  mode: 'hang' | 'climb';
}

export interface HangingCharacterState {
  isHanging: boolean;
  isClimbing: boolean;
  handCount: number;
  wallNormalX: number;
  wallNormalZ: number;
  stretchAmount: number;
  shimmySpeed: number;
}

export interface CharacterInteractionPose {
  mode: 'none' | 'carry' | 'push' | 'pull';
  heldMass: number;
  strain: number;
  twoHanded: boolean;
}

export type AudioThemeId = LevelId | 'menu' | 'victory';
export type EnvironmentThemeId = LevelId | 'menu';

export type ImpactEffectKind = 'dust' | 'wood' | 'metal' | 'stone' | 'spark';

export type ImpactEffectCallback = (
  x: number,
  y: number,
  z: number,
  intensity: number,
  kind: ImpactEffectKind,
) => void;

export interface HandTargetingHudSnapshot {
  left: HandHudStatus;
  right: HandHudStatus;
  hoverInReach: boolean;
  hoverKind: InteractiveSurfaceKind | null;
}

export interface LevelCatalogEntry {
  id: LevelId;
  order: number;
  numberLabel: string;
  title: string;
  subtitle: string;
  description: string;
  puzzleTags: string[];
  accentColor: string;
  skyTopHex: string;
  skyBottomHex: string;
  totalCheckpoints: number;
  totalRelics: number;
  isSandbox?: boolean;
}

export interface LevelProgressRecord {
  completed: boolean;
  bestTimeSec: number | null;
  foundRelics: string[];
}

export interface CampaignProgress {
  unlockedLevelIds: LevelId[];
  unlockAll: boolean;
  records: Record<LevelId, LevelProgressRecord>;
}

export interface LevelToastEvent {
  id: number;
  message: string;
  kind: 'checkpoint' | 'relic' | 'puzzle' | 'respawn' | 'complete';
}

export interface LevelRuntimeSnapshot {
  levelId: LevelId;
  levelTitle: string;
  levelSubtitle: string;
  isSandbox: boolean;
  checkpointIndex: number;
  totalCheckpoints: number;
  relicsFound: number;
  totalRelics: number;
  elapsedSec: number;
  status: 'playing' | 'completed';
  nearLeverLabel: string | null;
  activeObjective: string;
  toast: LevelToastEvent | null;
}

export interface LevelCompletionPayload {
  levelId: LevelId;
  elapsedSec: number;
  foundRelics: string[];
  totalRelics: number;
}

export type EngineMode = 'menu' | 'playing' | 'paused';

export interface MultiplayerPlayer {
  id: string;
  name: string;
  color: string;
  turns: number;
}

export interface MultiplayerSession {
  enabled: boolean;
  players: MultiplayerPlayer[];
  activePlayerIndex: number;
}

export interface OnlineRoomSyncContext {
  localPlayerId: string;
  localPlayerColor: string;
  localSpawnSlot: number;
  isHost: boolean;
  players: import('./network/protocol').NetworkPlayerInfo[];
  serverClockOffsetMs: number;
  latencyMs: number | null;
  jitterMs: number;
}

export interface GameEngineCallbacks {
  onPointerLockChange: (locked: boolean) => void;
  onWebGLError: (message: string) => void;
  onHandTargetingChange?: (snapshot: HandTargetingHudSnapshot) => void;
  onLevelStateChange?: (snapshot: LevelRuntimeSnapshot) => void;
  onLevelCompleted?: (payload: LevelCompletionPayload) => void;
  onRelicCollected?: (levelId: LevelId, relicId: string, label?: string) => void;
  onLocalCharacterState?: (state: import('./network/protocol').CharacterSyncPayload) => void;
  // Step 9.3: Networked Physics & Grabbing
  onPhysicsGrabClaim?: (
    objectId: string,
    levelId: LevelId,
    side: 'left' | 'right',
    mode: 'carry' | 'push' | 'pull',
  ) => void;
  onPhysicsGrabRelease?: (
    objectId: string,
    levelId: LevelId,
    side: 'left' | 'right',
    releasedWithMomentum: boolean,
  ) => void;
  onPhysicsObjectsSync?: (
    levelId: LevelId,
    objects: import('./network/protocol').PhysicsObjectSyncState[],
  ) => void;
  onCoopObjectForce?: (payload: import('./network/protocol').CoopObjectForcePayload) => void;
  // Step 9.4: Cooperative Puzzles & Shared Progression
  onPuzzleLeverToggled?: (levelId: LevelId, leverId: string, isOn: boolean, label: string) => void;
  onPuzzleCheckpointReached?: (
    levelId: LevelId,
    checkpointIndex: number,
    spawnPos: [number, number, number],
    spawnYaw: number,
    label: string,
  ) => void;
  onPuzzleFinishReached?: (levelId: LevelId) => void;
  onHostPuzzleState?: (state: import('./network/protocol').PuzzleSyncSnapshot) => void;
}

export interface GameEngineHandle {
  loadLevel: (levelId: LevelId, alreadyFoundRelics?: string[]) => void;
  restartLevel: () => void;
  respawnAtCheckpoint: () => void;
  setPaused: (paused: boolean) => void;
  setMode: (mode: EngineMode) => void;
  applySettings: (settings: import('./settings').GameSettings) => void;
  playUiSound: (kind: 'click' | 'hover' | 'pause' | 'resume' | 'test') => void;
  getCurrentLevelId: () => LevelId;
  dropCharacterFromSky: () => void;
  nudgeCharacter: () => void;
  resetBlocks: () => void;
  togglePointerLock: () => void;
  setOnlineSession: (context: OnlineRoomSyncContext | null) => void;
  applyRemoteCharacterState: (state: import('./network/protocol').CharacterSyncPayload) => void;
  // Step 9.3 & 9.4 incoming network handlers
  applyPhysicsOwnership: (record: import('./network/protocol').ObjectOwnershipRecord) => void;
  applyPhysicsObjectsSync: (
    levelId: LevelId,
    objects: import('./network/protocol').PhysicsObjectSyncState[],
  ) => void;
  applyPhysicsSyncAll: (
    levelId: LevelId,
    objects: import('./network/protocol').PhysicsObjectSyncState[],
    ownerships: import('./network/protocol').ObjectOwnershipRecord[],
  ) => void;
  applyCoopObjectForce: (payload: import('./network/protocol').CoopObjectForcePayload) => void;
  applyPuzzleState: (state: import('./network/protocol').PuzzleSyncSnapshot) => void;
  applyRemoteLeverToggle: (
    levelId: LevelId,
    leverId: string,
    isOn: boolean,
    actorName?: string,
  ) => void;
  pushNetworkToast: (message: string, kind?: LevelToastEvent['kind']) => void;
  dispose: () => void;
}
