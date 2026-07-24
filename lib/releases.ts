export type ReleaseNote = {
  title: string;
  detail: string;
};

export type AppRelease = {
  id: string;
  title: string;
  releasedAt: string;
  notes: ReleaseNote[];
};

export const LAST_SEEN_RELEASE_KEY = 'last_seen_release';

export const CURRENT_RELEASE: AppRelease = {
  id: '2.0.0',
  title: 'Bookmarked 2.0',
  releasedAt: '2026-07-24',
  notes: [
    {
      title: 'Your physical library, properly modelled',
      detail:
        'Books now retain edition details, ownership, editable titles, private notes, and the cover that matches your copy.',
    },
    {
      title: 'Rereads preserve history',
      detail:
        'Starting a book again creates a new reading entry instead of replacing the original rating, review, dates, or recap.',
    },
    {
      title: 'Progress and backups are safer',
      detail:
        'Page sessions save atomically, legacy backups import cleanly, and merges keep the newer copy while respecting deletions.',
    },
    {
      title: 'Richer stats and recaps',
      detail:
        'Track streaks, weekly pace, monthly pages, quarters, heatmaps, fastest and longest reads, and share recap images.',
    },
    {
      title: 'Better on phones and the web',
      detail:
        'Lists have sorting and filters, accessibility is improved, and the PWA now uses a focused responsive desktop layout.',
    },
  ],
};

export function shouldShowRelease(lastSeenRelease: string | null): boolean {
  return lastSeenRelease !== CURRENT_RELEASE.id;
}
