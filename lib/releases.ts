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
  id: '2.0.1',
  title: 'Bookmarked 2.0.1',
  releasedAt: '2026-07-30',
  notes: [
    {
      title: 'Find the exact physical edition',
      detail:
        'Type an ISBN-10 or ISBN-13 into Search to find the matching edition, cover, publisher, language, and publication date.',
    },
    {
      title: 'Repair an existing copy safely',
      detail:
        'Use an exact ISBN edition without replacing your edited title, page count, notes, progress, ratings, reviews, or reading dates.',
    },
    {
      title: 'Covers fail gracefully',
      detail:
        'The PWA now permits Open Library’s real cover redirects, and failed images show a readable fallback instead of an empty block.',
    },
  ],
};

export function shouldShowRelease(lastSeenRelease: string | null): boolean {
  return lastSeenRelease !== CURRENT_RELEASE.id;
}
