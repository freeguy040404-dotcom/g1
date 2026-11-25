import crypto from 'node:crypto';
import type { Server as HttpServer } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import type { LevelId } from '../game/types';
import {
  MULTIPLAYER_COLOR_PALETTE,
  VALID_LEVEL_IDS,
  isValidRoomIdFormat,
  normalizeRoomId,
  sanitizeDisplayName,
  sanitizeIdentifier,
  type CharacterLocomotionState,
  type CharacterSyncPayload,
  type ClientToServerMessage,
  type CoopGameplayEvent,
  type CoopObjectForcePayload,
  type NetworkErrorCode,
  type NetworkPlayerInfo,
  type NetworkRoomState,
  type ObjectHolderEntry,
  type ObjectOwnershipRecord,
  type PhysicsObjectSyncState,
  type PublicRoomSummary,
  type PuzzleSyncSnapshot,
  type RoomLifecycleState,
  type RoomVisibility,
  type ServerToClientMessage,
  type SyncedDoorState,
  type SyncedHandMode,
  type SyncedHandState,
  type SyncedLeverState,
  type SyncedPlateState,
  type SyncedPlatformState,
  type SyncedTargetKind,
} from '../game/network/protocol.ts';

const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_PAYLOAD_BYTES = 32 * 1024;
const HEARTBEAT_INTERVAL_MS = 15_000;
const CONTROL_RATE_WINDOW_MS = 1_000;
const CONTROL_RATE_MAX = 35;
const STATE_RATE_WINDOW_MS = 1_000;
const STATE_RATE_MAX = 45;
const PHYSICS_RATE_WINDOW_MS = 1_000;
const PHYSICS_RATE_MAX = 45;
const MAX_OBJECTS_PER_BATCH = 32;
const MAX_TRACKED_OBJECTS_PER_ROOM = 64;
const POST_RELEASE_FLIGHT_GRACE_MS = 1_200;
const MAX_COOP_FORCE_MAG = 95;

const VALID_LOCOMOTIONS: ReadonlySet<CharacterLocomotionState> = new Set([
  'idle',
  'walk',
  'run',
  'jump',
  'fall',
  'land',
  'hang',
  'climb',
  'ragdoll',
]);

const VALID_HAND_MODES: ReadonlySet<SyncedHandMode> = new Set([
  'idle',
  'aiming',
  'carry',
  'push',
  'pull',
  'hang',
  'climb',
]);

const VALID_TARGET_KINDS: ReadonlySet<SyncedTargetKind> = new Set(['none', 'block', 'ledge']);

const VALID_INTERACTION_MODES: ReadonlySet<'none' | 'carry' | 'push' | 'pull'> = new Set([
  'none',
  'carry',
  'push',
  'pull',
]);

const VALID_GRAB_MODES: ReadonlySet<'carry' | 'push' | 'pull'> = new Set([
  'carry',
  'push',
  'pull',
]);

interface ConnectedClient {
  socket: WebSocket;
  playerId: string;
  roomId: string | null;
  alive: boolean;
  controlCount: number;
  controlWindowStart: number;
  stateCount: number;
  stateWindowStart: number;
  physicsCount: number;
  physicsWindowStart: number;
  lastSeq: number;
}

interface InternalObjectOwnership extends ObjectOwnershipRecord {
  /** If unheld after a throw/release, timestamp until which the thrower retains flight ownership */
  flightLeaseUntil: number;
}

interface InternalRoom {
  roomId: string;
  hostId: string;
  visibility: RoomVisibility;
  maxPlayers: number;
  levelId: LevelId;
  state: RoomLifecycleState;
  createdAt: number;
  players: Map<string, NetworkPlayerInfo>;
  playerStates: Map<string, CharacterSyncPayload>;
  /** Step 9.3: Authoritative object ownership & cached dynamic rigid-body states */
  objectOwnerships: Map<string, InternalObjectOwnership>;
  objectStates: Map<string, PhysicsObjectSyncState>;
  /** Step 9.4: Authoritative cooperative puzzle & progression state */
  puzzleState: PuzzleSyncSnapshot;
}

function createInitialPuzzleState(levelId: LevelId, now: number): PuzzleSyncSnapshot {
  return {
    levelId,
    serverTime: now,
    levers: [],
    plates: [],
    doors: [],
    platforms: [],
    checkpointIndex: 0,
    checkpointSpawnPos: null,
    checkpointSpawnYaw: 0,
    collectedRelics: [],
    completed: false,
  };
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function clampFinite(v: unknown, min: number, max: number, fallback = 0): number {
  if (!isFiniteNumber(v)) return fallback;
  return Math.min(max, Math.max(min, v));
}

function validateVec3(raw: unknown, maxAbs = 2000): [number, number, number] | null {
  if (!Array.isArray(raw) || raw.length !== 3) return null;
  const [x, y, z] = raw;
  if (!isFiniteNumber(x) || !isFiniteNumber(y) || !isFiniteNumber(z)) return null;
  if (Math.abs(x) > maxAbs || Math.abs(y) > maxAbs || Math.abs(z) > maxAbs) return null;
  return [x, y, z];
}

function validateVec2(raw: unknown, maxAbs = 2): [number, number] | null {
  if (!Array.isArray(raw) || raw.length !== 2) return null;
  const [x, z] = raw;
  if (!isFiniteNumber(x) || !isFiniteNumber(z)) return null;
  return [clampFinite(x, -maxAbs, maxAbs), clampFinite(z, -maxAbs, maxAbs)];
}

function validateQuat(raw: unknown): [number, number, number, number] | null {
  if (!Array.isArray(raw) || raw.length !== 4) return null;
  const [x, y, z, w] = raw;
  if (!isFiniteNumber(x) || !isFiniteNumber(y) || !isFiniteNumber(z) || !isFiniteNumber(w)) {
    return null;
  }
  const len = Math.hypot(x, y, z, w);
  if (len < 0.0001 || len > 10) return null;
  return [x / len, y / len, z / len, w / len];
}

function validateHandState(raw: unknown): SyncedHandState | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const pos = validateVec3(obj.pos, 2000);
  const armQuat = validateQuat(obj.armQuat);
  if (!pos || !armQuat) return null;

  const mode =
    typeof obj.mode === 'string' && VALID_HAND_MODES.has(obj.mode as SyncedHandMode)
      ? (obj.mode as SyncedHandMode)
      : 'idle';
  const targetKind =
    typeof obj.targetKind === 'string' && VALID_TARGET_KINDS.has(obj.targetKind as SyncedTargetKind)
      ? (obj.targetKind as SyncedTargetKind)
      : 'none';

  const targetId = sanitizeIdentifier(obj.targetId, 48);

  const targetPoint =
    obj.targetPoint === null || obj.targetPoint === undefined
      ? null
      : validateVec3(obj.targetPoint, 2000);

  return {
    pos,
    armQuat,
    elbowPitch: clampFinite(obj.elbowPitch, -3.2, 3.2, 0),
    aimActive: Boolean(obj.aimActive),
    grabbing: Boolean(obj.grabbing),
    mode,
    targetKind,
    targetId,
    targetPoint,
    releaseSeq: Math.max(0, Math.floor(clampFinite(obj.releaseSeq, 0, 1_000_000_000, 0))),
  };
}

