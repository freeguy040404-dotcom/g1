import {
  ArrowRight,
  CheckCircle2,
  Home,
  LayoutGrid,
  RotateCcw,
  Sparkles,
  Users,
} from 'lucide-react';
import type {
  LevelCompletionPayload,
  LevelId,
  MultiplayerSession,
} from '../game/types';
import type { NetworkRoomState } from '../game/network/protocol';
import { getLevelCatalogEntry } from '../game/levels/levelCatalog';
import { formatDuration, getNextCampaignLevel } from '../game/progress';

interface LevelCompleteModalProps {
  completion: LevelCompletionPayload;
  bestTimeSec: number | null;
  multiplayer: MultiplayerSession;
  onlineRoom?: NetworkRoomState | null;
  isOnlineHost?: boolean;
  onNextLevel: (nextId: LevelId) => void;
  onReplayLevel: () => void;
  onReturnToLevelSelect: () => void;
  onReturnToMainMenu: () => void;
  onUiHover: () => void;
  onUiClick: () => void;
}

export function LevelCompleteModal({
  completion,
  bestTimeSec,
  multiplayer,
  onlineRoom = null,
  isOnlineHost = false,
  onNextLevel,
  onReplayLevel,
  onReturnToLevelSelect,
  onReturnToMainMenu,
  onUiHover,
  onUiClick,
}: LevelCompleteModalProps) {
  const currentEntry = getLevelCatalogEntry(completion.levelId);
  const nextLevelId = getNextCampaignLevel(completion.levelId);
  const nextEntry = nextLevelId ? getLevelCatalogEntry(nextLevelId) : null;
  const isOnlineGuest = Boolean(onlineRoom && !isOnlineHost);

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-slate-950/42 p-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby="level-complete-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-slate-900/12 bg-white/98 p-6 shadow-2xl sm:p-7">
        <div className="flex items-center gap-2 text-emerald-700">
          <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
          <span className="text-xs font-semibold uppercase tracking-[0.16em]">
            {onlineRoom ? 'Co-op Level Completed' : 'Level Completed'}
          </span>
        </div>

        <h2
          id="level-complete-title"
          className="mt-2 text-2xl font-bold tracking-tight text-slate-950"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          {currentEntry.title}
        </h2>
        <p className="mt-0.5 text-sm text-slate-600">{currentEntry.subtitle}</p>

        {/* Clean 3-column metrics strip */}
        <div className="mt-5 grid grid-cols-3 gap-3 border-y border-slate-900/8 py-4 tabular-nums">
          <div>
            <p className="text-[11px] font-medium text-slate-500">Time Taken</p>
            <p className="mt-0.5 text-lg font-bold text-slate-900">
              {formatDuration(completion.elapsedSec)}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-medium text-slate-500">Best Time</p>
            <p className="mt-0.5 text-lg font-bold text-slate-900">
              {formatDuration(bestTimeSec)}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-medium text-slate-500">Secret Relics</p>
            <p className="mt-0.5 inline-flex items-center gap-1 text-lg font-bold text-slate-900">
              <Sparkles className="h-4 w-4 text-amber-500" aria-hidden="true" />
              {completion.foundRelics.length}/{completion.totalRelics}
            </p>
          </div>
        </div>

        {onlineRoom && (
          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-700">
            <Users className="h-3.5 w-3.5 text-blue-600" aria-hidden="true" />
            <span className="font-semibold text-slate-900">Online Team:</span>
            {onlineRoom.players.map((p) => (
              <span key={p.id} className="inline-flex items-center gap-1 font-medium">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: p.color }}
                  aria-hidden="true"
                />
                {p.displayName}
              </span>
            ))}
          </div>
        )}

        {!onlineRoom && multiplayer.enabled && (
          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-700">
            <Users className="h-3.5 w-3.5 text-blue-600" aria-hidden="true" />
            <span className="font-semibold text-slate-900">Co-op Team:</span>
            {multiplayer.players.map((p) => (
              <span key={p.id} className="inline-flex items-center gap-1 font-medium">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: p.color }}
                  aria-hidden="true"
                />
                {p.name}
              </span>
            ))}
          </div>
        )}

        {nextEntry ? (
          <p className="mt-4 text-xs text-slate-600">
            Unlocked next world:{' '}
            <strong className="font-semibold text-slate-900">
              {nextEntry.numberLabel}. {nextEntry.title}
            </strong>
          </p>
        ) : (
          <p className="mt-4 text-xs font-medium text-emerald-700">
            All five campaign worlds cleared! Replay any world to hunt remaining relics or beat your best time.
          </p>
        )}

        {isOnlineGuest && (
          <p className="mt-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-800">
            Waiting for the room host to advance to the next world or restart.
          </p>
        )}

        <div className="mt-6 flex flex-col gap-2.5">
          {nextLevelId && !isOnlineGuest && (
            <button
              type="button"
              onMouseEnter={onUiHover}
              onClick={() => {
                onUiClick();
                onNextLevel(nextLevelId);
              }}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition-all duration-150 hover:bg-blue-700 active:scale-[0.985] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            >
              <span>{onlineRoom ? 'Next Level (All Players)' : 'Next Level'}</span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          )}

          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              disabled={isOnlineGuest}
              onMouseEnter={onUiHover}
              onClick={() => {
                onUiClick();
                onReplayLevel();
              }}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-900/15 bg-slate-50 px-3.5 py-2.5 text-xs font-semibold text-slate-800 transition-all duration-150 hover:bg-slate-100 active:scale-[0.985] disabled:opacity-45"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Restart</span>
            </button>

            <button
              type="button"
              onMouseEnter={onUiHover}
              onClick={() => {
                onUiClick();
                onReturnToLevelSelect();
              }}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-900/15 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-800 transition-all duration-150 hover:bg-slate-50 active:scale-[0.985]"
            >
              <LayoutGrid className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Level Selection</span>
            </button>
          </div>

          <button
            type="button"
            onMouseEnter={onUiHover}
            onClick={() => {
              onUiClick();
              onReturnToMainMenu();
            }}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
          >
            <Home className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Return to Main Menu</span>
          </button>
        </div>
      </div>
    </div>
  );
}

