import type { LevelId } from '../types';

export type ConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'disconnecting'
  | 'failed'
  | 'reconnecting';

export type RoomVisibility = 'public' | 'private';

export type RoomLifecycleState = 'lobby' | 'in-game' | 'closed';

export type PlayerConnectionStatus = 'connected' | 'reconnecting' | 'disconnected';

export type CharacterLocomotionState =
  | 'idle'
  | 'walk'
  | 'run'
  | 'jump'
  | 'fall'
  | 'land'
  | 'hang'
  | 'climb'
  | 'ragdoll';

export type SyncedHandMode =
  | 'idle'
  | 'aiming'
  | 'carry'
  | 'push'
  | 'pull'
  | 'hang'
  | 'climb';

export type SyncedTargetKind = 'none' | 'block' | 'ledge';

export interface SyncedHandState {
  /** Hand tip position in world space */
  pos: [number, number, number];
  /** Shoulder/arm local quaternion relative to bodyVisual */
  armQuat: [number, number, number, number];
  /** Elbow bend pitch in radians */
  elbowPitch: number;
  /** Whether hand is reaching/aiming */
  aimActive: boolean;
  /** Whether hand is actively grabbing a block or ledge */
  grabbing: boolean;
  /** Active hand interaction mode */
  mode: SyncedHandMode;
  /** Interaction target kind */
  targetKind: SyncedTargetKind;
  /** Optional target identifier (block id or ledge id) */
  targetId: string | null;
  /** World-space contact or aim target point */
  targetPoint: [number, number, number] | null;
  /** Incremented every time the hand releases a grab or throws */
  releaseSeq: number;
}

export interface CharacterSyncPayload {
  /** Authoritative player network ID (always stamped by server) */
  playerId: string;
  /** Monotonic client sequence number for stale-packet rejection */
  seq: number;
  /** Server receive timestamp in ms for snapshot interpolation */
  serverTime: number;
  /** Active level ID to guard against cross-level ghosting during transitions */
  levelId: LevelId;
  /** Rigid-body world position */
  pos: [number, number, number];
  /** Rigid-body linear velocity */
  vel: [number, number, number];
  /** Rigid-body world quaternion (includes wobble, lean & ragdoll tilt) */
  quat: [number, number, number, number];
  /** Rigid-body angular velocity */
  angVel: [number, number, number];
  /** World XZ movement intent direction */
  moveDir: [number, number];
  /** High-level locomotion state */
  locomotion: CharacterLocomotionState;
  grounded: boolean;
  running: boolean;
  /** 0..1 ragdoll/stumble blend */
  ragdollBlend: number;
  /** Squash & stretch scalar (-0.25..0.21) */
  squash: number;
  /** Ground surface Y directly beneath character for contact shadow */
  groundY: number;
  /** Head pivot Euler [pitch, yaw, roll] */
  headRot: [number, number, number];
  /** Stride cycle phase in radians */
  stridePhase: number;
  /** Climbing & hanging flags */
  hanging: boolean;
  climbing: boolean;
  shimmySpeed: number;
  /** Current block interaction posture */
  interactionMode: 'none' | 'carry' | 'push' | 'pull';
  interactionStrain: number;
  /** Independent left & right hand state */
  leftHand: SyncedHandState;
  rightHand: SyncedHandState;
}

// === STEP 9.3: NETWORKED PHYSICS & SHARED OBJECT INTERACTIONS ===

export interface ObjectHolderEntry {
  playerId: string;
  side: 'left' | 'right';
  mode: 'carry' | 'push' | 'pull';
}

export interface ObjectOwnershipRecord {
  objectId: string;
  /** Authoritative simulator playerId (defaults to room host when unheld) */
  ownerId: string;
  /** Monotonic ownership transfer version (prevents stale state overwrites) */
  version: number;
  /** Active player hands gripping this object (supports cooperative multi-player hold) */
  holders: ObjectHolderEntry[];
  /** Timestamp when ownership last changed on server */
  updatedAt: number;
}

export interface PhysicsObjectSyncState {
  objectId: string;
  levelId: LevelId;
  /** Authoritative owner who simulated this snapshot */
  ownerId: string;
  /** Ownership version when this snapshot was produced */
  version: number;
  /** Monotonic per-object sequence number */
  seq: number;
  /** Server receive timestamp in ms */
  serverTime: number;
  pos: [number, number, number];
  quat: [number, number, number, number];
  vel: [number, number, number];
  angVel: [number, number, number];
  /** True while awake/moving; false when settled/sleeping */
  awake: boolean;
  /** Active holders at snapshot time */
  holders: ObjectHolderEntry[];
}

export interface CoopObjectForcePayload {
  objectId: string;
  levelId: LevelId;
  /** Stamped authoritatively by server */
  fromPlayerId: string;
  side: 'left' | 'right';
  mode: 'carry' | 'push' | 'pull';
  /** Desired world-space force vector to assist the object owner */
  force: [number, number, number];
  /** World-space contact point where the helper is applying force */
  worldPoint: [number, number, number];
  /** Server receive timestamp */
  serverTime: number;
}

