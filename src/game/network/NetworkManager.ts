import type { LevelId } from '../types';
import {
  isValidRoomIdFormat,
  normalizeRoomId,
  sanitizeDisplayName,
  type CharacterSyncPayload,
  type ClientToServerMessage,
  type ConnectionState,
  type CoopGameplayEvent,
  type CoopObjectForcePayload,
  type NetworkErrorInfo,
  type NetworkPlayerInfo,
  type NetworkRoomState,
  type ObjectOwnershipRecord,
  type PhysicsObjectSyncState,
  type PublicRoomSummary,
  type PuzzleSyncSnapshot,
  type RoomVisibility,
  type ServerToClientMessage,
} from './protocol';

export type ConnectionQuality = 'good' | 'fair' | 'poor' | 'offline';

export interface NetworkSnapshot {
  connectionState: ConnectionState;
  localPlayerId: string | null;
  room: NetworkRoomState | null;
  publicRooms: PublicRoomSummary[];
  lastError: NetworkErrorInfo | null;
  lastDisconnectNotice: string | null;
  latencyMs: number | null;
  jitterMs: number;
  connectionQuality: ConnectionQuality;
  serverClockOffsetMs: number;
  reconnectAttempt: number;
}

export interface HostRoomOptions {
  displayName: string;
  visibility: RoomVisibility;
  maxPlayers: number;
  levelId: LevelId;
}

export interface JoinRoomOptions {
  roomId: string;
  displayName: string;
}

export interface NetworkManagerOptions {
  /** Optional explicit WebSocket URL (used in tests); defaults to same-origin /ws */
  wsUrl?: string;
  /** Optional WebSocket constructor override (used in Node multi-client tests) */
  WebSocketCtor?: typeof WebSocket;
  /** Optional connect timeout override in ms (defaults to 8000ms) */
  connectTimeoutMs?: number;
}

export interface LeverToggleEvent {
  levelId: LevelId;
  leverId: string;
  isOn: boolean;
  actorId: string;
  actorName: string;
  label: string;
  serverTime: number;
}

type SnapshotListener = (snapshot: NetworkSnapshot) => void;
type RemoteStateListener = (state: CharacterSyncPayload) => void;
type RoomLevelListener = (levelId: LevelId, room: NetworkRoomState) => void;
type PhysicsOwnershipListener = (ownership: ObjectOwnershipRecord, serverTime: number) => void;
type PhysicsObjectsSyncListener = (
  levelId: LevelId,
  objects: PhysicsObjectSyncState[],
  serverTime: number,
) => void;
type PhysicsSyncAllListener = (
  levelId: LevelId,
  objects: PhysicsObjectSyncState[],
  ownerships: ObjectOwnershipRecord[],
  serverTime: number,
) => void;
type CoopObjectForceListener = (payload: CoopObjectForcePayload) => void;
type PuzzleStateListener = (state: PuzzleSyncSnapshot) => void;
type LeverToggledListener = (event: LeverToggleEvent) => void;
type CoopEventListener = (event: CoopGameplayEvent) => void;
type RoomRestartedListener = (levelId: LevelId, actorName: string) => void;
type RoomObjectsResetListener = (levelId: LevelId, actorName: string) => void;
type RoomClosedListener = (reason: string) => void;

const PING_INTERVAL_MS = 4_000;
const CONNECT_TIMEOUT_DEFAULT_MS = 8_000;
const MAX_RECONNECT_ATTEMPTS = 3;

