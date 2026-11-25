import type { CampaignLevelId, CampaignProgress, LevelId, LevelProgressRecord } from './types';

const STORAGE_KEY = 'wobblepeak_progress_v1';

export const CAMPAIGN_ORDER: CampaignLevelId[] = [
  'dream-world',
  'warehouse',
  'mountain-adventure',
  'construction-site',
  'medieval-castle',
];

export const ALL_LEVEL_IDS: LevelId[] = [...CAMPAIGN_ORDER, 'observatory'];

function createEmptyRecord(): LevelProgressRecord {
  return {
    completed: false,
    bestTimeSec: null,
    foundRelics: [],
  };
}

export function createDefaultProgress(): CampaignProgress {
  const records = {} as Record<LevelId, LevelProgressRecord>;
  for (const id of ALL_LEVEL_IDS) {
    records[id] = createEmptyRecord();
  }
  return {
    unlockedLevelIds: ['dream-world', 'observatory'],
    unlockAll: false,
    records,
  };
}

export function loadCampaignProgress(): CampaignProgress {
  const fallback = createDefaultProgress();
  if (typeof window === 'undefined') return fallback;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<CampaignProgress>;

    const unlocked = new Set<LevelId>(['dream-world', 'observatory']);
    if (Array.isArray(parsed.unlockedLevelIds)) {
      for (const id of parsed.unlockedLevelIds) {
        if (ALL_LEVEL_IDS.includes(id as LevelId)) {
          unlocked.add(id as LevelId);
        }
      }
    }

    const records = {} as Record<LevelId, LevelProgressRecord>;
    for (const id of ALL_LEVEL_IDS) {
      const rec = parsed.records?.[id];
      records[id] = {
        completed: Boolean(rec?.completed),
        bestTimeSec:
          typeof rec?.bestTimeSec === 'number' && Number.isFinite(rec.bestTimeSec) && rec.bestTimeSec > 0
            ? rec.bestTimeSec
            : null,
        foundRelics: Array.isArray(rec?.foundRelics)
          ? Array.from(new Set(rec.foundRelics.filter((r): r is string => typeof r === 'string')))
          : [],
      };
    }

    return {
      unlockedLevelIds: Array.from(unlocked),
      unlockAll: Boolean(parsed.unlockAll),
      records,
    };
  } catch {
    return fallback;
  }
}

export function saveCampaignProgress(progress: CampaignProgress): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // Ignore storage quota / privacy mode errors gracefully
  }
}

export function isLevelUnlocked(progress: CampaignProgress, levelId: LevelId): boolean {
  if (levelId === 'observatory' || levelId === 'dream-world') return true;
  if (progress.unlockAll) return true;
  return progress.unlockedLevelIds.includes(levelId);
}

export function getNextCampaignLevel(levelId: LevelId): CampaignLevelId | null {
  const idx = CAMPAIGN_ORDER.indexOf(levelId as CampaignLevelId);
  if (idx < 0 || idx >= CAMPAIGN_ORDER.length - 1) return null;
  return CAMPAIGN_ORDER[idx + 1];
}

export function recordRelicFound(
  progress: CampaignProgress,
  levelId: LevelId,
  relicId: string,
): CampaignProgress {
  const existing = progress.records[levelId] ?? createEmptyRecord();
  if (existing.foundRelics.includes(relicId)) {
    return progress;
  }
  const next: CampaignProgress = {
    ...progress,
    records: {
      ...progress.records,
      [levelId]: {
        ...existing,
        foundRelics: [...existing.foundRelics, relicId],
      },
    },
  };
  saveCampaignProgress(next);
  return next;
}

export function markLevelCompleted(
  progress: CampaignProgress,
  levelId: LevelId,
  elapsedSec: number,
  foundRelics: string[],
): CampaignProgress {
  const existing = progress.records[levelId] ?? createEmptyRecord();
  const mergedRelics = Array.from(new Set([...existing.foundRelics, ...foundRelics]));
  const roundedTime = Math.max(1, Math.round(elapsedSec * 10) / 10);
  const bestTimeSec =
    existing.bestTimeSec === null ? roundedTime : Math.min(existing.bestTimeSec, roundedTime);

  const unlocked = new Set<LevelId>(progress.unlockedLevelIds);
  unlocked.add(levelId);
  const nextCampaign = getNextCampaignLevel(levelId);
  if (nextCampaign) {
    unlocked.add(nextCampaign);
  }

  const next: CampaignProgress = {
    ...progress,
    unlockedLevelIds: Array.from(unlocked),
    records: {
      ...progress.records,
      [levelId]: {
        completed: true,
        bestTimeSec,
        foundRelics: mergedRelics,
      },
    },
  };
  saveCampaignProgress(next);
  return next;
}

export function toggleUnlockAllProgress(progress: CampaignProgress): CampaignProgress {
  const next: CampaignProgress = {
    ...progress,
    unlockAll: !progress.unlockAll,
  };
  saveCampaignProgress(next);
  return next;
}

export function formatDuration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return '--:--';
  const total = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}
