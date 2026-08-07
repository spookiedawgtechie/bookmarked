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
  id: '2.1.0',
  title: 'Bookmarked 2.1.0',
  releasedAt: '2026-08-07',
  notes: [
    {
      title: 'Make Bookmarked yours',
      detail:
        'Choose from five Monet-inspired palettes, System, Light, tinted Dark, or pure-black AMOLED appearance, and add your Recap name.',
    },
    {
      title: 'A richer reading recap',
      detail:
        'See every book you finished, reading activity and highlights, then share a celebratory poster with covers and standout moments.',
    },
    {
      title: 'Track every physical copy',
      detail:
        'Keep multiple editions or duplicate copies of one work, each with its own ownership, metadata, notes, progress, and reading history.',
    },
    {
      title: 'A clearer first run and backup',
      detail:
        'New readers get a short introduction, while Personalise and the shareable backup file are easier to find in Stats.',
    },
  ],
};

export function shouldShowRelease(lastSeenRelease: string | null): boolean {
  return lastSeenRelease !== CURRENT_RELEASE.id;
}
