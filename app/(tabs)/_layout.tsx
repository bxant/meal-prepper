import { SymbolView } from 'expo-symbols';
import { Link, Tabs } from 'expo-router';
import { Pressable, Text } from 'react-native';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { useClientOnlyValue } from '@/components/useClientOnlyValue';
import { ShoppingSummaryProvider, useShoppingSummary } from '@/components/ShoppingSummary';

export default function TabLayout() {
  return (
    <ShoppingSummaryProvider>
      <TabNavigator />
    </ShoppingSummaryProvider>
  );
}

function TabNavigator() {
  const colorScheme = useColorScheme();
  const { summary } = useShoppingSummary();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme].tint,
        // Disable the static render of the header on web
        // to prevent a hydration error in React Navigation v6.
        headerShown: useClientOnlyValue(false, true),
      }}>
      <Tabs.Screen
        name="plan"
        options={{
          title: 'Plan',
          tabBarIcon: ({ color }) => (
            <SymbolView
              name={{
                ios: 'calendar',
                android: 'calendar_month',
                web: 'calendar_month',
              }}
              tintColor={color}
              size={28}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="index"
        options={{
          title: 'Recipes',
          tabBarIcon: ({ color }) => (
            <SymbolView
              name={{
                ios: 'list.bullet',
                android: 'format_list_bulleted',
                web: 'format_list_bulleted',
              }}
              tintColor={color}
              size={28}
            />
          ),
          headerRight: () => (
            <Link href="/recipe/new" asChild>
              <Pressable style={{ marginRight: 15 }} testID="new-recipe-button">
                {({ pressed }) => (
                  <Text
                    style={{
                      fontSize: 26,
                      lineHeight: 30,
                      color: Colors[colorScheme].tint,
                      opacity: pressed ? 0.5 : 1,
                    }}>
                    +
                  </Text>
                )}
              </Pressable>
            </Link>
          ),
        }}
      />
      <Tabs.Screen
        name="shopping"
        options={{
          title: 'Shopping List',
          tabBarLabel: 'Shopping',
          // Unchecked items left to buy; no badge once everything is ticked off.
          tabBarBadge: summary.remaining > 0 ? summary.remaining : undefined,
          tabBarIcon: ({ color }) => (
            <SymbolView
              name={{
                ios: 'checklist',
                android: 'checklist',
                web: 'checklist',
              }}
              tintColor={color}
              size={28}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="stores"
        options={{
          title: 'Stores & Prices',
          headerRight: () => (
            <Link href="/settings" asChild>
              <Pressable style={{ marginRight: 15 }} hitSlop={8} accessibilityLabel="Settings">
                {({ pressed }) => (
                  <SymbolView
                    name={{ ios: 'gearshape', android: 'settings', web: 'settings' }}
                    tintColor={Colors[colorScheme].tint}
                    size={24}
                    style={{ opacity: pressed ? 0.5 : 1 }}
                  />
                )}
              </Pressable>
            </Link>
          ),
          tabBarIcon: ({ color }) => (
            <SymbolView
              name={{
                ios: 'cart',
                android: 'shopping_cart',
                web: 'shopping_cart',
              }}
              tintColor={color}
              size={28}
            />
          ),
        }}
      />
    </Tabs>
  );
}