function validateCharacterPayload(
  raw: unknown,
  authoritativePlayerId: string,
  roomLevelId: LevelId,
  serverTime: number,
): CharacterSyncPayload | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;

  const pos = validateVec3(obj.pos, 1200);
  const vel = validateVec3(obj.vel, 120);
  const quat = validateQuat(obj.quat);
  const angVel = validateVec3(obj.angVel, 80);
  const moveDir = validateVec2(obj.moveDir, 1.5);
  const headRot = validateVec3(obj.headRot, 3.2);
  const leftHand = validateHandState(obj.leftHand);
  const rightHand = validateHandState(obj.rightHand);

  if (!pos || !vel || !quat || !angVel || !moveDir || !headRot || !leftHand || !rightHand) {
    return null;
  }

  const locomotion =
    typeof obj.locomotion === 'string' &&
    VALID_LOCOMOTIONS.has(obj.locomotion as CharacterLocomotionState)
      ? (obj.locomotion as CharacterLocomotionState)
      : 'idle';

  const interactionMode =
    typeof obj.interactionMode === 'string' &&
    VALID_INTERACTION_MODES.has(obj.interactionMode as 'none' | 'carry' | 'push' | 'pull')
      ? (obj.interactionMode as 'none' | 'carry' | 'push' | 'pull')
      : 'none';

  const levelId =
    typeof obj.levelId === 'string' && VALID_LEVEL_IDS.has(obj.levelId as LevelId)
      ? (obj.levelId as LevelId)
      : roomLevelId;

  return {
    playerId: authoritativePlayerId,
    seq: Math.max(0, Math.floor(clampFinite(obj.seq, 0, 2_000_000_000, 0))),
    serverTime,
    levelId,
    pos,
    vel,
    quat,
    angVel,
    moveDir,
    locomotion,
    grounded: Boolean(obj.grounded),
    running: Boolean(obj.running),
    ragdollBlend: clampFinite(obj.ragdollBlend, 0, 1, 0),
    squash: clampFinite(obj.squash, -0.35, 0.35, 0),
    groundY: clampFinite(obj.groundY, -500, 500, pos[1] - 0.9),
    headRot,
    stridePhase: clampFinite(obj.stridePhase, -1e6, 1e6, 0),
    hanging: Boolean(obj.hanging),
    climbing: Boolean(obj.climbing),
    shimmySpeed: clampFinite(obj.shimmySpeed, -12, 12, 0),
    interactionMode,
    interactionStrain: clampFinite(obj.interactionStrain, 0, 1, 0),
    leftHand,
    rightHand,
  };
}

function validatePhysicsObjectState(
  raw: unknown,
  authoritativeOwnerId: string,
  authoritativeVersion: number,
  authoritativeHolders: ObjectHolderEntry[],
  roomLevelId: LevelId,
  serverTime: number,
): PhysicsObjectSyncState | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;

  const objectId = sanitizeIdentifier(obj.objectId, 48);
  if (!objectId) return null;

  // Strict world bounds & velocity limits prevent clients from injecting arbitrary/explosive physics values
  const pos = validateVec3(obj.pos, 600);
  const quat = validateQuat(obj.quat);
  const vel = validateVec3(obj.vel, 45);
  const angVel = validateVec3(obj.angVel, 30);
  if (!pos || !quat || !vel || !angVel) return null;

  // Clamp floor penetration floor sanity (-40..300)
  pos[1] = clampFinite(pos[1], -40, 300, pos[1]);

  return {
    objectId,
    levelId: roomLevelId,
    ownerId: authoritativeOwnerId,
    version: authoritativeVersion,
    seq: Math.max(0, Math.floor(clampFinite(obj.seq, 0, 2_000_000_000, 0))),
    serverTime,
    pos,
    quat,
    vel,
    angVel,
    awake: Boolean(obj.awake),
    holders: authoritativeHolders.map((h) => ({ ...h })),
  };
}

function serializeOwnership(rec: InternalObjectOwnership): ObjectOwnershipRecord {
  return {
    objectId: rec.objectId,
    ownerId: rec.ownerId,
    version: rec.version,
    holders: rec.holders.map((h) => ({ ...h })),
    updatedAt: rec.updatedAt,
  };
}