// === STEP 9.4: COOPERATIVE PUZZLES & SHARED PROGRESSION ===

export interface SyncedDoorState {
  id: string;
  progress: number;
  wasOpen: boolean;
}

export interface SyncedPlatformState {
  id: string;
  phase: number;
  active: boolean;
}

export interface SyncedPlateState {
  id: string;
  active: boolean;
  latched: boolean;
}

export interface SyncedLeverState {
  id: string;
  isOn: boolean;
}

export interface PuzzleSyncSnapshot {
  levelId: LevelId;
  serverTime: number;
  levers: SyncedLeverState[];
  plates: SyncedPlateState[];
  doors: SyncedDoorState[];
  platforms: SyncedPlatformState[];
  checkpointIndex: number;
  checkpointSpawnPos: [number, number, number] | null;
  checkpointSpawnYaw: number;
  collectedRelics: string[];
  completed: boolean;
}

export type CoopEventKind =
  | 'lever'
  | 'plate'
  | 'door'
  | 'checkpoint'
  | 'relic'
  | 'finish'
  | 'coop-grab'
  | 'reset-objects'
  | 'restart-level';

export interface CoopGameplayEvent {
  kind: CoopEventKind;
  levelId: LevelId;
  actorId: string;
  actorName: string;
  targetId?: string;
  message: string;
  serverTime: number;
}

export interface NetworkPlayerInfo {
  id: string;
  displayName: string;
  color: string;
  isHost: boolean;
  spawnSlot: number;
  connectionStatus: PlayerConnectionStatus;
  joinedAt: number;
}

export interface NetworkRoomState {
  roomId: string;
  hostId: string;
  visibility: RoomVisibility;
  maxPlayers: number;
  levelId: LevelId;
  state: RoomLifecycleState;
  players: NetworkPlayerInfo[];
  createdAt: number;
}

export interface PublicRoomSummary {
  roomId: string;
  hostName: string;
  levelId: LevelId;
  playerCount: number;
  maxPlayers: number;
  state: RoomLifecycleState;
  createdAt: number;
}

export type NetworkErrorCode =
  | 'INVALID_ROOM_ID'
  | 'ROOM_NOT_FOUND'
  | 'ROOM_FULL'
  | 'ROOM_CLOSED'
  | 'ALREADY_IN_ROOM'
  | 'NOT_IN_ROOM'
  | 'NOT_HOST'
  | 'INVALID_PAYLOAD'
  | 'OWNERSHIP_VIOLATION'
  | 'CONNECTION_FAILED'
  | 'CONNECTION_TIMEOUT'
  | 'RATE_LIMITED';

export interface NetworkErrorInfo {
  code: NetworkErrorCode;
  message: string;
}

export type ClientToServerMessage =
  | {
      type: 'room:create';
      displayName: string;
      visibility: RoomVisibility;
      maxPlayers: number;
      levelId: LevelId;
    }
  | {
      type: 'room:join';
      roomId: string;
      displayName: string;
    }
  | {
      type: 'room:reconnect';
      roomId: string;
      previousPlayerId: string;
      displayName: string;
    }
  | {
      type: 'room:leave';
    }
  | {
      type: 'room:close';
    }
  | {
      type: 'room:set_level';
      levelId: LevelId;
      startGame?: boolean;
    }
  | {
      type: 'room:restart_level';
    }
  | {
      type: 'room:reset_objects';
    }
  | {
      type: 'room:list';
    }
  | {
      type: 'player:state';
      state: CharacterSyncPayload;
    }
  // Step 9.3: Networked Physics & Grabbing
  | {
      type: 'physics:grab_claim';
      objectId: string;
      levelId: LevelId;
      side: 'left' | 'right';
      mode: 'carry' | 'push' | 'pull';
    }
  | {
      type: 'physics:grab_release';
      objectId: string;
      levelId: LevelId;
      side: 'left' | 'right';
      /** True if the object was thrown or released with momentum so owner finishes flight briefly */
      releasedWithMomentum?: boolean;
    }
  | {
      type: 'physics:objects_sync';
      levelId: LevelId;
      objects: PhysicsObjectSyncState[];
    }
  | {
      type: 'physics:coop_force';
      payload: CoopObjectForcePayload;
    }
  // Step 9.4: Cooperative Puzzles & Shared Progression
  | {
      type: 'puzzle:lever_toggle';
      levelId: LevelId;
      leverId: string;
      isOn: boolean;
      label: string;
    }
  | {
      type: 'puzzle:checkpoint';
      levelId: LevelId;
      checkpointIndex: number;
      spawnPos: [number, number, number];
      spawnYaw: number;
      label: string;
    }
  | {
      type: 'puzzle:relic';
      levelId: LevelId;
      relicId: string;
      label: string;
    }
  | {
      type: 'puzzle:finish';
      levelId: LevelId;
    }
  | {
      type: 'puzzle:host_state';
      state: PuzzleSyncSnapshot;
    }
  | {
      type: 'ping';
      clientTime: number;
    };

