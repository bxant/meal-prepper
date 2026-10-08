import * as Location from 'expo-location';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

import { StoreCard } from '@/components/stores/StoreCard';
import { TripCard } from '@/components/stores/TripCard';
import { useStoreAvailability } from '@/components/stores/useStoreAvailability';
import { listRecipesWithIngredients } from '@/db/recipes';
import { listShoppingListItems } from '@/db/shoppingList';
import type { LatLng } from '@/lib/geo';
import { createKrogerCatalog } from '@/lib/kroger';
import {
  DEFAULT_DISTANCE_MILES,
  DISTANCE_OPTIONS_MILES,
  selectStores,
  withinMiles,
  type DistanceMiles,
  type NearbyStore,
  type StoreSort,
} from '@/lib/nearbyStores';
import { fetchNearbyStores, StoreLookupError } from '@/lib/overpass';
import { averagePriceEstimator } from '@/lib/prices/estimate';
import { sampleCatalog } from '@/lib/sampleAvailability';
import { DEFAULT_SETTINGS, hasKrogerCredentials, loadSettings, type AppSettings } from '@/lib/settings';
import { buildShoppingList, type ShoppingListLine } from '@/lib/shoppingList';
import { remainingLines } from '@/lib/shoppingListSummary';
import {
  coverageBucket,
  rankStoresWithCoverage,
  summarizeAvailability,
  type StoreCatalog,
} from '@/lib/storeAvailability';
import { alternativesForStop, planTrip, recommendStores, swapStore } from '@/lib/tripPlanner';

type ScreenState =
  | { kind: 'intro' }
  | { kind: 'loading'; miles: number }
  | { kind: 'denied'; canAskAgain: boolean }
  | { kind: 'error'; message: string }
  | { kind: 'ready' };

/** What the last successful lookup returned: every store within `radiusMiles` of `origin`. */
interface Lookup {
  /** Precise device position; stays on the phone. */
  origin: LatLng;
  radiusMiles: number;
  stores: NearbyStore[];
}

const SORT_OPTIONS: { value: StoreSort; label: string }[] = [
  { value: 'price', label: 'Cheapest first' },
  { value: 'distance', label: 'Nearest first' },
];

