import { Tabs } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import type { ColorValue } from 'react-native';
import { colors } from '../../lib/theme';

type TabSymbol = SymbolViewProps['name'];

function TabIcon({ name, color }: { name: TabSymbol; color: ColorValue }) {
  return <SymbolView name={name} size={22} tintColor={color} />;
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTitleStyle: { color: colors.text },
        tabBarStyle: { backgroundColor: colors.bg, borderTopColor: colors.border },
        tabBarActiveTintColor: colors.green,
        tabBarInactiveTintColor: colors.textDim,
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Shelf',
          tabBarAccessibilityLabel: 'Shelf',
          tabBarIcon: ({ color }) => (
            <TabIcon name={{ ios: 'books.vertical', android: 'library_books', web: 'library_books' }} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: 'Search',
          tabBarAccessibilityLabel: 'Search books',
          tabBarIcon: ({ color }) => (
            <TabIcon name={{ ios: 'magnifyingglass', android: 'search', web: 'search' }} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="stats"
        options={{
          title: 'Stats',
          tabBarAccessibilityLabel: 'Reading statistics',
          tabBarIcon: ({ color }) => (
            <TabIcon name={{ ios: 'chart.bar', android: 'bar_chart', web: 'bar_chart' }} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