export type ServerToClientMessage =
  | {
      type: 'session:welcome';
      playerId: string;
      serverTime: number;
    }
  | {
      type: 'room:state';
      room: NetworkRoomState;
      serverTime: number;
    }
  | {
      type: 'room:player_joined';
      player: NetworkPlayerInfo;
      room: NetworkRoomState;
      serverTime: number;
    }
  | {
      type: 'room:player_left';
      playerId: string;
      reason: 'left' | 'disconnected' | 'closed';
      room: NetworkRoomState | null;
      serverTime: number;
    }
  | {
      type: 'room:closed';
      roomId: string;
      reason: string;
      serverTime: number;
    }
  | {
      type: 'room:restarted';
      levelId: LevelId;
      actorName: string;
      serverTime: number;
    }
  | {
      type: 'room:objects_reset';
      levelId: LevelId;
      actorName: string;
      serverTime: number;
    }
  | {
      type: 'room:list_result';
      rooms: PublicRoomSummary[];
      serverTime: number;
    }
  | {
      type: 'player:state';
      state: CharacterSyncPayload;
    }
  | {
      type: 'players:sync_all';
      states: CharacterSyncPayload[];
      serverTime: number;
    }
  // Step 9.3: Networked Physics & Grabbing
  | {
      type: 'physics:ownership';
      ownership: ObjectOwnershipRecord;
      serverTime: number;
    }
  | {
      type: 'physics:objects_sync';
      levelId: LevelId;
      objects: PhysicsObjectSyncState[];
      serverTime: number;
    }
  | {
      type: 'physics:sync_all';
      levelId: LevelId;
      objects: PhysicsObjectSyncState[];
      ownerships: ObjectOwnershipRecord[];
      serverTime: number;
    }
  | {
      type: 'physics:coop_force';
      payload: CoopObjectForcePayload;
    }
  // Step 9.4: Cooperative Puzzles & Shared Progression
  | {
      type: 'puzzle:state';
      state: PuzzleSyncSnapshot;
    }
  | {
      type: 'puzzle:lever_toggled';
      levelId: LevelId;
      leverId: string;
      isOn: boolean;
      actorId: string;
      actorName: string;
      label: string;
      serverTime: number;
    }
  | {
      type: 'puzzle:event';
      event: CoopGameplayEvent;
    }
  | {
      type: 'error';
      code: NetworkErrorCode;
      message: string;
    }
  | {
      type: 'pong';
      clientTime: number;
      serverTime: number;
    };

export const VALID_LEVEL_IDS: ReadonlySet<LevelId> = new Set<LevelId>([
  'dream-world',
  'warehouse',
  'mountain-adventure',
  'construction-site',
  'medieval-castle',
  'observatory',
]);

export const MULTIPLAYER_COLOR_PALETTE: readonly string[] = [
  '#2563eb', // Alpine Blue
  '#ea580c', // Sunlit Coral
  '#059669', // Meadow Emerald
  '#7c3aed', // Observatory Violet
  '#db2777', // Berry Rose
  '#0891b2', // Glacier Teal
  '#d97706', // Golden Amber
  '#4f46e5', // Twilight Indigo
];

const ROOM_ID_PATTERN = /^[A-HJ-NP-Z2-9]{6}$/;

export function normalizeRoomId(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function isValidRoomIdFormat(roomId: string): boolean {
  return ROOM_ID_PATTERN.test(roomId);
}

export function sanitizeDisplayName(raw: string, fallback = 'Explorer'): string {
  const cleaned = raw.replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 20);
  return cleaned.length > 0 ? cleaned : fallback;
}

export function sanitizeIdentifier(raw: unknown, maxLen = 48): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, maxLen);
  return cleaned.length > 0 ? cleaned : null;
}

/**
 * Deterministic safe spawn formation offsets relative to a level's base spawn point and yaw,
 * keeping up to 8 players on solid starting ground without clipping into each other.
 */
const SPAWN_SLOT_LOCAL_OFFSETS: ReadonlyArray<[number, number]> = [
  [0, 0],
  [1.25, 0.25],
  [-1.25, 0.25],
  [0.65, 1.25],
  [-0.65, 1.25],
  [1.8, 1.1],
  [-1.8, 1.1],
  [0, 1.85],
];

export function computeSpawnPositionForSlot(
  baseSpawn: [number, number, number],
  baseYaw: number,
  slot: number,
): [number, number, number] {
  const idx =
    ((Math.floor(slot) % SPAWN_SLOT_LOCAL_OFFSETS.length) + SPAWN_SLOT_LOCAL_OFFSETS.length) %
    SPAWN_SLOT_LOCAL_OFFSETS.length;
  const [localX, localZ] = SPAWN_SLOT_LOCAL_OFFSETS[idx];
  const cos = Math.cos(baseYaw);
  const sin = Math.sin(baseYaw);
  const worldX = baseSpawn[0] + localX * cos + localZ * sin;
  const worldZ = baseSpawn[2] - localX * sin + localZ * cos;
  return [worldX, baseSpawn[1], worldZ];
}