export default function StoresScreen() {
  const db = useSQLiteContext();
  const [state, setState] = useState<ScreenState>({ kind: 'intro' });
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [distance, setDistance] = useState<DistanceMiles>(DEFAULT_DISTANCE_MILES);
  const [sort, setSort] = useState<StoreSort>('price');
  const [refreshing, setRefreshing] = useState(false);
  const [lines, setLines] = useState<ShoppingListLine[]>([]);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  /** Stores the user picked for the trip; null = use the suggestion. */
  const [chosenIds, setChosenIds] = useState<string[] | null>(null);
  const mounted = useRef(true);
  /** Bumped per lookup so a slow, outdated response can't overwrite a newer one. */
  const generation = useRef(0);

  // The shopping list and keys can change on other screens; reload on focus.
  useFocusEffect(
    useCallback(() => {
      Promise.all([listRecipesWithIngredients(db), listShoppingListItems(db)])
        .then(([recipes, items]) => {
          if (mounted.current) setLines(remainingLines(buildShoppingList(recipes), items));
        })
        .catch(() => {
          // Local-only read; keep the current list on failure.
        });
      loadSettings()
        .then((value) => {
          if (mounted.current) setSettings(value);
        })
        .catch(() => {});
    }, [db])
  );

  const lineKey = lines.map((l) => l.key).join('\n');
  useEffect(() => {
    // A different list means a different best trip.
    setChosenIds(null);
  }, [lineKey]);

  /** Find stores within `miles`; reuse `origin` when given instead of a fresh GPS fix. */
  const lookUp = useCallback(async (miles: number, origin?: LatLng) => {
    const id = ++generation.current;
    const current = () => mounted.current && id === generation.current;
    try {
      let position = origin;
      if (!position) {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (!permission.granted) {
          if (current()) setState({ kind: 'denied', canAskAgain: permission.canAskAgain });
          return;
        }
        if (!(await Location.hasServicesEnabledAsync())) {
          if (current()) {
            setState({
              kind: 'error',
              message: 'Location services are turned off. Turn them on in your phone settings and try again.',
            });
          }
          return;
        }
        position = (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })).coords;
      }
      const stores = await fetchNearbyStores(position, miles);
      if (!current()) return;
      setLookup({ origin: { latitude: position.latitude, longitude: position.longitude }, radiusMiles: miles, stores });
      setState({ kind: 'ready' });
    } catch (e) {
      if (!current()) return;
      setState({
        kind: 'error',
        message:
          e instanceof StoreLookupError
            ? e.message
            : "Couldn't get your location. Make sure location is on and try again.",
      });
    }
  }, []);

  const start = useCallback(() => {
    setState({ kind: 'loading', miles: distance });
    void lookUp(distance);
  }, [distance, lookUp]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await lookUp(distance);
    if (mounted.current) setRefreshing(false);
  }, [distance, lookUp]);

  const chooseDistance = (miles: DistanceMiles) => {
    setDistance(miles);
    setChosenIds(null);
    // Already have every store this close: just filter. Otherwise search wider.
    if (lookup && miles <= lookup.radiusMiles) {
      generation.current += 1; // Drop any wider search still in flight.
      setState({ kind: 'ready' });
      return;
    }
    setState({ kind: 'loading', miles });
    void lookUp(miles, lookup?.origin);
  };

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
    // Only on mount; later lookups come from the user.
  }, []);

  // Live Kroger data when keys are set (one catalog per key pair, so its
  // session cache survives re-renders), then sample data if the demo is on.
  const { krogerClientId, krogerClientSecret, demoAvailability } = settings;
  const catalogs = useMemo<StoreCatalog[]>(() => {
    const list: StoreCatalog[] = [];
    if (hasKrogerCredentials({ krogerClientId, krogerClientSecret })) {
      list.push(createKrogerCatalog({ clientId: krogerClientId, clientSecret: krogerClientSecret }));
    }
    if (demoAvailability) list.push(sampleCatalog);
    return list;
  }, [krogerClientId, krogerClientSecret, demoAvailability]);

  const nearby = useMemo(
    () => (lookup ? withinMiles(lookup.stores, distance) : []),
    [lookup, distance]
  );
  const availability = useStoreAvailability(nearby, lines, catalogs);

  const visible = useMemo(() => {
    if (!lookup) return [];
    const bucketOf = (store: NearbyStore) =>
      coverageBucket(summarizeAvailability(lines, availability.table[store.id]));
    return selectStores(lookup.stores, distance, sort, (stores) => rankStoresWithCoverage(stores, bucketOf));
  }, [lookup, distance, sort, lines, availability.table]);

  const suggested = useMemo(
    () => recommendStores(nearby, lines, availability.table),
    [nearby, lines, availability.table]
  );
  const chosen = chosenIds ?? suggested;
  const plan = useMemo(
    () =>
      lookup && lines.length > 0
        ? planTrip(lookup.origin, nearby, chosen, lines, availability.table, averagePriceEstimator)
        : null,
    [lookup, nearby, chosen, lines, availability.table]
  );
  const stopNumber = useMemo(
    () => new Map((plan?.stops ?? []).map((stop, i) => [stop.store.id, i + 1])),
    [plan]
  );

  const toggleTrip = (storeId: string) =>
    setChosenIds(chosen.includes(storeId) ? chosen.filter((id) => id !== storeId) : [...chosen, storeId]);

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
          <Text style={styles.loadingText}>Finding grocery stores within {state.miles} mi…</Text>
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
        <View style={styles.flex}>
          <DistanceBar distance={distance} onChange={chooseDistance} />
          <Message
            title="Couldn't load stores"
            body={state.message}
            action={{ label: 'Try again', onPress: start }}
          />
        </View>
      );
    case 'ready': {
      const wider = DISTANCE_OPTIONS_MILES.find((m) => m > distance);
      return (
        <FlatList
          data={visible}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
          ListHeaderComponent={
            <View>
              <DistanceBar distance={distance} onChange={chooseDistance} />
              <ChipRow
                label="Order"
                options={SORT_OPTIONS}
                value={sort}
                onChange={setSort}
              />
              {visible.length > 0 && (
                <>
                  <TripCard
                    itemCount={lines.length}
                    plan={plan}
                    checking={availability.checking}
                    customized={chosenIds !== null}
                    alternativesFor={(stop) =>
                      alternativesForStop(stop, nearby, chosen, availability.table)
                    }
                    onSwap={(fromId, toId) => setChosenIds(swapStore(chosen, fromId, toId))}
                    onReset={() => setChosenIds(null)}
                  />
                  <SourceNote settings={settings} errors={availability.errors} hasLines={lines.length > 0} />
                  <Text style={styles.listHeader}>
                    {visible.length} store{visible.length === 1 ? '' : 's'} within {distance} mi ·{' '}
                    {sort === 'price'
                      ? 'cheapest price tier first (a rough guess from the chain name), then nearest.'
                      : 'nearest first.'}
                  </Text>
                </>
              )}
            </View>
          }
          ListEmptyComponent={
            <Message
              title={`No grocery stores within ${distance} mi`}
              body={`OpenStreetMap lists no supermarkets or grocery stores within ${distance} mile${distance === 1 ? '' : 's'} of you.`}
              action={
                wider !== undefined
                  ? { label: `Search within ${wider} mi`, onPress: () => chooseDistance(wider) }
                  : undefined
              }
            />
          }
          renderItem={({ item }) => (
            <StoreCard
              store={item}
              lines={lines}
              results={availability.table[item.id]}
              check={availability.checkState[item.id]}
              tripStop={stopNumber.get(item.id) ?? null}
              onTrip={chosen.includes(item.id)}
              onToggleTrip={() => toggleTrip(item.id)}
            />
          )}
        />
      );
    }
  }
}

