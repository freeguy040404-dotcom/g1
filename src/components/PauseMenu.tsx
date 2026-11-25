import { useEffect } from 'react';
import { Home, Play, RefreshCw, Settings } from 'lucide-react';
import { formatDuration } from '../game/progress';

interface PauseMenuProps {
  levelTitle: string;
  levelSubtitle: string;
  elapsedSec: number;
  isSandbox: boolean;
  isOnlineGuest?: boolean;
  onResume: () => void;
  onRestartLevel: () => void;
  onOpenSettings: () => void;
  onReturnToMainMenu: () => void;
  onUiHover: () => void;
  onUiClick: () => void;
}

export function PauseMenu({
  levelTitle,
  levelSubtitle,
  elapsedSec,
  isSandbox,
  isOnlineGuest = false,
  onResume,
  onRestartLevel,
  onOpenSettings,
  onReturnToMainMenu,
  onUiHover,
  onUiClick,
}: PauseMenuProps) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onResume();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onResume]);

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-slate-950/42 p-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pause-menu-title"
    >
      <div className="w-full max-w-sm rounded-2xl border border-slate-900/12 bg-white/98 p-6 shadow-2xl sm:p-7">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">
          Game Paused
        </p>
        <h2
          id="pause-menu-title"
          className="mt-1.5 text-2xl font-bold tracking-tight text-slate-950"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          {levelTitle}
        </h2>
        <p className="mt-0.5 text-xs font-medium text-slate-500 tabular-nums">
          {levelSubtitle}
          {!isSandbox && (
            <>
              <span className="mx-1.5 text-slate-300" aria-hidden="true">
                ·
              </span>
              Elapsed {formatDuration(elapsedSec)}
            </>
          )}
        </p>

        <div className="mt-6 flex flex-col gap-2.5">
          <button
            type="button"
            onMouseEnter={onUiHover}
            onClick={() => {
              onUiClick();
              onResume();
            }}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition-all duration-150 hover:bg-blue-600 active:scale-[0.985] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            <Play className="h-4 w-4" aria-hidden="true" />
            <span>Resume</span>
          </button>

          <button
            type="button"
            disabled={isOnlineGuest}
            onMouseEnter={onUiHover}
            onClick={() => {
              onUiClick();
              onRestartLevel();
            }}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-900/12 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-800 transition-all duration-150 hover:bg-slate-100 active:scale-[0.985] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-45"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            <span>{isOnlineGuest ? 'Restart Level (Host Only)' : 'Restart Level'}</span>
          </button>

          <button
            type="button"
            onMouseEnter={onUiHover}
            onClick={() => {
              onUiClick();
              onOpenSettings();
            }}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-900/12 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-800 transition-all duration-150 hover:bg-slate-100 active:scale-[0.985] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            <Settings className="h-4 w-4" aria-hidden="true" />
            <span>Settings</span>
          </button>

          <div className="my-1 h-px bg-slate-900/8" aria-hidden="true" />

          <button
            type="button"
            onMouseEnter={onUiHover}
            onClick={() => {
              onUiClick();
              onReturnToMainMenu();
            }}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-900/12 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-all duration-150 hover:bg-slate-50 hover:text-slate-950 active:scale-[0.985] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            <Home className="h-4 w-4" aria-hidden="true" />
            <span>Return to Main Menu</span>
          </button>
        </div>

        <p className="mt-4 text-center text-[11px] text-slate-500">
          Physics &amp; timer suspended · Press Esc to resume
        </p>
      </div>
    </div>
  );
}
