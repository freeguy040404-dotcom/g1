import { useEffect, useState } from 'react';
import {
  Award,
  LayoutGrid,
  LogOut,
  Play,
  Settings,
  Sparkles,
  Users,
} from 'lucide-react';
import type { CampaignProgress } from '../game/types';
import { CAMPAIGN_ORDER } from '../game/progress';
import { LEVEL_CATALOG } from '../game/levels/levelCatalog';

interface MainMenuProps {
  progress: CampaignProgress;
  hasActiveSession: boolean;
  isModalOpen: boolean;
  onlineRoomLabel?: string | null;
  onPlayGame: () => void;
  onOpenLevelSelect: () => void;
  onOpenMultiplayer: () => void;
  onOpenSettings: () => void;
  onOpenCredits: () => void;
  onQuitGame: () => void;
  onUiHover: () => void;
  onUiClick: () => void;
}

export function MainMenu({
  progress,
  hasActiveSession,
  isModalOpen,
  onlineRoomLabel,
  onPlayGame,
  onOpenLevelSelect,
  onOpenMultiplayer,
  onOpenSettings,
  onOpenCredits,
  onQuitGame,
  onUiHover,
  onUiClick,
}: MainMenuProps) {
  const [focusedIndex, setFocusedIndex] = useState(0);

  const completedCount = CAMPAIGN_ORDER.filter(
    (id) => progress.records[id]?.completed,
  ).length;
  const totalRelicsFound = CAMPAIGN_ORDER.reduce(
    (sum, id) => sum + (progress.records[id]?.foundRelics.length ?? 0),
    0,
  );
  const totalCampaignRelics = LEVEL_CATALOG.filter((e) => !e.isSandbox).reduce(
    (sum, e) => sum + e.totalRelics,
    0,
  );

  const items = [
    {
      id: 'play',
      label: hasActiveSession ? 'Continue Adventure' : 'Play Game',
      description: hasActiveSession
        ? 'Jump right back into your active world'
        : completedCount > 0
          ? 'Continue your next unlocked world'
          : 'Begin your climb in Dream World',
      icon: Play,
      primary: true,
      action: onPlayGame,
    },
    {
      id: 'levels',
      label: 'Level Selection',
      description: '5 campaign worlds + Observatory sandbox',
      icon: LayoutGrid,
      primary: false,
      action: onOpenLevelSelect,
    },
    {
      id: 'multiplayer',
      label: onlineRoomLabel ? `Multiplayer (${onlineRoomLabel})` : 'Multiplayer',
      description: onlineRoomLabel
        ? 'Connected to online room — click to manage'
        : 'Host or join online rooms & local co-op',
      icon: Users,
      primary: false,
      action: onOpenMultiplayer,
    },
    {
      id: 'settings',
      label: 'Settings',
      description: 'Graphics, audio, controls & gameplay',
      icon: Settings,
      primary: false,
      action: onOpenSettings,
    },
    {
      id: 'credits',
      label: 'Credits',
      description: 'Craft, physics & sound design',
      icon: Award,
      primary: false,
      action: onOpenCredits,
    },
    {
      id: 'quit',
      label: 'Quit Game',
      description: 'End session cleanly',
      icon: LogOut,
      primary: false,
      action: onQuitGame,
    },
  ];

  useEffect(() => {
    if (isModalOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT')
      ) {
        return;
      }
      if (event.key === 'ArrowDown' || event.code === 'KeyS') {
        event.preventDefault();
        setFocusedIndex((prev) => {
          const next = (prev + 1) % items.length;
          onUiHover();
          return next;
        });
      } else if (event.key === 'ArrowUp' || event.code === 'KeyW') {
        event.preventDefault();
        setFocusedIndex((prev) => {
          const next = (prev - 1 + items.length) % items.length;
          onUiHover();
          return next;
        });
      } else if (event.key === 'Enter' || event.code === 'Space') {
        if (target && target.tagName === 'BUTTON') return;
        event.preventDefault();
        onUiClick();
        items[focusedIndex]?.action();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isModalOpen, focusedIndex, items, onUiClick, onUiHover]);

  return (
    <div className="pointer-events-none fixed inset-0 z-20 flex flex-col justify-between p-6 sm:p-10 lg:p-12">
      {/* Subtle Left Vignette Rail Gradient so 3D Character & Floating Islands Shine on the Right */}
      <div
        className="pointer-events-none fixed inset-y-0 left-0 w-full max-w-xl bg-gradient-to-r from-[#eef5fb]/92 via-[#eef5fb]/68 to-transparent"
        aria-hidden="true"
      />

      <div className="relative z-10 flex flex-1 flex-col justify-between max-w-sm">
        {/* Title & Campaign Summary */}
        <header>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-700">
            3D Physics Puzzle Adventure
          </p>
          <h1
            className="mt-2 text-5xl font-bold tracking-tight text-slate-950 sm:text-6xl"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Wobblepeak
          </h1>
          <p className="mt-2.5 text-sm leading-relaxed text-slate-700">
            Grab, stack, climb, and wobble across five sunlit physics worlds.
          </p>

          <div className="mt-4 flex items-center gap-3 text-xs font-medium text-slate-700 tabular-nums">
            <span>
              <strong className="font-semibold text-slate-900">
                {completedCount}/{CAMPAIGN_ORDER.length}
              </strong>{' '}
              Worlds Cleared
            </span>
            <span className="text-slate-400" aria-hidden="true">
              ·
            </span>
            <span className="inline-flex items-center gap-1">
              <Sparkles className="h-3.5 w-3.5 text-amber-500" aria-hidden="true" />
              <strong className="font-semibold text-slate-900">
                {totalRelicsFound}/{totalCampaignRelics}
              </strong>{' '}
              Relics
            </span>
          </div>
        </header>

        {/* Interactive Main Menu Rail */}
        <nav
          aria-label="Main menu"
          className="pointer-events-auto my-auto flex flex-col gap-2 py-6"
        >
          {items.map((item, idx) => {
            const Icon = item.icon;
            const isFocused = focusedIndex === idx;
            return (
              <button
                key={item.id}
                type="button"
                onMouseEnter={() => {
                  if (focusedIndex !== idx) {
                    setFocusedIndex(idx);
                    onUiHover();
                  }
                }}
                onFocus={() => setFocusedIndex(idx)}
                onClick={() => {
                  onUiClick();
                  item.action();
                }}
                className={`group flex w-full items-center gap-3.5 rounded-xl border px-4 py-3 text-left transition-all duration-150 active:scale-[0.985] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
                  item.primary
                    ? 'border-slate-900 bg-slate-900 text-white shadow-md hover:translate-x-1 hover:bg-blue-600 hover:border-blue-600'
                    : isFocused
                      ? 'translate-x-1 border-slate-900/20 bg-white text-slate-950 shadow-sm'
                      : 'border-slate-900/10 bg-white/92 text-slate-800 hover:translate-x-1 hover:border-slate-900/20 hover:bg-white hover:text-slate-950'
                }`}
              >
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors ${
                    item.primary
                      ? 'bg-white/15 text-white'
                      : isFocused
                        ? 'bg-blue-50 text-blue-700'
                        : 'bg-slate-100 text-slate-600 group-hover:bg-blue-50 group-hover:text-blue-700'
                  }`}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className="block text-sm font-bold tracking-tight"
                    style={{ fontFamily: 'var(--font-display)' }}
                  >
                    {item.label}
                  </span>
                  <span
                    className={`block truncate text-[11px] ${
                      item.primary ? 'text-slate-200' : 'text-slate-500'
                    }`}
                  >
                    {item.description}
                  </span>
                </span>
              </button>
            );
          })}
        </nav>

        {/* Quiet Navigation Hint */}
        <footer className="text-[11px] font-medium text-slate-600">
          Use Up / Down and Enter, or click any menu option
        </footer>
      </div>
    </div>
  );
}
