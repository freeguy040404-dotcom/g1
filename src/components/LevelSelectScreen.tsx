import { useEffect } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Lock,
  RotateCcw,
  Sparkles,
  Unlock,
} from 'lucide-react';
import type { CampaignProgress, LevelId } from '../game/types';
import { LEVEL_CATALOG } from '../game/levels/levelCatalog';
import { CAMPAIGN_ORDER, formatDuration, isLevelUnlocked } from '../game/progress';
import { LevelArtwork } from './LevelArtwork';

interface LevelSelectScreenProps {
  progress: CampaignProgress;
  activeLevelId: LevelId;
  hasActiveSession: boolean;
  onSelectLevel: (levelId: LevelId) => void;
  onResumeActiveLevel: () => void;
  onBackToMainMenu: () => void;
  onToggleUnlockAll: () => void;
  onUiHover: () => void;
  onUiClick: () => void;
}

export function LevelSelectScreen({
  progress,
  activeLevelId,
  hasActiveSession,
  onSelectLevel,
  onResumeActiveLevel,
  onBackToMainMenu,
  onToggleUnlockAll,
  onUiHover,
  onUiClick,
}: LevelSelectScreenProps) {
  useEffect(() => {
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onBackToMainMenu();
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onBackToMainMenu]);

  const campaignEntries = LEVEL_CATALOG.filter((item) => !item.isSandbox);
  const sandboxEntry = LEVEL_CATALOG.find((item) => item.isSandbox);

  const completedCount = CAMPAIGN_ORDER.filter(
    (id) => progress.records[id]?.completed,
  ).length;
  const totalRelicsFound = CAMPAIGN_ORDER.reduce(
    (sum, id) => sum + (progress.records[id]?.foundRelics.length ?? 0),
    0,
  );
  const totalCampaignRelics = campaignEntries.reduce(
    (sum, item) => sum + item.totalRelics,
    0,
  );

  return (
    <div className="fixed inset-0 z-20 overflow-y-auto bg-[#e9f2f9]/94">
      <div className="mx-auto flex min-h-full max-w-6xl flex-col px-5 py-7 sm:px-8 sm:py-10">
        {/* Top Bar: Back + Title · Campaign Progress · Actions */}
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-900/10 pb-5">
          <div className="flex items-start gap-3.5">
            <button
              type="button"
              onMouseEnter={onUiHover}
              onClick={() => {
                onUiClick();
                onBackToMainMenu();
              }}
              className="mt-1 inline-flex items-center gap-1.5 rounded-lg border border-slate-900/15 bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-xs transition-all duration-150 hover:bg-slate-50 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Main Menu</span>
            </button>
            <div>
              <h1
                className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                Level Selection
              </h1>
              <p className="mt-0.5 text-xs text-slate-600">
                Choose any unlocked 3D world or jump into the Observatory sandbox.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3.5">
            <div className="text-right text-xs font-medium text-slate-700 tabular-nums">
              <span className="font-semibold text-slate-900">
                {completedCount}/{CAMPAIGN_ORDER.length}
              </span>{' '}
              Worlds Cleared
              <span className="mx-2 text-slate-300" aria-hidden="true">
                ·
              </span>
              <span className="font-semibold text-slate-900">
                {totalRelicsFound}/{totalCampaignRelics}
              </span>{' '}
              Relics
            </div>

            {hasActiveSession && (
              <button
                type="button"
                onMouseEnter={onUiHover}
                onClick={() => {
                  onUiClick();
                  onResumeActiveLevel();
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-900/15 bg-white px-3.5 py-2 text-xs font-semibold text-slate-900 shadow-xs transition-all duration-150 hover:bg-slate-50 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 whitespace-nowrap"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Resume</span>
              </button>
            )}

            <button
              type="button"
              onMouseEnter={onUiHover}
              onClick={() => {
                onUiClick();
                onToggleUnlockAll();
              }}
              aria-pressed={progress.unlockAll}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-xs font-semibold transition-all duration-150 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 whitespace-nowrap ${
                progress.unlockAll
                  ? 'border-blue-600 bg-blue-600 text-white hover:bg-blue-700'
                  : 'border-slate-900/15 bg-white text-slate-800 hover:bg-slate-50'
              }`}
            >
              {progress.unlockAll ? (
                <>
                  <Unlock className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>All Levels Unlocked</span>
                </>
              ) : (
                <>
                  <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Unlock All</span>
                </>
              )}
            </button>
          </div>
        </header>

        {/* Five Campaign Worlds Grid */}
        <section aria-label="Campaign worlds" className="mt-7">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {campaignEntries.map((entry) => {
              const unlocked = isLevelUnlocked(progress, entry.id);
              const record = progress.records[entry.id];
              const relicsFound = record?.foundRelics.length ?? 0;
              const isCompleted = Boolean(record?.completed);
              const isCurrent = hasActiveSession && activeLevelId === entry.id;

              return (
                <article
                  key={entry.id}
                  className={`group flex flex-col overflow-hidden rounded-xl border bg-white transition-all duration-200 ${
                    unlocked
                      ? 'border-slate-900/12 shadow-sm hover:-translate-y-0.5 hover:border-slate-900/22 hover:shadow-md'
                      : 'border-slate-900/8 opacity-80'
                  }`}
                >
                  <div className="relative aspect-[16/8.5] w-full overflow-hidden border-b border-slate-900/8">
                    <div className={`h-full w-full ${unlocked ? '' : 'grayscale-[55%]'}`}>
                      <LevelArtwork entry={entry} idPrefix="select" />
                    </div>
                    {!unlocked && (
                      <div className="absolute inset-0 flex items-center justify-center bg-slate-900/35">
                        <div className="flex items-center gap-1.5 rounded-lg bg-white/95 px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-sm">
                          <Lock className="h-3.5 w-3.5 text-slate-600" aria-hidden="true" />
                          <span>Locked</span>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-1 flex-col p-5">
                    <div className="flex items-baseline justify-between gap-2">
                      <h2
                        className="text-lg font-bold tracking-tight text-slate-900"
                        style={{ fontFamily: 'var(--font-display)' }}
                      >
                        <span className="mr-1.5 text-slate-400 tabular-nums">
                          {entry.numberLabel}.
                        </span>
                        {entry.title}
                      </h2>
                      {isCompleted && (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 whitespace-nowrap">
                          <Check className="h-3.5 w-3.5" aria-hidden="true" />
                          Cleared
                        </span>
                      )}
                    </div>

                    <p className="mt-0.5 text-xs font-medium text-slate-500">
                      {entry.subtitle}
                    </p>

                    <p className="mt-2.5 flex-1 text-xs leading-relaxed text-slate-700">
                      {entry.description}
                    </p>

                    <p className="mt-3 text-[11px] font-medium text-slate-500">
                      {entry.puzzleTags.join(' · ')}
                    </p>

                    <div className="mt-4 flex items-center justify-between border-t border-slate-900/8 pt-3.5">
                      <div className="flex items-center gap-2.5 text-xs text-slate-600 tabular-nums">
                        <span className="inline-flex items-center gap-1 font-medium text-slate-800">
                          <Sparkles className="h-3.5 w-3.5 text-amber-500" aria-hidden="true" />
                          {relicsFound}/{entry.totalRelics}
                        </span>
                        <span className="text-slate-300" aria-hidden="true">
                          ·
                        </span>
                        <span>Best {formatDuration(record?.bestTimeSec ?? null)}</span>
                      </div>

                      {unlocked ? (
                        <button
                          type="button"
                          onMouseEnter={onUiHover}
                          onClick={() => {
                            onUiClick();
                            onSelectLevel(entry.id);
                          }}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white transition-all duration-150 hover:bg-blue-600 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 whitespace-nowrap"
                        >
                          <span>
                            {isCurrent ? 'Restart' : isCompleted ? 'Replay' : 'Play'}
                          </span>
                          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      ) : (
                        <span className="text-[11px] font-medium text-slate-500">
                          Clear previous world
                        </span>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        {/* Preserved Original Observatory Terrace Sandbox Bonus Card */}
        {sandboxEntry && (
          <section aria-label="Bonus sandbox" className="mt-6">
            <div className="flex flex-col overflow-hidden rounded-xl border border-slate-900/12 bg-white shadow-sm sm:flex-row">
              <div className="aspect-[16/7] w-full shrink-0 border-b border-slate-900/8 sm:aspect-auto sm:w-64 sm:border-b-0 sm:border-r">
                <LevelArtwork entry={sandboxEntry} idPrefix="select" />
              </div>
              <div className="flex flex-1 flex-col justify-between gap-4 p-5 sm:flex-row sm:items-center">
                <div>
                  <h2
                    className="text-base font-bold tracking-tight text-slate-900"
                    style={{ fontFamily: 'var(--font-display)' }}
                  >
                    {sandboxEntry.title}
                    <span className="ml-2 text-xs font-medium text-slate-500">
                      · Bonus Sandbox
                    </span>
                  </h2>
                  <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-600">
                    {sandboxEntry.description}
                  </p>
                </div>
                <button
                  type="button"
                  onMouseEnter={onUiHover}
                  onClick={() => {
                    onUiClick();
                    onSelectLevel(sandboxEntry.id);
                  }}
                  className="inline-flex items-center justify-center gap-1.5 self-start rounded-lg border border-slate-900/15 bg-slate-50 px-4 py-2.5 text-xs font-semibold text-slate-900 transition-all duration-150 hover:bg-slate-900 hover:text-white active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 sm:self-center whitespace-nowrap shrink-0"
                >
                  <span>Open Sandbox</span>
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
