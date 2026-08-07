import { Image, type ImageProps } from 'expo-image';
import { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  type ImageStyle,
  type StyleProp,
  type TextStyle,
} from 'react-native';
import { coverRequestUrl } from '../lib/openlibrary';
import { useThemedStyles, type ThemeColors } from '../lib/theme';

type BookCoverProps = Omit<ImageProps, 'source' | 'style' | 'onError'> & {
  uri: string | null;
  title: string;
  style: StyleProp<ImageStyle>;
  showTitleFallback?: boolean;
  fallbackTextStyle?: StyleProp<TextStyle>;
  onSettled?: () => void;
};

export function BookCover({
  uri,
  title,
  style,
  showTitleFallback = false,
  fallbackTextStyle,
  onSettled,
  ...imageProps
}: BookCoverProps) {
  const styles = useThemedStyles(createStyles);
  const requestUri = uri ? coverRequestUrl(uri) : null;
  const [failedUri, setFailedUri] = useState<string | null>(null);

  useEffect(() => {
    setFailedUri(null);
    if (!requestUri) onSettled?.();
  }, [requestUri, onSettled]);

  if (!requestUri || failedUri === requestUri) {
    return (
      <View style={[style, styles.fallback]}>
        <Text
          style={[styles.fallbackText, fallbackTextStyle]}
          numberOfLines={showTitleFallback ? 4 : 1}
        >
          {showTitleFallback ? title : '📖'}
        </Text>
      </View>
    );
  }

  return (
    <Image
      {...imageProps}
      source={{ uri: requestUri }}
      style={style}
      contentFit={imageProps.contentFit ?? 'cover'}
      cachePolicy={imageProps.cachePolicy ?? 'memory-disk'}
      recyclingKey={requestUri}
      onLoad={(event) => {
        imageProps.onLoad?.(event);
        onSettled?.();
      }}
      onError={() => {
        setFailedUri(requestUri);
        onSettled?.();
      }}
    />
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    padding: 6,
  },
  fallbackText: {
    color: colors.textDim,
    fontSize: 20,
    fontWeight: '600',
    textAlign: 'center',
  },
});