function DistanceBar({
  distance,
  onChange,
}: {
  distance: DistanceMiles;
  onChange: (miles: DistanceMiles) => void;
}) {
  return (
    <ChipRow
      label="Within"
      options={DISTANCE_OPTIONS_MILES.map((m) => ({ value: m, label: `${m} mi` }))}
      value={distance}
      onChange={onChange}
    />
  );
}

function ChipRow<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.chipRow}>
      <Text style={styles.chipLabel}>{label}</Text>
      <View style={styles.chips}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={String(option.value)}
              style={[styles.chip, selected && styles.chipSelected]}
              onPress={() => onChange(option.value)}
              accessibilityState={{ selected }}>
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** Where "N of M found" comes from, in one line. */
function SourceNote({
  settings,
  errors,
  hasLines,
}: {
  settings: AppSettings;
  errors: string[];
  hasLines: boolean;
}) {
  if (!hasLines) return null;
  const notes: string[] = [];
  if (hasKrogerCredentials(settings)) {
    notes.push('Item availability comes from Kroger for Kroger-family stores; other stores show “unknown”.');
  } else {
    notes.push('Item availability is unknown for these stores. Add Kroger keys in Settings to check Kroger-family stores.');
  }
  if (settings.demoAvailability) notes.push('Demo is on: “Sample data” availability is made up.');
  return (
    <View style={styles.sourceNote}>
      {notes.map((note) => (
        <Text key={note} style={styles.listHeader}>
          {note}
        </Text>
      ))}
      {errors.map((error) => (
        <Text key={error} style={styles.errorNote}>
          {error}
        </Text>
      ))}
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

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
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
    marginBottom: 8,
  },
  sourceNote: {
    marginBottom: 4,
  },
  errorNote: {
    fontSize: 13,
    lineHeight: 18,
    color: '#c0392b',
    marginBottom: 8,
  },
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    paddingHorizontal: 0,
  },
  chipLabel: {
    width: 56,
    fontSize: 13,
    fontWeight: '600',
    color: '#5b6b7b',
  },
  chips: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#d4dbe3',
    backgroundColor: '#fff',
  },
  chipSelected: {
    backgroundColor: '#2f95dc',
    borderColor: '#2f95dc',
  },
  chipText: {
    fontSize: 14,
    color: '#33414e',
  },
  chipTextSelected: {
    color: '#fff',
    fontWeight: '600',
  },
});
