import type { ViewStyle } from 'react-native';

export const LIBRARY_MAX_WIDTH = 1200;
export const READABLE_MAX_WIDTH = 900;
export const DESKTOP_BREAKPOINT = 900;

export const libraryContentStyle: ViewStyle = {
  width: '100%',
  maxWidth: LIBRARY_MAX_WIDTH,
  alignSelf: 'center',
};

export const readableContentStyle: ViewStyle = {
  width: '100%',
  maxWidth: READABLE_MAX_WIDTH,
  alignSelf: 'center',
};

export function constrainedLibraryWidth(windowWidth: number): number {
  return Math.min(windowWidth, LIBRARY_MAX_WIDTH);
}

export function libraryGridColumns(windowWidth: number): number {
  if (windowWidth >= 1100) return 6;
  if (windowWidth >= 700) return 5;
  return 4;
}

export function gridCoverWidth(
  windowWidth: number,
  columns: number,
  horizontalInset: number,
  gap: number
): number {
  const availableWidth = constrainedLibraryWidth(windowWidth);
  return Math.floor(
    (availableWidth - horizontalInset - gap * (columns - 1)) / columns
  );
}

export function isDesktopWidth(windowWidth: number): boolean {
  return windowWidth >= DESKTOP_BREAKPOINT;
}
