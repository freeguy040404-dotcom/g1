import { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Check,
  Copy,
  Crown,
  Globe,
  Lock,
  LogOut,
  Plus,
  RefreshCw,
  Trash2,
  Users,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import type {
  CampaignProgress,
  LevelId,
  MultiplayerPlayer,
  MultiplayerSession,
} from '../game/types';
import { LEVEL_CATALOG, getLevelCatalogEntry } from '../game/levels/levelCatalog';
import { isLevelUnlocked } from '../game/progress';
import type { NetworkSnapshot } from '../game/network/NetworkManager';
import type { RoomVisibility } from '../game/network/protocol';

interface MultiplayerModalProps {
  progress: CampaignProgress;
  session: MultiplayerSession;
  networkSnapshot: NetworkSnapshot;
  onHostOnlineRoom: (options: {
    displayName: string;
    visibility: RoomVisibility;
    maxPlayers: number;
    levelId: LevelId;
  }) => void;
  onJoinOnlineRoom: (options: { roomId: string; displayName: string }) => void;
  onLeaveOnlineRoom: () => void;
  onCloseOnlineRoom: () => void;
  onRefreshPublicRooms: () => void;
  onEnterOnlineWorld: (levelId: LevelId, isHost: boolean) => void;
  onChangeOnlineRoomLevel: (levelId: LevelId) => void;
  onClearNetworkError: () => void;
  onStartMultiplayer: (session: MultiplayerSession, levelId: LevelId) => void;
  onDisableMultiplayer: () => void;
  onClose: () => void;
  onUiClick: () => void;
}

const LOCAL_PLAYER_COLORS = ['#2563eb', '#ea580c', '#059669', '#7c3aed'];

function formatConnectionLabel(state: NetworkSnapshot['connectionState']): string {
  switch (state) {
    case 'connected':
      return 'Connected';
    case 'connecting':
      return 'Connecting...';
    case 'reconnecting':
      return 'Reconnecting...';
    case 'disconnecting':
      return 'Disconnecting...';
    case 'failed':
      return 'Connection Failed';
    default:
      return 'Offline';
  }
}

export function MultiplayerModal({
  progress,
  session,
  networkSnapshot,
  onHostOnlineRoom,
  onJoinOnlineRoom,
  onLeaveOnlineRoom,
  onCloseOnlineRoom,
  onRefreshPublicRooms,
  onEnterOnlineWorld,
  onChangeOnlineRoomLevel,
  onClearNetworkError,
  onStartMultiplayer,
  onDisableMultiplayer,
  onClose,
  onUiClick,
}: MultiplayerModalProps) {
  const [activeTab, setActiveTab] = useState<'online' | 'local'>('online');

  // Online multiplayer form state
  const [displayName, setDisplayName] = useState<string>(() => {
    try {
      return window.localStorage.getItem('wobblepeak.mp.name') || 'Climber';
    } catch {
      return 'Climber';
    }
  });
  const [visibility, setVisibility] = useState<RoomVisibility>('public');
  const [maxPlayers, setMaxPlayers] = useState<number>(4);
  const [onlineLevelId, setOnlineLevelId] = useState<LevelId>('dream-world');
  const [joinRoomIdInput, setJoinRoomIdInput] = useState<string>('');
  const [copiedId, setCopiedId] = useState(false);

  // Local Co-op Relay state (Step 7 preserved intact)
  const [players, setPlayers] = useState<MultiplayerPlayer[]>(() =>
    session.players.length >= 2
      ? session.players
      : [
          { id: 'p1', name: 'Player 1', color: LOCAL_PLAYER_COLORS[0], turns: 1 },
          { id: 'p2', name: 'Player 2', color: LOCAL_PLAYER_COLORS[1], turns: 0 },
        ],
  );
  const [localLevelId, setLocalLevelId] = useState<LevelId>('dream-world');

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  useEffect(() => {
    if (activeTab === 'online' && !networkSnapshot.room) {
      onRefreshPublicRooms();
    }
  }, [activeTab, networkSnapshot.room, onRefreshPublicRooms]);

  const persistName = (next: string) => {
    setDisplayName(next);
    try {
      window.localStorage.setItem('wobblepeak.mp.name', next);
    } catch {
      // Ignore storage failures
    }
  };

  const unlockedLevels = LEVEL_CATALOG.filter((entry) =>
    isLevelUnlocked(progress, entry.id),
  );

  const activeRoom = networkSnapshot.room;
  const isHost = Boolean(
    activeRoom && networkSnapshot.localPlayerId && activeRoom.hostId === networkSnapshot.localPlayerId,
  );
  const isBusy =
    networkSnapshot.connectionState === 'connecting' ||
    networkSnapshot.connectionState === 'reconnecting';

  const handleCopyRoomId = () => {
    if (!activeRoom) return;
    onUiClick();
    navigator.clipboard?.writeText(activeRoom.roomId).catch(() => {});
    setCopiedId(true);
    window.setTimeout(() => setCopiedId(false), 1800);
  };

  const handleHostSubmit = () => {
    onUiClick();
    onHostOnlineRoom({
      displayName: displayName.trim() || 'Host',
      visibility,
      maxPlayers,
      levelId: onlineLevelId,
    });
  };

  const handleJoinSubmit = (explicitRoomId?: string) => {
    onUiClick();
    onJoinOnlineRoom({
      roomId: explicitRoomId ?? joinRoomIdInput,
      displayName: displayName.trim() || 'Explorer',
    });
  };

  // Local Co-op handlers
  const handleAddLocalPlayer = () => {
    if (players.length >= 4) return;
    onUiClick();
    const idx = players.length;
    setPlayers([
      ...players,
      {
        id: `p${idx + 1}-${Date.now()}`,
        name: `Player ${idx + 1}`,
        color: LOCAL_PLAYER_COLORS[idx % LOCAL_PLAYER_COLORS.length],
        turns: 0,
      },
    ]);
  };

  const handleRemoveLocalPlayer = (id: string) => {
    if (players.length <= 2) return;
    onUiClick();
    setPlayers(players.filter((p) => p.id !== id));
  };

  const handleLocalNameChange = (id: string, nextName: string) => {
    setPlayers(players.map((p) => (p.id === id ? { ...p, name: nextName } : p)));
  };

  const handleLaunchLocal = () => {
    onUiClick();
    const cleaned = players.map((p, i) => ({
      ...p,
      name: p.name.trim() || `Player ${i + 1}`,
      turns: i === 0 ? 1 : 0,
    }));
    onStartMultiplayer(
      {
        enabled: true,
        players: cleaned,
        activePlayerIndex: 0,
      },
      localLevelId,
    );
  };

  const roomWorldEntry = activeRoom ? getLevelCatalogEntry(activeRoom.levelId) : null;

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/45 p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="multiplayer-title"
    >
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-900/12 bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-slate-900/10 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <Users className="h-5 w-5 text-blue-600" aria-hidden="true" />
            <div>
              <h2
                id="multiplayer-title"
                className="text-xl font-bold tracking-tight text-slate-950"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                Multiplayer
              </h2>
              <p className="text-xs text-slate-500">
                Real-time cooperative online rooms with synchronized physics &amp; puzzles, or local co-op relay.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              onUiClick();
              onClose();
            }}
            aria-label="Close multiplayer modal"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-900/10 bg-slate-50 text-slate-700 hover:bg-slate-100"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </header>

        {/* Mode Switcher Tabs */}
        <div className="flex items-center justify-between gap-3 border-b border-slate-900/8 bg-slate-50/75 px-6 py-2.5">
          <div className="inline-flex rounded-lg border border-slate-900/10 bg-white p-0.5">
            <button
              type="button"
              onClick={() => {
                onUiClick();
                setActiveTab('online');
              }}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                activeTab === 'online'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Online Rooms
            </button>
            <button
              type="button"
              onClick={() => {
                onUiClick();
                setActiveTab('local');
              }}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                activeTab === 'local'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Local Co-op Relay
            </button>
          </div>

          {activeTab === 'online' && (
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
              {networkSnapshot.connectionState === 'connected' ? (
                <Wifi
                  className={`h-3.5 w-3.5 ${
                    networkSnapshot.connectionQuality === 'poor'
                      ? 'text-amber-600'
                      : networkSnapshot.connectionQuality === 'fair'
                        ? 'text-sky-600'
                        : 'text-emerald-600'
                  }`}
                  aria-hidden="true"
                />
              ) : (
                <WifiOff className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
              )}
              <span>{formatConnectionLabel(networkSnapshot.connectionState)}</span>
              {networkSnapshot.latencyMs !== null &&
                networkSnapshot.connectionState === 'connected' && (
                  <span className="text-[11px] font-medium text-slate-500 tabular-nums">
                    ({networkSnapshot.latencyMs} ms · {networkSnapshot.connectionQuality})
                  </span>
                )}
            </div>
          )}
        </div>

        {/* === ONLINE MULTIPLAYER TAB === */}
        {activeTab === 'online' ? (
          <>
            <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
              {networkSnapshot.lastError && (
                <div
                  role="alert"
                  className="flex items-start justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-800"
                >
                  <div className="flex items-start gap-2">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden="true" />
                    <div>
                      <p className="font-semibold">{networkSnapshot.lastError.message}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={onClearNetworkError}
                    aria-label="Dismiss error"
                    className="rounded p-0.5 text-red-500 hover:bg-red-100 hover:text-red-700"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              )}

              {activeRoom ? (
                /* === ACTIVE ROOM LOBBY === */
                <div className="space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-900/12 bg-slate-50/90 p-4">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                        Room Code
                      </p>
                      <div className="mt-1 flex items-center gap-2">
                        <span
                          className="font-mono text-2xl font-bold tracking-[0.16em] text-slate-950"
                          data-testid="active-room-id"
                        >
                          {activeRoom.roomId}
                        </span>
                        <button
                          type="button"
                          onClick={handleCopyRoomId}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-900/12 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                        >
                          {copiedId ? (
                            <>
                              <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                              <span>Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                              <span>Copy</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-700">
                      <span className="inline-flex items-center gap-1 rounded-md border border-slate-900/10 bg-white px-2.5 py-1">
                        {activeRoom.visibility === 'private' ? (
                          <Lock className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
                        ) : (
                          <Globe className="h-3.5 w-3.5 text-blue-600" aria-hidden="true" />
                        )}
                        <span className="capitalize">{activeRoom.visibility}</span>
                      </span>
                      <span className="rounded-md border border-slate-900/10 bg-white px-2.5 py-1 tabular-nums">
                        {activeRoom.players.length} / {activeRoom.maxPlayers} Players
                      </span>
                    </div>
                  </div>

                  {/* World Selection (Host-Authoritative) */}
                  <div>
                    <div className="flex items-center justify-between">
                      <label
                        htmlFor="online-room-level"
                        className="text-xs font-semibold uppercase tracking-wider text-slate-500"
                      >
                        Shared World
                      </label>
                      {!isHost && (
                        <span className="text-[11px] font-medium text-slate-500">
                          Selected by host
                        </span>
                      )}
                    </div>
                    {isHost ? (
                      <select
                        id="online-room-level"
                        value={activeRoom.levelId}
                        onChange={(e) => onChangeOnlineRoomLevel(e.target.value as LevelId)}
                        className="mt-2 w-full rounded-xl border border-slate-900/15 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-900 focus:border-blue-600 focus:outline-none"
                      >
                        {LEVEL_CATALOG.map((entry) => (
                          <option key={entry.id} value={entry.id}>
                            {entry.isSandbox
                              ? `${entry.title} (Bonus Sandbox)`
                              : `${entry.numberLabel}. ${entry.title} — ${entry.subtitle}`}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div className="mt-2 rounded-xl border border-slate-900/10 bg-slate-50 px-3.5 py-2.5 text-sm font-semibold text-slate-900">
                        {roomWorldEntry
                          ? `${roomWorldEntry.title} — ${roomWorldEntry.subtitle}`
                          : activeRoom.levelId}
                      </div>
                    )}
                  </div>

                  {/* Connected Players Roster */}
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Connected Climbers ({activeRoom.players.length}/{activeRoom.maxPlayers})
                    </p>
                    <div className="mt-2.5 space-y-2">
                      {activeRoom.players.map((player) => {
                        const isSelf = player.id === networkSnapshot.localPlayerId;
                        return (
                          <div
                            key={player.id}
                            className="flex items-center justify-between gap-3 rounded-xl border border-slate-900/10 bg-slate-50/80 px-3.5 py-2.5"
                          >
                            <div className="flex items-center gap-2.5">
                              <span
                                className="h-3.5 w-3.5 shrink-0 rounded-full border border-slate-900/15"
                                style={{ backgroundColor: player.color }}
                                aria-hidden="true"
                              />
                              <span className="text-sm font-semibold text-slate-900">
                                {player.displayName}
                              </span>
                              {isSelf && (
                                <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold uppercase text-slate-700">
                                  You
                                </span>
                              )}
                              {player.isHost && (
                                <span className="inline-flex items-center gap-1 rounded bg-blue-600 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">
                                  <Crown className="h-2.5 w-2.5" aria-hidden="true" />
                                  Host
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] font-medium capitalize text-emerald-700">
                              {player.connectionStatus}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                /* === HOST OR JOIN ONLINE ROOM === */
                <div className="space-y-5">
                  <div>
                    <label
                      htmlFor="mp-display-name"
                      className="block text-xs font-semibold uppercase tracking-wider text-slate-500"
                    >
                      Your Climber Name
                    </label>
                    <input
                      id="mp-display-name"
                      type="text"
                      value={displayName}
                      maxLength={20}
                      onChange={(e) => persistName(e.target.value)}
                      placeholder="Enter display name"
                      className="mt-1.5 w-full rounded-xl border border-slate-900/15 bg-white px-3.5 py-2 text-sm font-semibold text-slate-900 focus:border-blue-600 focus:outline-none"
                    />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    {/* Host Game Card */}
                    <section className="flex flex-col justify-between rounded-xl border border-slate-900/12 bg-slate-50/75 p-4">
                      <div className="space-y-3">
                        <h3 className="text-sm font-bold text-slate-950">Host Game</h3>

                        <div>
                          <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                            Visibility
                          </span>
                          <div className="mt-1 grid grid-cols-2 gap-1.5">
                            <button
                              type="button"
                              onClick={() => setVisibility('public')}
                              className={`inline-flex items-center justify-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${
                                visibility === 'public'
                                  ? 'border-blue-600 bg-blue-600 text-white'
                                  : 'border-slate-900/12 bg-white text-slate-700 hover:bg-slate-100'
                              }`}
                            >
                              <Globe className="h-3.5 w-3.5" aria-hidden="true" />
                              Public
                            </button>
                            <button
                              type="button"
                              onClick={() => setVisibility('private')}
                              className={`inline-flex items-center justify-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${
                                visibility === 'private'
                                  ? 'border-slate-900 bg-slate-900 text-white'
                                  : 'border-slate-900/12 bg-white text-slate-700 hover:bg-slate-100'
                              }`}
                            >
                              <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                              Private
                            </button>
                          </div>
                        </div>

                        <div>
                          <label
                            htmlFor="mp-max-players"
                            className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500"
                          >
                            Max Players
                          </label>
                          <select
                            id="mp-max-players"
                            value={maxPlayers}
                            onChange={(e) => setMaxPlayers(Number(e.target.value))}
                            className="mt-1 w-full rounded-lg border border-slate-900/12 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-900"
                          >
                            {[2, 4, 6, 8].map((count) => (
                              <option key={count} value={count}>
                                Up to {count} Players
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label
                            htmlFor="mp-host-world"
                            className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500"
                          >
                            World
                          </label>
                          <select
                            id="mp-host-world"
                            value={onlineLevelId}
                            onChange={(e) => setOnlineLevelId(e.target.value as LevelId)}
                            className="mt-1 w-full rounded-lg border border-slate-900/12 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-900"
                          >
                            {LEVEL_CATALOG.map((entry) => (
                              <option key={entry.id} value={entry.id}>
                                {entry.title}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={handleHostSubmit}
                        className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-blue-600 disabled:opacity-50"
                      >
                        <span>Host Room</span>
                        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </section>

                    {/* Join Game Card */}
                    <section className="flex flex-col justify-between rounded-xl border border-slate-900/12 bg-slate-50/75 p-4">
                      <div className="space-y-3">
                        <h3 className="text-sm font-bold text-slate-950">Join Game</h3>

                        <div>
                          <label
                            htmlFor="mp-room-id"
                            className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500"
                          >
                            Enter Room ID
                          </label>
                          <div className="mt-1 flex gap-1.5">
                            <input
                              id="mp-room-id"
                              type="text"
                              value={joinRoomIdInput}
                              maxLength={8}
                              onChange={(e) =>
                                setJoinRoomIdInput(e.target.value.toUpperCase())
                              }
                              placeholder="e.g. K7P4MX"
                              className="w-full rounded-lg border border-slate-900/15 bg-white px-2.5 py-1.5 font-mono text-xs font-bold uppercase tracking-wider text-slate-900 focus:border-blue-600 focus:outline-none"
                            />
                            <button
                              type="button"
                              disabled={isBusy || joinRoomIdInput.trim().length === 0}
                              onClick={() => handleJoinSubmit()}
                              className="shrink-0 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                            >
                              Join
                            </button>
                          </div>
                        </div>

                        <div className="border-t border-slate-900/8 pt-2.5">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                              Open Public Rooms
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                onUiClick();
                                onRefreshPublicRooms();
                              }}
                              className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 hover:text-blue-800"
                            >
                              <RefreshCw className="h-3 w-3" aria-hidden="true" />
                              Refresh
                            </button>
                          </div>

                          <div className="mt-2 max-h-36 space-y-1.5 overflow-y-auto">
                            {networkSnapshot.publicRooms.length === 0 ? (
                              <p className="rounded-lg border border-dashed border-slate-900/12 bg-white px-2.5 py-3 text-center text-[11px] text-slate-500">
                                No public rooms open right now. Host one or enter a code.
                              </p>
                            ) : (
                              networkSnapshot.publicRooms.map((room) => (
                                <div
                                  key={room.roomId}
                                  className="flex items-center justify-between gap-2 rounded-lg border border-slate-900/10 bg-white px-2.5 py-2 text-xs"
                                >
                                  <div className="min-w-0">
                                    <p className="truncate font-semibold text-slate-900">
                                      {room.hostName}&apos;s Room
                                    </p>
                                    <p className="text-[11px] text-slate-500 tabular-nums">
                                      {room.roomId} · {room.playerCount}/{room.maxPlayers}
                                    </p>
                                  </div>
                                  <button
                                    type="button"
                                    disabled={room.playerCount >= room.maxPlayers}
                                    onClick={() => handleJoinSubmit(room.roomId)}
                                    className="shrink-0 rounded-md bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-blue-600 disabled:opacity-40"
                                  >
                                    {room.playerCount >= room.maxPlayers ? 'Full' : 'Join'}
                                  </button>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      </div>
                    </section>
                  </div>
                </div>
              )}
            </div>

            {activeRoom && (
              <footer className="flex flex-wrap items-center justify-between gap-2.5 border-t border-slate-900/10 bg-slate-50/75 px-6 py-4">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onUiClick();
                      onLeaveOnlineRoom();
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-900/12 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                  >
                    <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Leave Room</span>
                  </button>
                  {isHost && (
                    <button
                      type="button"
                      onClick={() => {
                        onUiClick();
                        onCloseOnlineRoom();
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100"
                    >
                      <span>Close Room</span>
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    onUiClick();
                    onEnterOnlineWorld(activeRoom.levelId, isHost);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-blue-600"
                >
                  <span>{isHost ? 'Launch Shared World' : 'Enter Shared World'}</span>
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </footer>
            )}
          </>
        ) : (
          /* === LOCAL CO-OP RELAY TAB (STEP 7 PRESERVED) === */
          <>
            <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
              <div>
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Climber Roster ({players.length}/4)
                  </p>
                  {players.length < 4 && (
                    <button
                      type="button"
                      onClick={handleAddLocalPlayer}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-900/12 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-800 hover:bg-slate-100"
                    >
                      <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Add Player</span>
                    </button>
                  )}
                </div>

                <div className="mt-3 space-y-2">
                  {players.map((player, idx) => (
                    <div
                      key={player.id}
                      className="flex items-center gap-3 rounded-xl border border-slate-900/10 bg-slate-50/75 px-3 py-2"
                    >
                      <span
                        className="h-3.5 w-3.5 shrink-0 rounded-full"
                        style={{ backgroundColor: player.color }}
                        aria-hidden="true"
                      />
                      <span className="w-7 text-xs font-bold text-slate-500 tabular-nums">
                        P{idx + 1}
                      </span>
                      <input
                        type="text"
                        value={player.name}
                        maxLength={20}
                        onChange={(e) => handleLocalNameChange(player.id, e.target.value)}
                        aria-label={`Player ${idx + 1} name`}
                        className="flex-1 rounded-md border border-slate-900/12 bg-white px-2.5 py-1 text-xs font-semibold text-slate-900 focus:border-blue-600 focus:outline-none"
                      />
                      {players.length > 2 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveLocalPlayer(player.id)}
                          aria-label={`Remove ${player.name}`}
                          className="rounded-md p-1.5 text-slate-400 hover:bg-slate-200/70 hover:text-red-600"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-t border-slate-900/8 pt-4">
                <label
                  htmlFor="mp-world-select"
                  className="block text-xs font-semibold uppercase tracking-wider text-slate-500"
                >
                  Starting World
                </label>
                <select
                  id="mp-world-select"
                  value={localLevelId}
                  onChange={(e) => setLocalLevelId(e.target.value as LevelId)}
                  className="mt-2 w-full rounded-xl border border-slate-900/15 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-900 focus:border-blue-600 focus:outline-none"
                >
                  {unlockedLevels.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.isSandbox
                        ? `${entry.title} (Bonus Sandbox)`
                        : `${entry.numberLabel}. ${entry.title} — ${entry.subtitle}`}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <footer className="flex flex-wrap items-center justify-between gap-2.5 border-t border-slate-900/10 bg-slate-50/75 px-6 py-4">
              {session.enabled ? (
                <button
                  type="button"
                  onClick={() => {
                    onUiClick();
                    onDisableMultiplayer();
                    onClose();
                  }}
                  className="text-xs font-semibold text-slate-600 hover:text-slate-900"
                >
                  Switch Back to Solo Mode
                </button>
              ) : (
                <span className="text-xs text-slate-500">
                  Pass-and-play relay · swap anytime with Tab
                </span>
              )}

              <button
                type="button"
                onClick={handleLaunchLocal}
                className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-blue-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
              >
                <span>Start Co-op Session</span>
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </footer>
          </>
        )}
      </div>
    </div>
  );
}
