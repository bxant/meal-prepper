import * as Location from 'expo-location';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { formatDistance } from '@/lib/geo';
import type { NearbyStore } from '@/lib/nearbyStores';
import { fetchNearbyStores, StoreLookupError } from '@/lib/overpass';
import { TIER_LABEL, type PriceTier } from '@/lib/storeTiers';

type ScreenState =
  | { kind: 'intro' }
  | { kind: 'loading' }
  | { kind: 'denied'; canAskAgain: boolean }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; stores: NearbyStore[] };

export default function StoresScreen() {
  const [state, setState] = useState<ScreenState>({ kind: 'intro' });
  const [refreshing, setRefreshing] = useState(false);
  const mounted = useRef(true);

  const update = useCallback((next: ScreenState) => {
    if (mounted.current) setState(next);
  }, []);

  const lookup = useCallback(async () => {
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        update({ kind: 'denied', canAskAgain: permission.canAskAgain });
        return;
      }
      if (!(await Location.hasServicesEnabledAsync())) {
        update({
          kind: 'error',
          message: 'Location services are turned off. Turn them on in your phone settings and try again.',
        });
        return;
      }
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const stores = await fetchNearbyStores(position.coords);
      update({ kind: 'ready', stores });
    } catch (e) {
      update({
        kind: 'error',
        message:
          e instanceof StoreLookupError
            ? e.message
            : "Couldn't get your location. Make sure location is on and try again.",
      });
    }
  }, [update]);

  const start = useCallback(() => {
    setState({ kind: 'loading' });
    void lookup();
  }, [lookup]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await lookup();
    if (mounted.current) setRefreshing(false);
  }, [lookup]);

  useEffect(() => {
    mounted.current = true;
    // Already-granted permission: load straight away instead of showing the intro.
    Location.getForegroundPermissionsAsync()
      .then((p) => {
        if (p.granted && mounted.current) start();
      })
      .catch(() => {
        // Stay on the intro; the button retries with a full permission request.
      });
    return () => {
      mounted.current = false;
    };
  }, [start]);

  switch (state.kind) {
    case 'intro':
      return (
        <Message
          title="Affordable groceries near you"
          body="Allow location access to list nearby grocery stores. Only a rounded location (about 1 km) is sent to OpenStreetMap to look them up; your recipes and lists stay on this device."
          action={{ label: 'Find stores near me', onPress: start }}
        />
      );
    case 'loading':
      return (
        <View style={styles.center}>
          <ActivityIndicator size="large" />
          <Text style={styles.loadingText}>Finding grocery stores near you…</Text>
        </View>
      );
    case 'denied':
      return (
        <Message
          title="Location access is off"
          body="Meal Prepper needs your location (only while the app is open) to find nearby stores. Nothing else uses it."
          action={
            state.canAskAgain
              ? { label: 'Try again', onPress: start }
              : { label: 'Open settings', onPress: () => void Linking.openSettings().catch(() => {}) }
          }
        />
      );
    case 'error':
      return (
        <Message
          title="Couldn't load stores"
          body={state.message}
          action={{ label: 'Try again', onPress: start }}
        />
      );
    case 'ready':
      return (
        <FlatList
          data={state.stores}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
          ListHeaderComponent={
            state.stores.length > 0 ? (
              <Text style={styles.listHeader}>
                Sorted by estimated price tier, then distance. Tiers are a rough guess from the
                chain name — real prices aren’t available yet.
              </Text>
            ) : null
          }
          ListEmptyComponent={
            <Message
              title="No grocery stores found"
              body="OpenStreetMap lists no supermarkets or grocery stores within about 5 miles of you. Pull down to try again."
            />
          }
          renderItem={({ item }) => <StoreRow store={item} />}
        />
      );
  }
}

function StoreRow({ store }: { store: NearbyStore }) {
  return (
    <View style={styles.row}>
      <View style={styles.rowTop}>
        <Text style={styles.storeName} numberOfLines={1}>
          {store.name}
        </Text>
        <Text style={styles.distance}>{formatDistance(store.distanceKm)}</Text>
      </View>
      <Text style={styles.address} numberOfLines={2}>
        {store.address ?? 'Address not listed'}
      </Text>
      <View style={[styles.badge, { backgroundColor: TIER_COLORS[store.tier] }]}>
        <Text style={styles.badgeText}>{TIER_LABEL[store.tier]}</Text>
      </View>
    </View>
  );
}

function Message({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: { label: string; onPress: () => void };
}) {
  return (
    <View style={styles.center}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
      {action ? (
        <Pressable style={styles.button} onPress={action.onPress}>
          <Text style={styles.buttonText}>{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const TIER_COLORS: Record<PriceTier, string> = {
  discount: '#dff3e4',
  standard: '#e6eef7',
  unrated: '#eeeeee',
  premium: '#f7e8dc',
};

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 12,
    textAlign: 'center',
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    color: '#5b6b7b',
    textAlign: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 15,
    color: '#5b6b7b',
  },
  button: {
    marginTop: 20,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    backgroundColor: '#2f95dc',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  listContent: {
    padding: 16,
    flexGrow: 1,
  },
  listHeader: {
    fontSize: 13,
    lineHeight: 18,
    color: '#8a97a3',
    marginBottom: 12,
  },
  row: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: '#f5f7fa',
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e4e9ef',
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  storeName: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
    marginRight: 8,
  },
  distance: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2f95dc',
  },
  address: {
    marginTop: 2,
    fontSize: 14,
    color: '#5b6b7b',
  },
  badge: {
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#33414e',
  },
});