export class MultiplayerRoomServer {
  private wss: WebSocketServer | null = null;
  private readonly clients = new Map<string, ConnectedClient>();
  private readonly rooms = new Map<string, InternalRoom>();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  public attachToHttpServer(httpServer: HttpServer, path = '/ws'): void {
    if (this.wss) return;

    this.wss = new WebSocketServer({
      server: httpServer,
      path,
      maxPayload: MAX_PAYLOAD_BYTES,
    });

    this.wss.on('connection', (socket) => {
      this.handleConnection(socket);
    });

    this.heartbeatTimer = setInterval(() => {
      for (const client of this.clients.values()) {
        if (!client.alive) {
          client.socket.terminate();
          continue;
        }
        client.alive = false;
        if (client.socket.readyState === WebSocket.OPEN) {
          client.socket.ping();
        }
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  public getPublicRooms(): PublicRoomSummary[] {
    const summaries: PublicRoomSummary[] = [];
    for (const room of this.rooms.values()) {
      // Strictly protect private room information from public directory queries
      if (room.visibility !== 'public' || room.state === 'closed') continue;
      const host = room.players.get(room.hostId);
      summaries.push({
        roomId: room.roomId,
        hostName: host?.displayName ?? 'Host',
        levelId: room.levelId,
        playerCount: room.players.size,
        maxPlayers: room.maxPlayers,
        state: room.state,
        createdAt: room.createdAt,
      });
    }
    summaries.sort((a, b) => b.createdAt - a.createdAt);
    return summaries;
  }

  public getRoomCount(): number {
    return this.rooms.size;
  }

  public getConnectedClientCount(): number {
    return this.clients.size;
  }

  private handleConnection(socket: WebSocket): void {
    const playerId = `pl_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
    const now = Date.now();

    const client: ConnectedClient = {
      socket,
      playerId,
      roomId: null,
      alive: true,
      controlCount: 0,
      controlWindowStart: now,
      stateCount: 0,
      stateWindowStart: now,
      physicsCount: 0,
      physicsWindowStart: now,
      lastSeq: -1,
    };

    this.clients.set(playerId, client);

    this.send(client, {
      type: 'session:welcome',
      playerId,
      serverTime: now,
    });

    socket.on('pong', () => {
      client.alive = true;
    });

    socket.on('message', (data, isBinary) => {
      if (isBinary) {
        this.sendError(client, 'INVALID_PAYLOAD', 'Expected JSON text message.');
        return;
      }
      client.alive = true;
      this.handleRawMessage(client, data.toString('utf8'));
    });

    socket.on('close', () => {
      this.handleDisconnect(client);
    });

    socket.on('error', () => {
      this.handleDisconnect(client);
    });
  }

  private handleRawMessage(client: ConnectedClient, rawText: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      this.sendError(client, 'INVALID_PAYLOAD', 'Malformed JSON payload.');
      return;
    }

    if (!parsed || typeof parsed !== 'object' || typeof (parsed as { type?: unknown }).type !== 'string') {
      this.sendError(client, 'INVALID_PAYLOAD', 'Message must include a valid string type.');
      return;
    }

    const msg = parsed as ClientToServerMessage;
    const now = Date.now();

    // High-frequency character transform ticks have their own rate-limit bucket
    if (msg.type === 'player:state') {
      if (now - client.stateWindowStart >= STATE_RATE_WINDOW_MS) {
        client.stateWindowStart = now;
        client.stateCount = 0;
      }
      client.stateCount += 1;
      if (client.stateCount > STATE_RATE_MAX) {
        return;
      }
      this.handlePlayerState(client, msg, now);
      return;
    }

    // High-frequency physics object & co-op force packets have their own bucket
    if (msg.type === 'physics:objects_sync' || msg.type === 'physics:coop_force' || msg.type === 'puzzle:host_state') {
      if (now - client.physicsWindowStart >= PHYSICS_RATE_WINDOW_MS) {
        client.physicsWindowStart = now;
        client.physicsCount = 0;
      }
      client.physicsCount += 1;
      if (client.physicsCount > PHYSICS_RATE_MAX) {
        return;
      }
      if (msg.type === 'physics:objects_sync') {
        this.handlePhysicsObjectsSync(client, msg, now);
      } else if (msg.type === 'physics:coop_force') {
        this.handleCoopForce(client, msg, now);
      } else {
        this.handlePuzzleHostState(client, msg, now);
      }
      return;
    }

    if (now - client.controlWindowStart >= CONTROL_RATE_WINDOW_MS) {
      client.controlWindowStart = now;
      client.controlCount = 0;
    }
    client.controlCount += 1;
    if (client.controlCount > CONTROL_RATE_MAX) {
      this.sendError(client, 'RATE_LIMITED', 'Too many requests. Please slow down.');
      return;
    }

    switch (msg.type) {
      case 'ping':
        this.send(client, {
          type: 'pong',
          clientTime: isFiniteNumber(msg.clientTime) ? msg.clientTime : now,
          serverTime: now,
        });
        break;
      case 'room:list':
        this.send(client, {
          type: 'room:list_result',
          rooms: this.getPublicRooms(),
          serverTime: now,
        });
        break;
      case 'room:create':
        this.handleCreateRoom(client, msg, now);
        break;
      case 'room:join':
        this.handleJoinRoom(client, msg, now);
        break;
      case 'room:reconnect':
        this.handleReconnectRoom(client, msg, now);
        break;
      case 'room:leave':
        this.leaveCurrentRoom(client, 'left');
        break;
      case 'room:close':
        this.handleCloseRoom(client);
        break;
      case 'room:set_level':
        this.handleSetLevel(client, msg, now);
        break;
      case 'room:restart_level':
        this.handleRestartLevel(client, now);
        break;
      case 'room:reset_objects':
        this.handleResetObjects(client, now);
        break;
      case 'physics:grab_claim':
        this.handleGrabClaim(client, msg, now);
        break;
      case 'physics:grab_release':
        this.handleGrabRelease(client, msg, now);
        break;
      case 'puzzle:lever_toggle':
        this.handleLeverToggle(client, msg, now);
        break;
      case 'puzzle:checkpoint':
        this.handleCheckpointReached(client, msg, now);
        break;
      case 'puzzle:relic':
        this.handleRelicCollected(client, msg, now);
        break;
      case 'puzzle:finish':
        this.handleFinishReached(client, msg, now);
        break;
      default:
        this.sendError(client, 'INVALID_PAYLOAD', 'Unsupported message type.');
        break;
    }
  }

  private handleCreateRoom(
    client: ConnectedClient,
    msg: Extract<ClientToServerMessage, { type: 'room:create' }>,
    now: number,
  ): void {
    if (client.roomId) {
      this.sendError(client, 'ALREADY_IN_ROOM', 'Leave your current room before creating a new one.');
      return;
    }

    const visibility: RoomVisibility = msg.visibility === 'private' ? 'private' : 'public';
    const maxPlayers = Math.round(clampFinite(msg.maxPlayers, 2, 8, 4));
    const levelId: LevelId =
      typeof msg.levelId === 'string' && VALID_LEVEL_IDS.has(msg.levelId as LevelId)
        ? (msg.levelId as LevelId)
        : 'dream-world';
    const displayName = sanitizeDisplayName(
      typeof msg.displayName === 'string' ? msg.displayName : '',
      'Host',
    );

    const roomId = this.generateUniqueRoomId();
    const hostPlayer: NetworkPlayerInfo = {
      id: client.playerId,
      displayName,
      color: MULTIPLAYER_COLOR_PALETTE[0],
      isHost: true,
      spawnSlot: 0,
      connectionStatus: 'connected',
      joinedAt: now,
    };

    const room: InternalRoom = {
      roomId,
      hostId: client.playerId,
      visibility,
      maxPlayers,
      levelId,
      state: 'lobby',
      createdAt: now,
      players: new Map([[client.playerId, hostPlayer]]),
      playerStates: new Map(),
      objectOwnerships: new Map(),
      objectStates: new Map(),
      puzzleState: createInitialPuzzleState(levelId, now),
    };

    this.rooms.set(roomId, room);
    client.roomId = roomId;
    client.lastSeq = -1;

    this.send(client, {
      type: 'room:state',
      room: this.serializeRoom(room),
      serverTime: now,
    });
  }

  private handleJoinRoom(
    client: ConnectedClient,
    msg: Extract<ClientToServerMessage, { type: 'room:join' }>,
    now: number,
  ): void {
    const normalizedId = normalizeRoomId(typeof msg.roomId === 'string' ? msg.roomId : '');
    if (!isValidRoomIdFormat(normalizedId)) {
      this.sendError(
        client,
        'INVALID_ROOM_ID',
        'Room ID must be 6 letters/numbers (for example: K7P4MX).',
      );
      return;
    }

    if (client.roomId) {
      if (client.roomId === normalizedId) {
        const existingRoom = this.rooms.get(normalizedId);
        if (existingRoom) {
          this.sendFullRoomSyncToClient(client, existingRoom, now);
        }
        return;
      }
      this.sendError(client, 'ALREADY_IN_ROOM', 'Leave your current room before joining another.');
      return;
    }

    const room = this.rooms.get(normalizedId);
    if (!room) {
      this.sendError(client, 'ROOM_NOT_FOUND', `Room "${normalizedId}" was not found.`);
      return;
    }
    if (room.state === 'closed') {
      this.sendError(client, 'ROOM_CLOSED', `Room "${normalizedId}" has been closed.`);
      return;
    }
    if (room.players.size >= room.maxPlayers) {
      this.sendError(
        client,
        'ROOM_FULL',
        `Room "${normalizedId}" is full (${room.players.size}/${room.maxPlayers}).`,
      );
      return;
    }

    const displayName = sanitizeDisplayName(
      typeof msg.displayName === 'string' ? msg.displayName : '',
      `Climber ${room.players.size + 1}`,
    );

    const player: NetworkPlayerInfo = {
      id: client.playerId,
      displayName,
      color: this.pickAvailableColor(room),
      isHost: false,
      spawnSlot: this.pickAvailableSpawnSlot(room),
      connectionStatus: 'connected',
      joinedAt: now,
    };

    room.players.set(client.playerId, player);
    client.roomId = room.roomId;
    client.lastSeq = -1;

    // Send full room membership, existing characters, networked physics objects & cooperative puzzle state
    this.sendFullRoomSyncToClient(client, room, now);

    // Notify everyone else in the room about the newly joined player
    const serialized = this.serializeRoom(room);
    this.broadcastToRoom(
      room,
      {
        type: 'room:player_joined',
        player,
        room: serialized,
        serverTime: now,
      },
      client.playerId,
    );
  }

  private sendFullRoomSyncToClient(
    client: ConnectedClient,
    room: InternalRoom,
    now: number,
  ): void {
    this.send(client, {
      type: 'room:state',
      room: this.serializeRoom(room),
      serverTime: now,
    });

    if (room.playerStates.size > 0) {
      this.send(client, {
        type: 'players:sync_all',
        states: Array.from(room.playerStates.values()),
        serverTime: now,
      });
    }

    if (room.objectStates.size > 0 || room.objectOwnerships.size > 0) {
      this.send(client, {
        type: 'physics:sync_all',
        levelId: room.levelId,
        objects: Array.from(room.objectStates.values()),
        ownerships: Array.from(room.objectOwnerships.values()).map(serializeOwnership),
        serverTime: now,
      });
    }

    this.send(client, {
      type: 'puzzle:state',
      state: { ...room.puzzleState, serverTime: now },
    });
  }

  private handleReconnectRoom(
    client: ConnectedClient,
    msg: Extract<ClientToServerMessage, { type: 'room:reconnect' }>,
    now: number,
  ): void {
    const normalizedId = normalizeRoomId(typeof msg.roomId === 'string' ? msg.roomId : '');
    if (!isValidRoomIdFormat(normalizedId)) {
      this.sendError(client, 'INVALID_ROOM_ID', 'Invalid room ID for reconnect.');
      return;
    }
    const room = this.rooms.get(normalizedId);
    if (!room || room.state === 'closed') {
      this.sendError(client, 'ROOM_NOT_FOUND', `Room "${normalizedId}" is no longer available.`);
      return;
    }

    // Clean up any stale ghost player entry & release any objects held by the dropped socket
    if (typeof msg.previousPlayerId === 'string' && room.players.has(msg.previousPlayerId)) {
      const staleSocket = this.clients.get(msg.previousPlayerId);
      if (!staleSocket || staleSocket.socket.readyState !== WebSocket.OPEN) {
        room.players.delete(msg.previousPlayerId);
        room.playerStates.delete(msg.previousPlayerId);
        this.releaseAllObjectsForPlayer(room, msg.previousPlayerId, now);
      }
    }

    this.handleJoinRoom(
      client,
      {
        type: 'room:join',
        roomId: normalizedId,
        displayName: msg.displayName,
      },
      now,
    );
  }

  private resetRoomWorldState(room: InternalRoom, levelId: LevelId, now: number): void {
    room.objectOwnerships.clear();
    room.objectStates.clear();
    room.puzzleState = createInitialPuzzleState(levelId, now);
  }

  private handleSetLevel(
    client: ConnectedClient,
    msg: Extract<ClientToServerMessage, { type: 'room:set_level' }>,
    now: number,
  ): void {
    const room = this.getActiveRoomForClient(client);
    if (!room) return;

    if (room.hostId !== client.playerId) {
      this.sendError(client, 'NOT_HOST', 'Only the room host can change the world or launch.');
      return;
    }
    if (typeof msg.levelId !== 'string' || !VALID_LEVEL_IDS.has(msg.levelId as LevelId)) {
      this.sendError(client, 'INVALID_PAYLOAD', 'Invalid level ID.');
      return;
    }

    const levelChanged = room.levelId !== msg.levelId;
    room.levelId = msg.levelId;
    if (msg.startGame) {
      room.state = 'in-game';
    }
    if (levelChanged || msg.startGame) {
      room.playerStates.clear();
      this.resetRoomWorldState(room, msg.levelId, now);
    }

    const serialized = this.serializeRoom(room);
    this.broadcastToRoom(room, {
      type: 'room:state',
      room: serialized,
      serverTime: now,
    });
  }

  private handleRestartLevel(client: ConnectedClient, now: number): void {
    const room = this.getActiveRoomForClient(client);
    if (!room) return;
    if (room.hostId !== client.playerId) {
      this.sendError(client, 'NOT_HOST', 'Only the room host can restart the shared level.');
      return;
    }

    this.resetRoomWorldState(room, room.levelId, now);
    const actorName = room.players.get(client.playerId)?.displayName ?? 'Host';

    this.broadcastToRoom(room, {
      type: 'room:restarted',
      levelId: room.levelId,
      actorName,
      serverTime: now,
    });
    this.broadcastToRoom(room, {
      type: 'puzzle:state',
      state: { ...room.puzzleState, serverTime: now },
    });
    this.broadcastCoopEvent(room, {
      kind: 'restart-level',
      levelId: room.levelId,
      actorId: client.playerId,
      actorName,
      message: `${actorName} restarted the level`,
      serverTime: now,
    });
  }

  private handleResetObjects(client: ConnectedClient, now: number): void {
    const room = this.getActiveRoomForClient(client);
    if (!room) return;
    if (room.hostId !== client.playerId && room.levelId !== 'observatory') {
      this.sendError(client, 'NOT_HOST', 'Only the room host can reset puzzle objects.');
      return;
    }

    room.objectOwnerships.clear();
    room.objectStates.clear();
    const actorName = room.players.get(client.playerId)?.displayName ?? 'Host';

    this.broadcastToRoom(room, {
      type: 'room:objects_reset',
      levelId: room.levelId,
      actorName,
      serverTime: now,
    });
    this.broadcastCoopEvent(room, {
      kind: 'reset-objects',
      levelId: room.levelId,
      actorId: client.playerId,
      actorName,
      message: `${actorName} reset puzzle objects`,
      serverTime: now,
    });
  }

  private handleCloseRoom(client: ConnectedClient): void {
    const room = this.getActiveRoomForClient(client);
    if (!room) return;
    if (room.hostId !== client.playerId) {
      this.sendError(client, 'NOT_HOST', 'Only the room host can close the room.');
      return;
    }
    this.closeRoomInternal(room, 'The host closed the room.');
  }

  private handlePlayerState(
    client: ConnectedClient,
    msg: Extract<ClientToServerMessage, { type: 'player:state' }>,
    now: number,
  ): void {
    if (!client.roomId) return;
    const room = this.rooms.get(client.roomId);
    if (!room || room.state === 'closed') return;
    if (!room.players.has(client.playerId)) return;

    const claimedId =
      msg.state && typeof msg.state === 'object' && typeof msg.state.playerId === 'string'
        ? msg.state.playerId
        : '';
    if (claimedId && claimedId !== client.playerId) {
      this.sendError(
        client,
        'OWNERSHIP_VIOLATION',
        'Clients can only publish state updates for their own character.',
      );
      return;
    }

    const validated = validateCharacterPayload(msg.state, client.playerId, room.levelId, now);
    if (!validated) return;

    if (validated.seq <= client.lastSeq) return;
    client.lastSeq = validated.seq;

    if (room.state === 'lobby') {
      room.state = 'in-game';
    }

    room.playerStates.set(client.playerId, validated);

    this.broadcastToRoom(
      room,
      {
        type: 'player:state',
        state: validated,
      },
      client.playerId,
    );
  }

  // === STEP 9.3: SERVER-AUTHORITATIVE PHYSICS OWNERSHIP & SYNC ===

  private getOrCreateOwnership(
    room: InternalRoom,
    objectId: string,
    now: number,
  ): InternalObjectOwnership | null {
    let rec = room.objectOwnerships.get(objectId);
    if (!rec) {
      if (room.objectOwnerships.size >= MAX_TRACKED_OBJECTS_PER_ROOM) {
        return null;
      }
      rec = {
        objectId,
        ownerId: room.hostId,
        version: 1,
        holders: [],
        updatedAt: now,
        flightLeaseUntil: 0,
      };
      room.objectOwnerships.set(objectId, rec);
    }

    // Expire post-release flight lease automatically so host regains resting authority cleanly
    if (
      rec.holders.length === 0 &&
      rec.ownerId !== room.hostId &&
      rec.flightLeaseUntil > 0 &&
      now >= rec.flightLeaseUntil
    ) {
      rec.ownerId = room.hostId;
      rec.version += 1;
      rec.flightLeaseUntil = 0;
      rec.updatedAt = now;
    }
    return rec;
  }

  private handleGrabClaim(
    client: ConnectedClient,
    msg: Extract<ClientToServerMessage, { type: 'physics:grab_claim' }>,
    now: number,
  ): void {
    const room = this.getActiveRoomForClient(client);
    if (!room || msg.levelId !== room.levelId) return;

    const objectId = sanitizeIdentifier(msg.objectId, 48);
    if (!objectId) {
      this.sendError(client, 'INVALID_PAYLOAD', 'Invalid physics object ID.');
      return;
    }

    const side: 'left' | 'right' = msg.side === 'right' ? 'right' : 'left';
    const mode: 'carry' | 'push' | 'pull' = VALID_GRAB_MODES.has(msg.mode) ? msg.mode : 'carry';

    const rec = this.getOrCreateOwnership(room, objectId, now);
    if (!rec) return;

    const existingHolderIdx = rec.holders.findIndex(
      (h) => h.playerId === client.playerId && h.side === side,
    );
    const hadOtherPlayerBefore = rec.holders.some((h) => h.playerId !== client.playerId);

    if (existingHolderIdx >= 0) {
      rec.holders[existingHolderIdx].mode = mode;
    } else {
      rec.holders.push({ playerId: client.playerId, side, mode });
    }

    // Authority model:
    // - If NO other player is currently holding this object, the grabbing player becomes the single authoritative owner.
    // - If ANOTHER player is ALREADY holding it, they stay authoritative owner while this player joins as a cooperative helper!
    if (!hadOtherPlayerBefore) {
      if (rec.ownerId !== client.playerId) {
        rec.ownerId = client.playerId;
        rec.version += 1;
      }
      rec.flightLeaseUntil = 0;
      rec.updatedAt = now;
    } else {
      rec.updatedAt = now;
      // Broadcast cooperative grab feedback once when a second player joins an active grab
      const distinctHolders = new Set(rec.holders.map((h) => h.playerId));
      if (distinctHolders.size >= 2 && existingHolderIdx < 0) {
        const actorName = room.players.get(client.playerId)?.displayName ?? 'Partner';
        const ownerName = room.players.get(rec.ownerId)?.displayName ?? 'Host';
        this.broadcastCoopEvent(room, {
          kind: 'coop-grab',
          levelId: room.levelId,
          actorId: client.playerId,
          actorName,
          targetId: objectId,
          message: `${actorName} & ${ownerName} cooperating on heavy object`,
          serverTime: now,
        });
      }
    }

    this.broadcastToRoom(room, {
      type: 'physics:ownership',
      ownership: serializeOwnership(rec),
      serverTime: now,
    });
  }

  private handleGrabRelease(
    client: ConnectedClient,
    msg: Extract<ClientToServerMessage, { type: 'physics:grab_release' }>,
    now: number,
  ): void {
    const room = this.getActiveRoomForClient(client);
    if (!room || msg.levelId !== room.levelId) return;

    const objectId = sanitizeIdentifier(msg.objectId, 48);
    if (!objectId) return;

    const rec = room.objectOwnerships.get(objectId);
    if (!rec) return;

    const side: 'left' | 'right' = msg.side === 'right' ? 'right' : 'left';
    const beforeLen = rec.holders.length;
    rec.holders = rec.holders.filter((h) => !(h.playerId === client.playerId && h.side === side));
    if (rec.holders.length === beforeLen) return;

    // If owner released all hands on this object:
    const ownerStillHolding = rec.holders.some((h) => h.playerId === rec.ownerId);
    if (!ownerStillHolding) {
      if (rec.holders.length > 0) {
        // Transfer authority seamlessly to the remaining co-holder!
        rec.ownerId = rec.holders[0].playerId;
        rec.version += 1;
        rec.flightLeaseUntil = 0;
      } else if (msg.releasedWithMomentum && rec.ownerId !== room.hostId) {
        // Keep thrower briefly authoritative so thrown arc settles smoothly without mid-air handoff jitter
        rec.flightLeaseUntil = now + POST_RELEASE_FLIGHT_GRACE_MS;
      } else if (rec.ownerId !== room.hostId) {
        rec.ownerId = room.hostId;
        rec.version += 1;
        rec.flightLeaseUntil = 0;
      }
    }
    rec.updatedAt = now;

    this.broadcastToRoom(room, {
      type: 'physics:ownership',
      ownership: serializeOwnership(rec),
      serverTime: now,
    });
  }

  private handlePhysicsObjectsSync(
    client: ConnectedClient,
    msg: Extract<ClientToServerMessage, { type: 'physics:objects_sync' }>,
    now: number,
  ): void {
    if (!client.roomId) return;
    const room = this.rooms.get(client.roomId);
    if (!room || room.state === 'closed' || !room.players.has(client.playerId)) return;
    if (msg.levelId !== room.levelId) return;
    if (!Array.isArray(msg.objects) || msg.objects.length === 0) return;

    const batch = msg.objects.slice(0, MAX_OBJECTS_PER_BATCH);
    const accepted: PhysicsObjectSyncState[] = [];
    let rejectedOwnershipCount = 0;

    for (const rawObj of batch) {
      if (!rawObj || typeof rawObj !== 'object') continue;
      const objectId = sanitizeIdentifier((rawObj as { objectId?: unknown }).objectId, 48);
      if (!objectId) continue;

      const rec = this.getOrCreateOwnership(room, objectId, now);
      if (!rec) continue;

      // Strict server-side ownership enforcement: reject unauthorized physics publishes!
      if (rec.ownerId !== client.playerId) {
        rejectedOwnershipCount += 1;
        continue;
      }

      const validated = validatePhysicsObjectState(
        rawObj,
        rec.ownerId,
        rec.version,
        rec.holders,
        room.levelId,
        now,
      );
      if (!validated) continue;

      const prevCached = room.objectStates.get(objectId);
      if (
        prevCached &&
        prevCached.version === validated.version &&
        validated.seq <= prevCached.seq
      ) {
        continue;
      }

      // If object has come to rest during a post-release flight lease, hand resting authority back to host cleanly
      if (
        rec.holders.length === 0 &&
        rec.ownerId !== room.hostId &&
        !validated.awake &&
        rec.flightLeaseUntil > 0
      ) {
        rec.ownerId = room.hostId;
        rec.version += 1;
        rec.flightLeaseUntil = 0;
        rec.updatedAt = now;
        validated.ownerId = rec.ownerId;
        validated.version = rec.version;
        this.broadcastToRoom(room, {
          type: 'physics:ownership',
          ownership: serializeOwnership(rec),
          serverTime: now,
        });
      }

      room.objectStates.set(objectId, validated);
      accepted.push(validated);
    }

    if (rejectedOwnershipCount > 0 && accepted.length === 0) {
      this.sendError(
        client,
        'OWNERSHIP_VIOLATION',
        'Cannot publish physics state for an object owned by another player.',
      );
      return;
    }

    if (accepted.length > 0) {
      this.broadcastToRoom(
        room,
        {
          type: 'physics:objects_sync',
          levelId: room.levelId,
          objects: accepted,
          serverTime: now,
        },
        client.playerId,
      );
    }
  }

  private handleCoopForce(
    client: ConnectedClient,
    msg: Extract<ClientToServerMessage, { type: 'physics:coop_force' }>,
    now: number,
  ): void {
    if (!client.roomId) return;
    const room = this.rooms.get(client.roomId);
    if (!room || room.state === 'closed' || !room.players.has(client.playerId)) return;

    const raw = msg.payload;
    if (!raw || typeof raw !== 'object' || raw.levelId !== room.levelId) return;
    const objectId = sanitizeIdentifier(raw.objectId, 48);
    if (!objectId) return;

    const rec = room.objectOwnerships.get(objectId);
    if (!rec) return;

    // Only an active non-owner holder may send cooperative assist forces to the authoritative owner
    const isActiveHolder = rec.holders.some((h) => h.playerId === client.playerId);
    if (!isActiveHolder || rec.ownerId === client.playerId) return;

    const force = validateVec3(raw.force, MAX_COOP_FORCE_MAG);
    const worldPoint = validateVec3(raw.worldPoint, 600);
    if (!force || !worldPoint) return;

    // Clamp force magnitude cleanly so no client can launch objects into orbit
    const mag = Math.hypot(force[0], force[1], force[2]);
    if (mag > MAX_COOP_FORCE_MAG) {
      const s = MAX_COOP_FORCE_MAG / mag;
      force[0] *= s;
      force[1] *= s;
      force[2] *= s;
    }

    const ownerClient = this.clients.get(rec.ownerId);
    if (!ownerClient) return;

    const validatedPayload: CoopObjectForcePayload = {
      objectId,
      levelId: room.levelId,
      fromPlayerId: client.playerId,
      side: raw.side === 'right' ? 'right' : 'left',
      mode: VALID_GRAB_MODES.has(raw.mode) ? raw.mode : 'push',
      force,
      worldPoint,
      serverTime: now,
    };

    this.send(ownerClient, {
      type: 'physics:coop_force',
      payload: validatedPayload,
    });
  }

  private releaseAllObjectsForPlayer(room: InternalRoom, playerId: string, now: number): void {
    for (const rec of room.objectOwnerships.values()) {
      const hadHolder = rec.holders.some((h) => h.playerId === playerId);
      const wasOwner = rec.ownerId === playerId;
      if (!hadHolder && !wasOwner) continue;

      rec.holders = rec.holders.filter((h) => h.playerId !== playerId);
      if (wasOwner) {
        if (rec.holders.length > 0) {
          rec.ownerId = rec.holders[0].playerId;
        } else {
          rec.ownerId = room.hostId;
        }
        rec.version += 1;
        rec.flightLeaseUntil = 0;
      }
      rec.updatedAt = now;

      // Wake cached object state so it settles naturally under gravity when returned to host
      const cached = room.objectStates.get(rec.objectId);
      if (cached) {
        cached.ownerId = rec.ownerId;
        cached.version = rec.version;
        cached.holders = rec.holders.map((h) => ({ ...h }));
        cached.awake = true;
      }

      this.broadcastToRoom(room, {
        type: 'physics:ownership',
        ownership: serializeOwnership(rec),
        serverTime: now,
      });
    }
  }

  // === STEP 9.4: COOPERATIVE PUZZLES & SHARED PROGRESSION ===

  private handleLeverToggle(
    client: ConnectedClient,
    msg: Extract<ClientToServerMessage, { type: 'puzzle:lever_toggle' }>,
    now: number,
  ): void {
    const room = this.getActiveRoomForClient(client);
    if (!room || msg.levelId !== room.levelId) return;

    const leverId = sanitizeIdentifier(msg.leverId, 48);
    if (!leverId) return;

    const isOn = Boolean(msg.isOn);
    const label = sanitizeDisplayName(typeof msg.label === 'string' ? msg.label : 'Switch', 'Switch');
    const actorName = room.players.get(client.playerId)?.displayName ?? 'Climber';

    const existing = room.puzzleState.levers.find((l) => l.id === leverId);
    if (existing) {
      existing.isOn = isOn;
    } else if (room.puzzleState.levers.length < 32) {
      room.puzzleState.levers.push({ id: leverId, isOn });
    }
    room.puzzleState.serverTime = now;

    this.broadcastToRoom(room, {
      type: 'puzzle:lever_toggled',
      levelId: room.levelId,
      leverId,
      isOn,
      actorId: client.playerId,
      actorName,
      label,
      serverTime: now,
    });
    this.broadcastCoopEvent(room, {
      kind: 'lever',
      levelId: room.levelId,
      actorId: client.playerId,
      actorName,
      targetId: leverId,
      message: `${actorName} ${isOn ? 'activated' : 'reset'} ${label}`,
      serverTime: now,
    });
  }

  private handleCheckpointReached(
    client: ConnectedClient,
    msg: Extract<ClientToServerMessage, { type: 'puzzle:checkpoint' }>,
    now: number,
  ): void {
    const room = this.getActiveRoomForClient(client);
    if (!room || msg.levelId !== room.levelId) return;

    const idx = Math.floor(clampFinite(msg.checkpointIndex, 1, 20, 0));
    const spawnPos = validateVec3(msg.spawnPos, 600);
    if (idx <= 0 || !spawnPos) return;

    // Monotonic shared progression: never regress checkpoint index
    if (idx <= room.puzzleState.checkpointIndex) return;

    const spawnYaw = clampFinite(msg.spawnYaw, -Math.PI * 4, Math.PI * 4, 0);
    const label = sanitizeDisplayName(
      typeof msg.label === 'string' ? msg.label : `Checkpoint ${idx}`,
      `Checkpoint ${idx}`,
    );
    const actorName = room.players.get(client.playerId)?.displayName ?? 'Climber';

    room.puzzleState.checkpointIndex = idx;
    room.puzzleState.checkpointSpawnPos = spawnPos;
    room.puzzleState.checkpointSpawnYaw = spawnYaw;
    room.puzzleState.serverTime = now;

    this.broadcastToRoom(room, {
      type: 'puzzle:state',
      state: { ...room.puzzleState, serverTime: now },
    });
    this.broadcastCoopEvent(room, {
      kind: 'checkpoint',
      levelId: room.levelId,
      actorId: client.playerId,
      actorName,
      message: `${actorName} unlocked ${label}`,
      serverTime: now,
    });
  }

  private handleRelicCollected(
    client: ConnectedClient,
    msg: Extract<ClientToServerMessage, { type: 'puzzle:relic' }>,
    now: number,
  ): void {
    const room = this.getActiveRoomForClient(client);
    if (!room || msg.levelId !== room.levelId) return;

    const relicId = sanitizeIdentifier(msg.relicId, 48);
    if (!relicId) return;
    if (room.puzzleState.collectedRelics.includes(relicId)) return;
    if (room.puzzleState.collectedRelics.length >= 16) return;

    const label = sanitizeDisplayName(typeof msg.label === 'string' ? msg.label : 'Relic', 'Relic');
    const actorName = room.players.get(client.playerId)?.displayName ?? 'Climber';

    room.puzzleState.collectedRelics.push(relicId);
    room.puzzleState.serverTime = now;

    this.broadcastToRoom(room, {
      type: 'puzzle:state',
      state: { ...room.puzzleState, serverTime: now },
    });
    this.broadcastCoopEvent(room, {
      kind: 'relic',
      levelId: room.levelId,
      actorId: client.playerId,
      actorName,
      targetId: relicId,
      message: `${actorName} found ${label}!`,
      serverTime: now,
    });
  }

  private handleFinishReached(
    client: ConnectedClient,
    msg: Extract<ClientToServerMessage, { type: 'puzzle:finish' }>,
    now: number,
  ): void {
    const room = this.getActiveRoomForClient(client);
    if (!room || msg.levelId !== room.levelId) return;
    if (room.puzzleState.completed) return;

    const actorName = room.players.get(client.playerId)?.displayName ?? 'Climber';
    room.puzzleState.completed = true;
    room.puzzleState.serverTime = now;

    this.broadcastToRoom(room, {
      type: 'puzzle:state',
      state: { ...room.puzzleState, serverTime: now },
    });
    this.broadcastCoopEvent(room, {
      kind: 'finish',
      levelId: room.levelId,
      actorId: client.playerId,
      actorName,
      message: `${actorName} reached the finish — world cleared!`,
      serverTime: now,
    });
  }

  private handlePuzzleHostState(
    client: ConnectedClient,
    msg: Extract<ClientToServerMessage, { type: 'puzzle:host_state' }>,
    now: number,
  ): void {
    if (!client.roomId) return;
    const room = this.rooms.get(client.roomId);
    if (!room || room.state === 'closed') return;

    if (room.hostId !== client.playerId) {
      this.sendError(client, 'NOT_HOST', 'Only the room host can publish authoritative puzzle states.');
      return;
    }

    const raw = msg.state;
    if (!raw || typeof raw !== 'object' || raw.levelId !== room.levelId) return;

    const levers: SyncedLeverState[] = [];
    if (Array.isArray(raw.levers)) {
      for (const l of raw.levers.slice(0, 32)) {
        const id = sanitizeIdentifier(l?.id, 48);
        if (id) levers.push({ id, isOn: Boolean(l.isOn) });
      }
    }

    const plates: SyncedPlateState[] = [];
    if (Array.isArray(raw.plates)) {
      for (const p of raw.plates.slice(0, 32)) {
        const id = sanitizeIdentifier(p?.id, 48);
        if (id) plates.push({ id, active: Boolean(p.active), latched: Boolean(p.latched) });
      }
    }

    const doors: SyncedDoorState[] = [];
    if (Array.isArray(raw.doors)) {
      for (const d of raw.doors.slice(0, 32)) {
        const id = sanitizeIdentifier(d?.id, 48);
        if (id) {
          doors.push({
            id,
            progress: clampFinite(d.progress, 0, 1, 0),
            wasOpen: Boolean(d.wasOpen),
          });
        }
      }
    }

    const platforms: SyncedPlatformState[] = [];
    if (Array.isArray(raw.platforms)) {
      for (const pl of raw.platforms.slice(0, 32)) {
        const id = sanitizeIdentifier(pl?.id, 48);
        if (id) {
          platforms.push({
            id,
            phase: clampFinite(pl.phase, -1e6, 1e6, 0),
            active: Boolean(pl.active),
          });
        }
      }
    }

    // Preserve monotonically advancing checkpoints/relics/completion alongside host mechanism simulation
    const incomingCp = Math.floor(clampFinite(raw.checkpointIndex, 0, 20, 0));
    if (incomingCp > room.puzzleState.checkpointIndex && raw.checkpointSpawnPos) {
      const validPos = validateVec3(raw.checkpointSpawnPos, 600);
      if (validPos) {
        room.puzzleState.checkpointIndex = incomingCp;
        room.puzzleState.checkpointSpawnPos = validPos;
        room.puzzleState.checkpointSpawnYaw = clampFinite(
          raw.checkpointSpawnYaw,
          -Math.PI * 4,
          Math.PI * 4,
          0,
        );
      }
    }

    if (Array.isArray(raw.collectedRelics)) {
      for (const r of raw.collectedRelics.slice(0, 16)) {
        const id = sanitizeIdentifier(r, 48);
        if (id && !room.puzzleState.collectedRelics.includes(id)) {
          room.puzzleState.collectedRelics.push(id);
        }
      }
    }

    if (raw.completed) {
      room.puzzleState.completed = true;
    }

    room.puzzleState.levers = levers;
    room.puzzleState.plates = plates;
    room.puzzleState.doors = doors;
    room.puzzleState.platforms = platforms;
    room.puzzleState.serverTime = now;

    this.broadcastToRoom(
      room,
      {
        type: 'puzzle:state',
        state: { ...room.puzzleState },
      },
      client.playerId,
    );
  }

  private getActiveRoomForClient(client: ConnectedClient): InternalRoom | null {
    if (!client.roomId) {
      this.sendError(client, 'NOT_IN_ROOM', 'Join or host a room first.');
      return null;
    }
    const room = this.rooms.get(client.roomId);
    if (!room || room.state === 'closed') {
      client.roomId = null;
      this.sendError(client, 'ROOM_NOT_FOUND', 'Room no longer exists.');
      return null;
    }
    return room;
  }

  private leaveCurrentRoom(client: ConnectedClient, reason: 'left' | 'disconnected'): void {
    const roomId = client.roomId;
    if (!roomId) return;

    client.roomId = null;
    client.lastSeq = -1;

    const room = this.rooms.get(roomId);
    if (!room) return;

    const wasHost = room.hostId === client.playerId;
    const now = Date.now();

    room.players.delete(client.playerId);
    room.playerStates.delete(client.playerId);

    if (wasHost) {
      this.closeRoomInternal(
        room,
        reason === 'disconnected'
          ? 'The room host disconnected.'
          : 'The host ended the multiplayer session.',
      );
      return;
    }

    // Release any physics objects held/owned by the departing player so nothing stays frozen or stuck
    this.releaseAllObjectsForPlayer(room, client.playerId, now);

    if (room.players.size === 0) {
      room.state = 'closed';
      this.rooms.delete(roomId);
      return;
    }

    const serialized = this.serializeRoom(room);
    this.broadcastToRoom(room, {
      type: 'room:player_left',
      playerId: client.playerId,
      reason,
      room: serialized,
      serverTime: now,
    });
  }

  private closeRoomInternal(room: InternalRoom, reason: string): void {
    if (room.state === 'closed') return;
    room.state = 'closed';
    const now = Date.now();

    for (const memberId of room.players.keys()) {
      const memberClient = this.clients.get(memberId);
      if (memberClient) {
        memberClient.roomId = null;
        memberClient.lastSeq = -1;
        this.send(memberClient, {
          type: 'room:closed',
          roomId: room.roomId,
          reason,
          serverTime: now,
        });
      }
    }

    room.players.clear();
    room.playerStates.clear();
    room.objectOwnerships.clear();
    room.objectStates.clear();
    this.rooms.delete(room.roomId);
  }

  private handleDisconnect(client: ConnectedClient): void {
    if (!this.clients.has(client.playerId)) return;
    this.clients.delete(client.playerId);
    this.leaveCurrentRoom(client, 'disconnected');
  }

  private generateUniqueRoomId(): string {
    for (let attempt = 0; attempt < 40; attempt++) {
      const bytes = crypto.randomBytes(6);
      let code = '';
      for (let i = 0; i < 6; i++) {
        code += ROOM_CODE_ALPHABET[bytes[i] % ROOM_CODE_ALPHABET.length];
      }
      if (!this.rooms.has(code)) {
        return code;
      }
    }
    return `W${Date.now().toString(36).toUpperCase().slice(-5)}`;
  }

  private pickAvailableColor(room: InternalRoom): string {
    const used = new Set<string>();
    for (const p of room.players.values()) {
      used.add(p.color);
    }
    for (const candidate of MULTIPLAYER_COLOR_PALETTE) {
      if (!used.has(candidate)) return candidate;
    }
    return MULTIPLAYER_COLOR_PALETTE[room.players.size % MULTIPLAYER_COLOR_PALETTE.length];
  }

  private pickAvailableSpawnSlot(room: InternalRoom): number {
    const used = new Set<number>();
    for (const p of room.players.values()) {
      used.add(p.spawnSlot);
    }
    for (let slot = 0; slot < 8; slot++) {
      if (!used.has(slot)) return slot;
    }
    return room.players.size % 8;
  }

  private serializeRoom(room: InternalRoom): NetworkRoomState {
    return {
      roomId: room.roomId,
      hostId: room.hostId,
      visibility: room.visibility,
      maxPlayers: room.maxPlayers,
      levelId: room.levelId,
      state: room.state,
      players: Array.from(room.players.values()),
      createdAt: room.createdAt,
    };
  }

  private broadcastCoopEvent(room: InternalRoom, event: CoopGameplayEvent): void {
    this.broadcastToRoom(room, {
      type: 'puzzle:event',
      event,
    });
  }

  private broadcastToRoom(
    room: InternalRoom,
    message: ServerToClientMessage,
    excludePlayerId?: string,
  ): void {
    const encoded = JSON.stringify(message);
    for (const memberId of room.players.keys()) {
      if (excludePlayerId && memberId === excludePlayerId) continue;
      const memberClient = this.clients.get(memberId);
      if (memberClient && memberClient.socket.readyState === WebSocket.OPEN) {
        memberClient.socket.send(encoded);
      }
    }
  }

  private send(client: ConnectedClient, message: ServerToClientMessage): void {
    if (client.socket.readyState !== WebSocket.OPEN) return;
    client.socket.send(JSON.stringify(message));
  }

  private sendError(client: ConnectedClient, code: NetworkErrorCode, message: string): void {
    this.send(client, {
      type: 'error',
      code,
      message,
    });
  }

  public dispose(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    const now = Date.now();
    for (const room of this.rooms.values()) {
      for (const memberId of room.players.keys()) {
        const memberClient = this.clients.get(memberId);
        if (memberClient) {
          this.send(memberClient, {
            type: 'room:closed',
            roomId: room.roomId,
            reason: 'The multiplayer server is shutting down.',
            serverTime: now,
          });
        }
      }
    }
    for (const client of this.clients.values()) {
      try {
        client.socket.close(1001, 'Server shutting down');
      } catch {
        // Ignore already-closed sockets
      }
    }
    this.clients.clear();
    this.rooms.clear();
    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }
  }
}
