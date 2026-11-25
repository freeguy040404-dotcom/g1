import { useEffect } from 'react';
import {
  ArrowDownToLine,
  ChevronDown,
  ChevronUp,
  Flag,
  LayoutGrid,
  Lock,
  Pause,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Unlock,
  Users,
  Wifi,
  WifiOff,
  Wind,
  X,
} from 'lucide-react';
import type {
  HandHudStatus,
  HandTargetingHudSnapshot,
  LevelRuntimeSnapshot,
  MultiplayerSession,
} from '../game/types';
import type { NetworkSnapshot } from '../game/network/NetworkManager';
import { formatDuration } from '../game/progress';
import { formatKeyCodeLabel, type GameSettings } from '../game/settings';

interface GameHudProps {
  isPointerLocked: boolean;
  isExpanded: boolean;
  handTargeting: HandTargetingHudSnapshot;
  levelState: LevelRuntimeSnapshot;
  settings: GameSettings;
  multiplayer: MultiplayerSession;
  networkSnapshot: NetworkSnapshot;
  onToggleExpanded: () => void;
  onPauseGame: () => void;
  onOpenLevelSelect: () => void;
  onOpenMultiplayer: () => void;
  onDismissNetworkNotice: () => void;
  onNextMultiplayerTurn: () => void;
  onRespawnCheckpoint: () => void;
  onRestartLevel: () => void;
  onDropFromSky: () => void;
  onNudge: () => void;
  onResetBlocks: () => void;
  onTogglePointerLock: () => void;
}

function formatHandState(status: HandHudStatus): string {
  if (status.held) {
    if (status.mode === 'climb') return 'Climbing Ledge';
    if (status.mode === 'hang') return 'Hanging on Ledge';
    if (status.mode === 'push') return 'Pushing Object';
    if (status.mode === 'pull') return 'Pulling Object';
    return 'Holding Object';
  }
  if (status.locked) {
    return status.surfaceKind === 'ledge' ? 'Ledge Ready' : 'Target Ready';
  }
  if (status.outOfReach) return 'Out of Reach';
  if (status.active) return 'Aiming';
  return 'Idle';
}