function resolveDefaultWsUrl(): string {
  if (typeof window === 'undefined') {
    return 'ws://127.0.0.1:3000/ws';
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws`;
}

function deriveConnectionQuality(
  state: ConnectionState,
  latencyMs: number | null,
  jitterMs: number,
): ConnectionQuality {
  if (state !== 'connected') return 'offline';
  if (latencyMs === null) return 'good';
  if (latencyMs <= 95 && jitterMs <= 30) return 'good';
  if (latencyMs <= 210 && jitterMs <= 75) return 'fair';
  return 'poor';
}

export class NetworkManager {
  private readonly wsUrl: string;
  private readonly WebSocketCtor: typeof WebSocket;
  private readonly connectTimeoutMs: number;

  private socket: WebSocket | null = null;
  private connectPromise: Promise<void> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connectTimeoutTimer: ReturnType<typeof setTimeout> | null = null;

  private snapshot: NetworkSnapshot = {
    connectionState: 'disconnected',
    localPlayerId: null,
    room: null,
    publicRooms: [],
    lastError: null,
    lastDisconnectNotice: null,
    latencyMs: null,
    jitterMs: 0,
    connectionQuality: 'offline',
    serverClockOffsetMs: 0,
    reconnectAttempt: 0,
  };

  private readonly snapshotListeners = new Set<SnapshotListener>();
  private readonly remoteStateListeners = new Set<RemoteStateListener>();
  private readonly roomLevelListeners = new Set<RoomLevelListener>();
  private readonly physicsOwnershipListeners = new Set<PhysicsOwnershipListener>();
  private readonly physicsObjectsSyncListeners = new Set<PhysicsObjectsSyncListener>();
  private readonly physicsSyncAllListeners = new Set<PhysicsSyncAllListener>();
  private readonly coopForceListeners = new Set<CoopObjectForceListener>();
  private readonly puzzleStateListeners = new Set<PuzzleStateListener>();
  private readonly leverToggledListeners = new Set<LeverToggledListener>();
  private readonly coopEventListeners = new Set<CoopEventListener>();
  private readonly roomRestartedListeners = new Set<RoomRestartedListener>();
  private readonly roomObjectsResetListeners = new Set<RoomObjectsResetListener>();
  private readonly roomClosedListeners = new Set<RoomClosedListener>();

  private lastRoomIdForReconnect: string | null = null;
  private lastDisplayName = 'Explorer';
  private lastWasHost = false;
  private intentionalDisconnect = false;
  private reconnectAttempts = 0;
  private lastRttSampleMs: number | null = null;
  private disposed = false;

  constructor(options: NetworkManagerOptions = {}) {
    this.wsUrl = options.wsUrl ?? resolveDefaultWsUrl();
    this.WebSocketCtor = options.WebSocketCtor ?? WebSocket;
    this.connectTimeoutMs = options.connectTimeoutMs ?? CONNECT_TIMEOUT_DEFAULT_MS;
  }

  public getSnapshot(): NetworkSnapshot {
    return this.snapshot;
  }

  public getLocalPlayer(): NetworkPlayerInfo | null {
    if (!this.snapshot.room || !this.snapshot.localPlayerId) return null;
    return (
      this.snapshot.room.players.find((p) => p.id === this.snapshot.localPlayerId) ?? null
    );
  }

  public isHost(): boolean {
    return Boolean(
      this.snapshot.room &&
        this.snapshot.localPlayerId &&
        this.snapshot.room.hostId === this.snapshot.localPlayerId,
    );
  }

  public subscribe(listener: SnapshotListener): () => void {
    this.snapshotListeners.add(listener);
    listener(this.snapshot);
    return () => {
      this.snapshotListeners.delete(listener);
    };
  }

  public onRemoteCharacterState(listener: RemoteStateListener): () => void {
    this.remoteStateListeners.add(listener);
    return () => {
      this.remoteStateListeners.delete(listener);
    };
  }

  public onRoomLevelSync(listener: RoomLevelListener): () => void {
    this.roomLevelListeners.add(listener);
    return () => {
      this.roomLevelListeners.delete(listener);
    };
  }

  public onPhysicsOwnership(listener: PhysicsOwnershipListener): () => void {
    this.physicsOwnershipListeners.add(listener);
    return () => {
      this.physicsOwnershipListeners.delete(listener);
    };
  }

  public onPhysicsObjectsSync(listener: PhysicsObjectsSyncListener): () => void {
    this.physicsObjectsSyncListeners.add(listener);
    return () => {
      this.physicsObjectsSyncListeners.delete(listener);
    };
  }

  public onPhysicsSyncAll(listener: PhysicsSyncAllListener): () => void {
    this.physicsSyncAllListeners.add(listener);
    return () => {
      this.physicsSyncAllListeners.delete(listener);
    };
  }

  public onCoopObjectForce(listener: CoopObjectForceListener): () => void {
    this.coopForceListeners.add(listener);
    return () => {
      this.coopForceListeners.delete(listener);
    };
  }

  public onPuzzleState(listener: PuzzleStateListener): () => void {
    this.puzzleStateListeners.add(listener);
    return () => {
      this.puzzleStateListeners.delete(listener);
    };
  }

  public onLeverToggled(listener: LeverToggledListener): () => void {
    this.leverToggledListeners.add(listener);
    return () => {
      this.leverToggledListeners.delete(listener);
    };
  }

  public onCoopEvent(listener: CoopEventListener): () => void {
    this.coopEventListeners.add(listener);
    return () => {
      this.coopEventListeners.delete(listener);
    };
  }

  public onRoomRestarted(listener: RoomRestartedListener): () => void {
    this.roomRestartedListeners.add(listener);
    return () => {
      this.roomRestartedListeners.delete(listener);
    };
  }

  public onRoomObjectsReset(listener: RoomObjectsResetListener): () => void {
    this.roomObjectsResetListeners.add(listener);
    return () => {
      this.roomObjectsResetListeners.delete(listener);
    };
  }

  public onRoomClosed(listener: RoomClosedListener): () => void {
    this.roomClosedListeners.add(listener);
    return () => {
      this.roomClosedListeners.delete(listener);
    };
  }

  public clearError(): void {
    if (!this.snapshot.lastError && !this.snapshot.lastDisconnectNotice) return;
    this.updateSnapshot({ lastError: null, lastDisconnectNotice: null });
  }

  public async connect(): Promise<void> {
    if (this.disposed) {
      throw new Error('NetworkManager has been disposed.');
    }
    if (this.socket && this.socket.readyState === WebSocket.OPEN && this.snapshot.localPlayerId) {
      return;
    }
    if (this.connectPromise) {
      return this.connectPromise;
    }

    this.intentionalDisconnect = false;
    this.clearReconnectTimer();
    this.clearConnectTimeout();
    this.updateSnapshot({
      connectionState: this.reconnectAttempts > 0 ? 'reconnecting' : 'connecting',
      connectionQuality: 'offline',
      lastError: null,
      reconnectAttempt: this.reconnectAttempts,
    });

    this.connectPromise = new Promise<void>((resolve, reject) => {
      let settled = false;
      let ws: WebSocket;
      try {
        ws = new this.WebSocketCtor(this.wsUrl);
      } catch {
        this.connectPromise = null;
        this.updateSnapshot({
          connectionState: 'failed',
          connectionQuality: 'offline',
          lastError: {
            code: 'CONNECTION_FAILED',
            message: 'Unable to open a WebSocket connection to the multiplayer server.',
          },
        });
        reject(new Error('WebSocket initialization failed'));
        return;
      }

      this.socket = ws;

      // Guard against hanging connections or unreachable servers
      this.connectTimeoutTimer = setTimeout(() => {
        if (settled) return;
        settled = true;
        this.connectPromise = null;
        try {
          ws.close(4000, 'Connection timeout');
        } catch {
          // Ignore close errors
        }
        if (this.socket === ws) {
          this.socket = null;
        }
        this.updateSnapshot({
          connectionState: 'failed',
          connectionQuality: 'offline',
          lastError: {
            code: 'CONNECTION_TIMEOUT',
            message: 'Timed out connecting to the multiplayer server. Please try again.',
          },
        });
        reject(new Error('Connection timed out'));
      }, this.connectTimeoutMs);

      const handleOpen = () => {
        this.reconnectAttempts = 0;
        this.startHeartbeat();
        // Immediate RTT measurement right after connecting
        this.sendMessage({ type: 'ping', clientTime: Date.now() });
      };

      const handleMessage = (event: MessageEvent) => {
        const raw = typeof event.data === 'string' ? event.data : String(event.data ?? '');
        let msg: ServerToClientMessage;
        try {
          msg = JSON.parse(raw) as ServerToClientMessage;
        } catch {
          return;
        }

        if (msg.type === 'session:welcome' && !settled) {
          settled = true;
          this.clearConnectTimeout();
          this.connectPromise = null;
          this.handleServerMessage(msg);
          resolve();
          return;
        }
        this.handleServerMessage(msg);
      };

      const handleError = () => {
        if (!settled) {
          settled = true;
          this.clearConnectTimeout();
          this.connectPromise = null;
          this.updateSnapshot({
            connectionState: 'failed',
            connectionQuality: 'offline',
            lastError: {
              code: 'CONNECTION_FAILED',
              message: 'Could not reach the multiplayer server. Please try again.',
            },
          });
          reject(new Error('Multiplayer server unreachable'));
        }
      };

      const handleClose = () => {
        this.clearConnectTimeout();
        this.stopHeartbeat();
        if (this.socket === ws) {
          this.socket = null;
        }

        if (!settled) {
          settled = true;
          this.connectPromise = null;
          this.updateSnapshot({
            connectionState: this.intentionalDisconnect ? 'disconnected' : 'failed',
            connectionQuality: 'offline',
            localPlayerId: null,
            room: null,
          });
          reject(new Error('Connection closed before handshake completed'));
          return;
        }

        if (this.intentionalDisconnect || this.disposed) {
          this.updateSnapshot({
            connectionState: 'disconnected',
            connectionQuality: 'offline',
            localPlayerId: null,
            room: null,
            latencyMs: null,
            jitterMs: 0,
            reconnectAttempt: 0,
          });
          return;
        }

        // Attempt automatic reconnection if dropped unexpectedly while in a guest room
        if (
          this.lastRoomIdForReconnect &&
          !this.lastWasHost &&
          this.reconnectAttempts < MAX_RECONNECT_ATTEMPTS
        ) {
          this.scheduleReconnect();
        } else {
          const hadRoom = Boolean(this.snapshot.room || this.lastRoomIdForReconnect);
          const wasHost = this.lastWasHost;
          this.lastRoomIdForReconnect = null;
          this.lastWasHost = false;
          const notice = wasHost
            ? 'Connection to the server was lost. Your hosted room was closed.'
            : hadRoom
              ? 'Disconnected from the multiplayer room. You can continue playing solo or rejoin.'
              : 'Lost connection to the multiplayer server.';
          this.updateSnapshot({
            connectionState: 'disconnected',
            connectionQuality: 'offline',
            localPlayerId: null,
            room: null,
            latencyMs: null,
            jitterMs: 0,
            reconnectAttempt: 0,
            lastDisconnectNotice: hadRoom ? notice : null,
            lastError: {
              code: 'CONNECTION_FAILED',
              message: notice,
            },
          });
        }
      };

      ws.addEventListener('open', handleOpen);
      ws.addEventListener('message', handleMessage);
      ws.addEventListener('error', handleError);
      ws.addEventListener('close', handleClose);
    });

    return this.connectPromise;
  }

  public async hostRoom(options: HostRoomOptions): Promise<void> {
    this.clearError();
    const displayName = sanitizeDisplayName(options.displayName, 'Host');
    this.lastDisplayName = displayName;
    await this.connect();
    this.sendMessage({
      type: 'room:create',
      displayName,
      visibility: options.visibility,
      maxPlayers: Math.min(8, Math.max(2, Math.round(options.maxPlayers))),
      levelId: options.levelId,
    });
  }

  public async joinRoom(options: JoinRoomOptions): Promise<void> {
    this.clearError();
    const normalized = normalizeRoomId(options.roomId);
    if (!isValidRoomIdFormat(normalized)) {
      this.updateSnapshot({
        lastError: {
          code: 'INVALID_ROOM_ID',
          message: 'Room ID must be 6 letters/numbers (for example: K7P4MX).',
        },
      });
      return;
    }

    const displayName = sanitizeDisplayName(options.displayName, 'Explorer');
    this.lastDisplayName = displayName;
    await this.connect();
    this.sendMessage({
      type: 'room:join',
      roomId: normalized,
      displayName,
    });
  }

  public async refreshPublicRooms(): Promise<void> {
    this.clearError();
    await this.connect();
    this.sendMessage({ type: 'room:list' });
  }

  public setRoomLevel(levelId: LevelId, startGame = false): void {
    if (!this.snapshot.room || !this.isHost()) return;
    this.sendMessage({
      type: 'room:set_level',
      levelId,
      startGame,
    });
  }

  public restartRoomLevel(): void {
    if (!this.snapshot.room || !this.isHost()) return;
    this.sendMessage({ type: 'room:restart_level' });
  }

  public resetRoomObjects(): void {
    if (!this.snapshot.room) return;
    this.sendMessage({ type: 'room:reset_objects' });
  }

  public leaveRoom(): void {
    this.lastRoomIdForReconnect = null;
    this.lastWasHost = false;
    if (this.socket && this.socket.readyState === WebSocket.OPEN && this.snapshot.room) {
      this.sendMessage({ type: 'room:leave' });
    }
    this.updateSnapshot({
      room: null,
      lastError: null,
      lastDisconnectNotice: null,
    });
  }

  public closeRoom(): void {
    if (!this.snapshot.room || !this.isHost()) return;
    this.lastRoomIdForReconnect = null;
    this.lastWasHost = false;
    this.sendMessage({ type: 'room:close' });
  }

  public sendLocalCharacterState(state: CharacterSyncPayload): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    if (!this.snapshot.room || !this.snapshot.localPlayerId) return;
    state.playerId = this.snapshot.localPlayerId;
    this.sendMessage({
      type: 'player:state',
      state,
    });
  }

  // === STEP 9.3: NETWORKED PHYSICS & GRABBING SENDERS ===

  public sendGrabClaim(
    objectId: string,
    levelId: LevelId,
    side: 'left' | 'right',
    mode: 'carry' | 'push' | 'pull',
  ): void {
    if (!this.snapshot.room) return;
    this.sendMessage({
      type: 'physics:grab_claim',
      objectId,
      levelId,
      side,
      mode,
    });
  }

  public sendGrabRelease(
    objectId: string,
    levelId: LevelId,
    side: 'left' | 'right',
    releasedWithMomentum = false,
  ): void {
    if (!this.snapshot.room) return;
    this.sendMessage({
      type: 'physics:grab_release',
      objectId,
      levelId,
      side,
      releasedWithMomentum,
    });
  }

  public sendPhysicsObjectsSync(levelId: LevelId, objects: PhysicsObjectSyncState[]): void {
    if (!this.snapshot.room || objects.length === 0) return;
    this.sendMessage({
      type: 'physics:objects_sync',
      levelId,
      objects,
    });
  }

  public sendCoopObjectForce(payload: CoopObjectForcePayload): void {
    if (!this.snapshot.room || !this.snapshot.localPlayerId) return;
    payload.fromPlayerId = this.snapshot.localPlayerId;
    this.sendMessage({
      type: 'physics:coop_force',
      payload,
    });
  }

  // === STEP 9.4: COOPERATIVE PUZZLES & SHARED PROGRESSION SENDERS ===

  public sendLeverToggle(
    levelId: LevelId,
    leverId: string,
    isOn: boolean,
    label: string,
  ): void {
    if (!this.snapshot.room) return;
    this.sendMessage({
      type: 'puzzle:lever_toggle',
      levelId,
      leverId,
      isOn,
      label,
    });
  }

  public sendCheckpointReached(
    levelId: LevelId,
    checkpointIndex: number,
    spawnPos: [number, number, number],
    spawnYaw: number,
    label: string,
  ): void {
    if (!this.snapshot.room) return;
    this.sendMessage({
      type: 'puzzle:checkpoint',
      levelId,
      checkpointIndex,
      spawnPos,
      spawnYaw,
      label,
    });
  }

  public sendRelicCollected(levelId: LevelId, relicId: string, label: string): void {
    if (!this.snapshot.room) return;
    this.sendMessage({
      type: 'puzzle:relic',
      levelId,
      relicId,
      label,
    });
  }

  public sendFinishReached(levelId: LevelId): void {
    if (!this.snapshot.room) return;
    this.sendMessage({
      type: 'puzzle:finish',
      levelId,
    });
  }

  public sendHostPuzzleState(state: PuzzleSyncSnapshot): void {
    if (!this.snapshot.room || !this.isHost()) return;
    this.sendMessage({
      type: 'puzzle:host_state',
      state,
    });
  }

  public disconnect(): void {
    this.intentionalDisconnect = true;
    this.lastRoomIdForReconnect = null;
    this.lastWasHost = false;
    this.clearReconnectTimer();
    this.clearConnectTimeout();
    this.stopHeartbeat();
    this.connectPromise = null;

    if (this.socket) {
      const ws = this.socket;
      this.socket = null;
      this.updateSnapshot({
        connectionState: 'disconnecting',
        connectionQuality: 'offline',
      });
      try {
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.close(1000, 'Client disconnected');
        }
      } catch {
        // Ignore close errors
      }
    }

    this.updateSnapshot({
      connectionState: 'disconnected',
      connectionQuality: 'offline',
      localPlayerId: null,
      room: null,
      latencyMs: null,
      jitterMs: 0,
      reconnectAttempt: 0,
    });
  }

  public dispose(): void {
    this.disposed = true;
    this.disconnect();
    this.snapshotListeners.clear();
    this.remoteStateListeners.clear();
    this.roomLevelListeners.clear();
    this.physicsOwnershipListeners.clear();
    this.physicsObjectsSyncListeners.clear();
    this.physicsSyncAllListeners.clear();
    this.coopForceListeners.clear();
    this.puzzleStateListeners.clear();
    this.leverToggledListeners.clear();
    this.coopEventListeners.clear();
    this.roomRestartedListeners.clear();
    this.roomObjectsResetListeners.clear();
    this.roomClosedListeners.clear();
  }

  private scheduleReconnect(): void {
    this.reconnectAttempts += 1;
    const delayMs = Math.min(4000, 600 * Math.pow(2, this.reconnectAttempts - 1));
    const roomToRejoin = this.lastRoomIdForReconnect;
    const previousId = this.snapshot.localPlayerId ?? '';

    this.updateSnapshot({
      connectionState: 'reconnecting',
      connectionQuality: 'offline',
      reconnectAttempt: this.reconnectAttempts,
      lastError: null,
    });

    this.reconnectTimer = setTimeout(() => {
      if (this.disposed || this.intentionalDisconnect || !roomToRejoin) return;
      this.connect()
        .then(() => {
          this.sendMessage({
            type: 'room:reconnect',
            roomId: roomToRejoin,
            previousPlayerId: previousId,
            displayName: this.lastDisplayName,
          });
        })
        .catch(() => {
          if (this.reconnectAttempts < MAX_RECONNECT_ATTEMPTS && !this.disposed) {
            this.scheduleReconnect();
          } else {
            this.lastRoomIdForReconnect = null;
            const msg =
              'Could not reconnect to the multiplayer session. You can continue solo or rejoin.';
            this.updateSnapshot({
              connectionState: 'failed',
              connectionQuality: 'offline',
              room: null,
              reconnectAttempt: 0,
              lastDisconnectNotice: msg,
              lastError: {
                code: 'CONNECTION_FAILED',
                message: msg,
              },
            });
          }
        });
    }, delayMs);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private clearConnectTimeout(): void {
    if (this.connectTimeoutTimer) {
      clearTimeout(this.connectTimeoutTimer);
      this.connectTimeoutTimer = null;
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.pingTimer = setInterval(() => {
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        this.sendMessage({ type: 'ping', clientTime: Date.now() });
      }
    }, PING_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private sendMessage(message: ClientToServerMessage): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    this.socket.send(JSON.stringify(message));
  }

  private handleServerMessage(msg: ServerToClientMessage): void {
    switch (msg.type) {
      case 'session:welcome': {
        const offset = msg.serverTime - Date.now();
        this.updateSnapshot({
          connectionState: 'connected',
          connectionQuality: deriveConnectionQuality('connected', this.snapshot.latencyMs, this.snapshot.jitterMs),
          localPlayerId: msg.playerId,
          serverClockOffsetMs: offset,
          lastError: null,
          reconnectAttempt: 0,
        });
        break;
      }

      case 'room:state': {
        const prevRoom = this.snapshot.room;
        const levelChanged =
          !prevRoom ||
          prevRoom.roomId !== msg.room.roomId ||
          prevRoom.levelId !== msg.room.levelId ||
          (prevRoom.state !== 'in-game' && msg.room.state === 'in-game');

        this.lastRoomIdForReconnect = msg.room.roomId;
        this.lastWasHost = msg.room.hostId === this.snapshot.localPlayerId;
        this.updateSnapshot({
          room: msg.room,
          lastError: null,
          lastDisconnectNotice: null,
        });

        if (levelChanged && msg.room.state === 'in-game') {
          for (const listener of this.roomLevelListeners) {
            listener(msg.room.levelId, msg.room);
          }
        }
        break;
      }

      case 'room:player_joined': {
        this.updateSnapshot({
          room: msg.room,
        });
        break;
      }

      case 'room:player_left': {
        this.updateSnapshot({
          room: msg.room,
        });
        break;
      }

      case 'room:closed': {
        this.lastRoomIdForReconnect = null;
        this.lastWasHost = false;
        const reason = msg.reason || 'Room was closed.';
        this.updateSnapshot({
          room: null,
          lastDisconnectNotice: reason,
          lastError: {
            code: 'ROOM_CLOSED',
            message: reason,
          },
        });
        for (const listener of this.roomClosedListeners) {
          listener(reason);
        }
        break;
      }

      case 'room:restarted': {
        for (const listener of this.roomRestartedListeners) {
          listener(msg.levelId, msg.actorName);
        }
        break;
      }

      case 'room:objects_reset': {
        for (const listener of this.roomObjectsResetListeners) {
          listener(msg.levelId, msg.actorName);
        }
        break;
      }

      case 'room:list_result': {
        this.updateSnapshot({
          publicRooms: msg.rooms,
        });
        break;
      }

      case 'player:state': {
        if (msg.state.playerId === this.snapshot.localPlayerId) return;
        for (const listener of this.remoteStateListeners) {
          listener(msg.state);
        }
        break;
      }

      case 'players:sync_all': {
        for (const state of msg.states) {
          if (state.playerId === this.snapshot.localPlayerId) continue;
          for (const listener of this.remoteStateListeners) {
            listener(state);
          }
        }
        break;
      }

      case 'physics:ownership': {
        for (const listener of this.physicsOwnershipListeners) {
          listener(msg.ownership, msg.serverTime);
        }
        break;
      }

      case 'physics:objects_sync': {
        for (const listener of this.physicsObjectsSyncListeners) {
          listener(msg.levelId, msg.objects, msg.serverTime);
        }
        break;
      }

      case 'physics:sync_all': {
        for (const listener of this.physicsSyncAllListeners) {
          listener(msg.levelId, msg.objects, msg.ownerships, msg.serverTime);
        }
        break;
      }

      case 'physics:coop_force': {
        for (const listener of this.coopForceListeners) {
          listener(msg.payload);
        }
        break;
      }

      case 'puzzle:state': {
        for (const listener of this.puzzleStateListeners) {
          listener(msg.state);
        }
        break;
      }

      case 'puzzle:lever_toggled': {
        const evt: LeverToggleEvent = {
          levelId: msg.levelId,
          leverId: msg.leverId,
          isOn: msg.isOn,
          actorId: msg.actorId,
          actorName: msg.actorName,
          label: msg.label,
          serverTime: msg.serverTime,
        };
        for (const listener of this.leverToggledListeners) {
          listener(evt);
        }
        break;
      }

      case 'puzzle:event': {
        for (const listener of this.coopEventListeners) {
          listener(msg.event);
        }
        break;
      }

      case 'error': {
        this.updateSnapshot({
          lastError: {
            code: msg.code,
            message: msg.message,
          },
        });
        break;
      }

      case 'pong': {
        const now = Date.now();
        const rtt = Math.max(0, now - msg.clientTime);
        const estimatedServerNow = msg.serverTime + rtt * 0.5;
        const measuredOffset = estimatedServerNow - now;
        const smoothedOffset =
          this.snapshot.latencyMs === null
            ? measuredOffset
            : this.snapshot.serverClockOffsetMs * 0.8 + measuredOffset * 0.2;

        // Exponentially smoothed RTT jitter (RFC 3550-inspired estimator)
        const nextJitter =
          this.lastRttSampleMs === null
            ? 0
            : this.snapshot.jitterMs * 0.75 + Math.abs(rtt - this.lastRttSampleMs) * 0.25;
        this.lastRttSampleMs = rtt;
        const roundedRtt = Math.round(rtt);
        const roundedJitter = Math.round(nextJitter);

        this.updateSnapshot({
          latencyMs: roundedRtt,
          jitterMs: roundedJitter,
          connectionQuality: deriveConnectionQuality(
            this.snapshot.connectionState,
            roundedRtt,
            roundedJitter,
          ),
          serverClockOffsetMs: smoothedOffset,
        });
        break;
      }
    }
  }

  private updateSnapshot(patch: Partial<NetworkSnapshot>): void {
    this.snapshot = {
      ...this.snapshot,
      ...patch,
    };
    for (const listener of this.snapshotListeners) {
      listener(this.snapshot);
    }
  }
}