export function GameHud({
  isPointerLocked,
  isExpanded,
  handTargeting,
  levelState,
  settings,
  multiplayer,
  networkSnapshot,
  onToggleExpanded,
  onPauseGame,
  onOpenLevelSelect,
  onOpenMultiplayer,
  onDismissNetworkNotice,
  onNextMultiplayerTurn,
  onRespawnCheckpoint,
  onRestartLevel,
  onDropFromSky,
  onNudge,
  onResetBlocks,
  onTogglePointerLock,
}: GameHudProps) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;

      if (event.key === 'h' || event.key === 'H') {
        onToggleExpanded();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onToggleExpanded]);

  const kb = settings.controls.keyBindings;
  const showHints = settings.gameplay.showInteractionHints;
  const anyHandActive = handTargeting.left.active || handTargeting.right.active;
  const bothLocked = handTargeting.left.locked && handTargeting.right.locked;

  const moveKeysLabel = `${formatKeyCodeLabel(kb.forward)}${formatKeyCodeLabel(kb.left)}${formatKeyCodeLabel(kb.backward)}${formatKeyCodeLabel(kb.right)}`;
  const runKeyLabel = formatKeyCodeLabel(kb.run);
  const jumpKeyLabel = formatKeyCodeLabel(kb.jump);
  const leftGrabLabel = formatKeyCodeLabel(kb.leftGrab);
  const rightGrabLabel = formatKeyCodeLabel(kb.rightGrab);
  const interactLabel = formatKeyCodeLabel(kb.interact);
  const pauseLabel = formatKeyCodeLabel(kb.pause);

  return (
    <div className="pointer-events-none fixed inset-0 z-10 flex flex-col justify-between p-5 sm:p-6">
      {/* Top Bar: Minimal Level Name & Hints (Left) + Event Toast (Center) + Pause/Multiplayer (Right) */}
      <header className="relative flex items-start justify-between gap-4">
        <div className="pointer-events-auto max-w-md">
          <h1
            className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            {levelState.levelTitle}
          </h1>

          {levelState.isSandbox ? (
            <p className="mt-0.5 text-xs font-medium text-slate-700">
              Bonus Sandbox · Grab, Push, Pull &amp; Climb
            </p>
          ) : (
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs font-medium text-slate-800 tabular-nums">
              <span>
                Checkpoint {levelState.checkpointIndex}/{levelState.totalCheckpoints}
              </span>
              <span className="text-slate-400" aria-hidden="true">
                ·
              </span>
              <span className="inline-flex items-center gap-1">
                <Sparkles className="h-3.5 w-3.5 text-amber-600" aria-hidden="true" />
                {levelState.relicsFound}/{levelState.totalRelics} Relics
              </span>
              <span className="text-slate-400" aria-hidden="true">
                ·
              </span>
              <span>{formatDuration(levelState.elapsedSec)}</span>
            </p>
          )}

          {showHints && levelState.nearLeverLabel && (
            <p
              className="mt-1.5 text-xs font-semibold text-emerald-800"
              aria-live="polite"
            >
              Press <strong className="font-bold">{interactLabel}</strong> or Grab ·{' '}
              {levelState.nearLeverLabel}
            </p>
          )}

          {showHints && (anyHandActive || handTargeting.hoverInReach) ? (
            <div
              className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs font-medium text-slate-800"
              aria-live="polite"
            >
              {handTargeting.left.active && (
                <span
                  className={
                    handTargeting.left.held || handTargeting.left.locked
                      ? 'font-semibold text-blue-700'
                      : handTargeting.left.outOfReach
                        ? 'text-slate-600'
                        : 'text-slate-800'
                  }
                >
                  Left Hand: {formatHandState(handTargeting.left)}
                </span>
              )}
              {handTargeting.left.active && handTargeting.right.active && (
                <span className="text-slate-400" aria-hidden="true">
                  ·
                </span>
              )}
              {handTargeting.right.active && (
                <span
                  className={
                    handTargeting.right.held || handTargeting.right.locked
                      ? 'font-semibold text-orange-700'
                      : handTargeting.right.outOfReach
                        ? 'text-slate-600'
                        : 'text-slate-800'
                  }
                >
                  Right Hand: {formatHandState(handTargeting.right)}
                </span>
              )}
              {!anyHandActive && handTargeting.hoverInReach && (
                <span className="text-amber-900">
                  {handTargeting.hoverKind === 'ledge'
                    ? `Ledge in reach · Hold LMB/RMB to grab, ${jumpKeyLabel} to climb`
                    : 'Object in reach · Hold LMB/RMB to push, pull, lift, or swing'}
                </span>
              )}
            </div>
          ) : (
            showHints &&
            !levelState.nearLeverLabel && (
              <p className="mt-1 text-xs text-slate-700/90">
                {levelState.activeObjective}
              </p>
            )
          )}
        </div>

        {/* Top-Center Checkpoint / Relic / Puzzle Toast Notification */}
        {levelState.toast && (
          <div
            key={levelState.toast.id}
            role="status"
            aria-live="polite"
            className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 rounded-lg border border-slate-900/12 bg-white/95 px-4 py-2 text-xs font-semibold text-slate-900 shadow-md whitespace-nowrap"
          >
            {levelState.toast.message}
          </div>
        )}

        {/* Top-Right Pause Indicator & Optional Multiplayer Player Indicators */}
        <div className="pointer-events-auto flex flex-col items-end gap-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onOpenLevelSelect}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-900/12 bg-white/94 px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-sm transition-all duration-150 hover:bg-white hover:text-slate-950 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 whitespace-nowrap shrink-0"
            >
              <LayoutGrid className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Levels</span>
            </button>

            <button
              type="button"
              onClick={onPauseGame}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-900/15 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-all duration-150 hover:bg-blue-600 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 whitespace-nowrap shrink-0"
            >
              <Pause className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Pause</span>
              <span className="text-[10px] font-medium text-white/75">
                ({pauseLabel})
              </span>
            </button>
          </div>

          {/* Optional Online Multiplayer Room, Connection Quality & Player Roster */}
          {networkSnapshot.room && (
            <div
              aria-label="Online multiplayer room status"
              className="flex flex-wrap items-center justify-end gap-2 rounded-lg border border-slate-900/12 bg-white/94 px-3 py-1.5 text-xs shadow-sm"
            >
              <span className="inline-flex items-center gap-1.5 font-mono font-bold tracking-wider text-blue-700">
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
                  <WifiOff className="h-3.5 w-3.5 text-amber-600" aria-hidden="true" />
                )}
                <span>{networkSnapshot.room.roomId}</span>
              </span>
              {networkSnapshot.latencyMs !== null &&
                networkSnapshot.connectionState === 'connected' && (
                  <span className="text-[11px] font-medium text-slate-500 tabular-nums">
                    {networkSnapshot.latencyMs}ms
                  </span>
                )}
              <span className="text-slate-300" aria-hidden="true">
                ·
              </span>
              <div className="flex flex-wrap items-center gap-2">
                {networkSnapshot.room.players.map((p) => {
                  const isSelf = p.id === networkSnapshot.localPlayerId;
                  return (
                    <span
                      key={p.id}
                      className={`inline-flex items-center gap-1.5 ${
                        isSelf ? 'font-bold text-slate-950' : 'font-medium text-slate-700'
                      }`}
                    >
                      <span
                        className="h-2.5 w-2.5 rounded-full border border-slate-900/15"
                        style={{ backgroundColor: p.color }}
                        aria-hidden="true"
                      />
                      <span>{p.displayName}</span>
                      {p.isHost && (
                        <span className="rounded bg-blue-600 px-1 py-0.5 text-[9px] font-bold uppercase text-white">
                          Host
                        </span>
                      )}
                    </span>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={onOpenMultiplayer}
                className="ml-1 border-l border-slate-900/10 pl-2 text-[11px] font-semibold text-blue-700 hover:text-blue-800 whitespace-nowrap"
              >
                Lobby ({networkSnapshot.room.players.length}/{networkSnapshot.room.maxPlayers})
              </button>
            </div>
          )}

          {/* Reconnecting or Disconnect Recovery Banner */}
          {!networkSnapshot.room && networkSnapshot.connectionState === 'reconnecting' && (
            <div
              role="status"
              aria-live="polite"
              className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50/96 px-3 py-1.5 text-xs font-semibold text-amber-900 shadow-sm"
            >
              <WifiOff className="h-3.5 w-3.5 text-amber-600" aria-hidden="true" />
              <span>
                Reconnecting to multiplayer room (attempt {Math.max(1, networkSnapshot.reconnectAttempt)}/3)...
              </span>
            </div>
          )}

          {!networkSnapshot.room &&
            networkSnapshot.connectionState !== 'reconnecting' &&
            networkSnapshot.lastDisconnectNotice && (
              <div
                role="status"
                aria-live="polite"
                className="flex items-center gap-2 rounded-lg border border-slate-900/15 bg-white/96 px-3 py-1.5 text-xs text-slate-800 shadow-md"
              >
                <WifiOff className="h-3.5 w-3.5 shrink-0 text-amber-600" aria-hidden="true" />
                <span className="max-w-xs font-medium">{networkSnapshot.lastDisconnectNotice}</span>
                <button
                  type="button"
                  onClick={onOpenMultiplayer}
                  className="font-semibold text-blue-700 hover:text-blue-800 whitespace-nowrap"
                >
                  Rejoin
                </button>
                <button
                  type="button"
                  onClick={onDismissNetworkNotice}
                  aria-label="Dismiss network notice"
                  className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            )}

          {/* Optional Local Co-op Relay Player Indicators */}
          {!networkSnapshot.room && multiplayer.enabled && multiplayer.players.length > 0 && (
            <div
              aria-label="Active multiplayer roster"
              className="flex items-center gap-2 rounded-lg border border-slate-900/12 bg-white/94 px-3 py-1.5 text-xs shadow-sm"
            >
              <Users className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
              <div className="flex items-center gap-2">
                {multiplayer.players.map((player, idx) => {
                  const isActive = idx === multiplayer.activePlayerIndex;
                  return (
                    <span
                      key={player.id}
                      className={`inline-flex items-center gap-1.5 transition-opacity ${
                        isActive ? 'font-bold text-slate-950' : 'text-slate-500 opacity-75'
                      }`}
                    >
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: player.color }}
                        aria-hidden="true"
                      />
                      <span>{player.name}</span>
                    </span>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={onNextMultiplayerTurn}
                className="ml-1 border-l border-slate-900/10 pl-2 text-[11px] font-semibold text-blue-700 hover:text-blue-800 whitespace-nowrap"
              >
                Next (Tab)
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Subtle Center Aim Reticle (only shown in Pointer-Lock free-look mode) */}
      {isPointerLocked && (
        <div
          className="pointer-events-none fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
          aria-hidden="true"
        >
          <div
            className={`h-3 w-3 rounded-full border-2 transition-transform duration-150 ${
              bothLocked
                ? 'scale-125 border-emerald-600 bg-emerald-500/30'
                : handTargeting.left.locked
                  ? 'scale-115 border-blue-600 bg-blue-500/25'
                  : handTargeting.right.locked
                    ? 'scale-115 border-orange-600 bg-orange-500/25'
                    : handTargeting.hoverInReach
                      ? 'scale-110 border-amber-500 bg-amber-400/20'
                      : 'border-slate-900/65 bg-white/60'
            }`}
          />
        </div>
      )}

      {/* Bottom-Center Collapsible Control Dock (Zero Viewport Occlusion, no backdrop-filter over WebGL) */}
      <div className="flex flex-col items-center">
        <button
          type="button"
          onClick={onToggleExpanded}
          aria-expanded={isExpanded}
          className="pointer-events-auto mb-2 inline-flex items-center gap-1.5 rounded-lg border border-slate-900/12 bg-white/92 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition-colors duration-150 hover:bg-white hover:text-slate-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 whitespace-nowrap shrink-0"
        >
          {isExpanded ? (
            <>
              <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Hide Controls</span>
            </>
          ) : (
            <>
              <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Show Controls</span>
            </>
          )}
        </button>

        <div
          className={`pointer-events-auto w-auto max-w-[94vw] transition-all duration-200 ease-out ${
            isExpanded
              ? 'translate-y-0 opacity-100'
              : 'pointer-events-none hidden translate-y-6 opacity-0'
          }`}
        >
          <div className="flex flex-col items-center gap-2.5 rounded-xl border border-slate-900/12 bg-white/94 px-4 py-3 shadow-lg">
            {/* Compact Dynamic Movement, Grab & Puzzle Controls Guide */}
            <div
              className="flex flex-wrap items-center justify-center gap-x-3.5 gap-y-1 text-xs text-slate-700"
              aria-label="Controls guide"
            >
              <span className="whitespace-nowrap">
                <strong className="font-semibold text-slate-900">{moveKeysLabel}</strong> — Move
              </span>
              <span className="text-slate-300" aria-hidden="true">
                ·
              </span>
              <span className="whitespace-nowrap">
                <strong className="font-semibold text-slate-900">{runKeyLabel}</strong> — Run
              </span>
              <span className="text-slate-300" aria-hidden="true">
                ·
              </span>
              <span className="whitespace-nowrap">
                <strong className="font-semibold text-slate-900">{jumpKeyLabel}</strong> — Jump / Climb
              </span>
              <span className="text-slate-300" aria-hidden="true">
                ·
              </span>
              <span className="whitespace-nowrap">
                <strong className="font-semibold text-blue-700">LMB / {leftGrabLabel}</strong> — Left Grab
              </span>
              <span className="text-slate-300" aria-hidden="true">
                ·
              </span>
              <span className="whitespace-nowrap">
                <strong className="font-semibold text-orange-700">RMB / {rightGrabLabel}</strong> — Right Grab
              </span>
              {!levelState.isSandbox && (
                <>
                  <span className="text-slate-300" aria-hidden="true">
                    ·
                  </span>
                  <span className="whitespace-nowrap">
                    <strong className="font-semibold text-emerald-700">{interactLabel}</strong> — Lever
                  </span>
                </>
              )}
            </div>

            <div className="h-px w-full bg-slate-900/8" aria-hidden="true" />

            <div className="flex flex-wrap items-center justify-center gap-2">
              {levelState.isSandbox ? (
                <>
                  <button
                    type="button"
                    onClick={onDropFromSky}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white transition-colors duration-150 hover:bg-blue-700 active:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 whitespace-nowrap shrink-0"
                  >
                    <ArrowDownToLine className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Drop from Sky</span>
                  </button>

                  <button
                    type="button"
                    onClick={onNudge}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-900/12 bg-slate-50 px-3.5 py-2 text-xs font-semibold text-slate-800 transition-colors duration-150 hover:bg-slate-100 active:bg-slate-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 whitespace-nowrap shrink-0"
                  >
                    <Wind className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Nudge Character</span>
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={onRespawnCheckpoint}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white transition-colors duration-150 hover:bg-blue-700 active:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 whitespace-nowrap shrink-0"
                  >
                    <Flag className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Respawn Checkpoint</span>
                  </button>

                  <button
                    type="button"
                    onClick={onRestartLevel}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-900/12 bg-slate-50 px-3.5 py-2 text-xs font-semibold text-slate-800 transition-colors duration-150 hover:bg-slate-100 active:bg-slate-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 whitespace-nowrap shrink-0"
                  >
                    <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Restart Level</span>
                  </button>
                </>
              )}

              <button
                type="button"
                onClick={onResetBlocks}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-900/12 bg-slate-50 px-3.5 py-2 text-xs font-semibold text-slate-800 transition-colors duration-150 hover:bg-slate-100 active:bg-slate-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 whitespace-nowrap shrink-0"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{levelState.isSandbox ? 'Reset Blocks' : 'Reset Objects'}</span>
              </button>

              <div className="mx-0.5 hidden h-5 w-px bg-slate-900/12 sm:block" aria-hidden="true" />

              <button
                type="button"
                onClick={onTogglePointerLock}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-xs font-semibold transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 whitespace-nowrap shrink-0 ${
                  isPointerLocked
                    ? 'border-slate-900 bg-slate-900 text-white hover:bg-slate-800'
                    : 'border-slate-900/12 bg-slate-50 text-slate-800 hover:bg-slate-100'
                }`}
              >
                {isPointerLocked ? (
                  <>
                    <Unlock className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Unlock Camera</span>
                  </>
                ) : (
                  <>
                    <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Lock Camera</span>
                  </>
                )}
              </button>
            </div>

            <p className="text-center text-xs text-slate-500">
              Press {pauseLabel} to pause · Press H to hide dock
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
