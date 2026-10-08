import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { formatDistance } from '@/lib/geo';
import type { NearbyStore } from '@/lib/nearbyStores';
import { formatCents } from '@/lib/planner';
import {
  describeAvailability,
  statusOf,
  summarizeAvailability,
  type AvailabilityLine,
  type ItemStatus,
  type StoreResults,
} from '@/lib/storeAvailability';
import { TIER_LABEL, type PriceTier } from '@/lib/storeTiers';
import { storeMapsUrl } from '@/lib/tripPlanner';

import type { StoreCheckState } from './useStoreAvailability';

const STATUS_LABEL: Record<ItemStatus, string> = {
  found: 'Found',
  low: 'Low stock',
  out: 'Out of stock',
  'not-found': 'Not carried',
  unknown: 'Unknown',
};

/** One nearby store: details, "your list here" availability, and trip/map actions. */
export function StoreCard({
  store,
  lines,
  results,
  check,
  tripStop,
  onTrip,
  onToggleTrip,
}: {
  store: NearbyStore;
  /** Items still to buy; the availability section is hidden when empty. */
  lines: AvailabilityLine[];
  results: StoreResults | undefined;
  check: StoreCheckState | undefined;
  /** 1-based stop number when the trip visits this store. */
  tripStop: number | null;
  onTrip: boolean;
  onToggleTrip: () => void;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.top}>
        <Text style={styles.name} numberOfLines={1}>
          {store.name}
        </Text>
        <Text style={styles.distance}>{formatDistance(store.distanceKm)}</Text>
      </View>
      <Text style={styles.address} numberOfLines={2}>
        {store.address ?? 'Address not listed'}
      </Text>
      <View style={styles.badges}>
        <View style={[styles.badge, { backgroundColor: TIER_COLORS[store.tier] }]}>
          <Text style={styles.badgeText}>{TIER_LABEL[store.tier]}</Text>
        </View>
        {tripStop !== null && (
          <View style={[styles.badge, styles.tripBadge]}>
            <Text style={[styles.badgeText, styles.tripBadgeText]}>Trip stop {tripStop}</Text>
          </View>
        )}
      </View>

      {lines.length > 0 && <AvailabilitySection lines={lines} results={results} check={check} />}

      <View style={styles.actions}>
        <Pressable
          style={styles.action}
          onPress={() => void Linking.openURL(storeMapsUrl(store)).catch(() => {})}>
          <Text style={styles.actionText}>Open in Google Maps</Text>
        </Pressable>
        {lines.length > 0 && (
          <Pressable style={[styles.action, onTrip && styles.actionOn]} onPress={onToggleTrip}>
            <Text style={[styles.actionText, onTrip && styles.actionOnText]}>
              {onTrip ? '✓ Using on trip' : 'Use on trip'}
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

/**
 * "Your list here: 3 of 5 found". The store's own product names and prices
 * appear only here, inside its own card — never compared with other stores.
 */
function AvailabilitySection({
  lines,
  results,
  check,
}: {
  lines: AvailabilityLine[];
  results: StoreResults | undefined;
  check: StoreCheckState | undefined;
}) {
  const [expanded, setExpanded] = useState(false);

  if (!check || check.kind === 'none') {
    return (
      <Text style={styles.unknown}>Availability unknown — this store doesn’t publish product data.</Text>
    );
  }
  if (check.kind === 'skipped') {
    return (
      <Text style={styles.unknown}>
        Availability not checked — only the {check.catalog.maxStores} nearest {check.catalog.label}{' '}
        stores are checked.
      </Text>
    );
  }
  if (check.kind === 'checking') {
    return <Text style={styles.unknown}>Checking availability ({check.catalog.label})…</Text>;
  }
  if (check.kind === 'failed') {
    return <Text style={styles.unknown}>Availability unknown — {check.message}</Text>;
  }

  const summary = summarizeAvailability(lines, results);
  const source = check.catalog.isSample ? 'Sample data — not real' : check.catalog.label;
  return (
    <View style={styles.availability}>
      <Pressable onPress={() => setExpanded((v) => !v)}>
        <Text style={styles.availabilityLine}>
          Your list here: {describeAvailability(summary)}
        </Text>
        <Text style={styles.availabilitySource}>
          {source} · {expanded ? 'Hide items' : 'Show items'}
        </Text>
      </Pressable>
      {expanded &&
        lines.map((line) => {
          const status = statusOf(results, line.key);
          const product = results?.[line.key]?.product;
          const price = product?.promoCents ?? product?.priceCents ?? null;
          return (
            <View key={line.key} style={styles.itemRow}>
              <View style={styles.itemText}>
                <Text style={styles.itemName}>{line.name}</Text>
                {product && (
                  <Text style={styles.itemProduct} numberOfLines={2}>
                    {product.description}
                    {product.aisle ? ` · ${product.aisle}` : ''}
                  </Text>
                )}
              </View>
              <View style={styles.itemRight}>
                <Text style={[styles.itemStatus, { color: STATUS_COLORS[status] }]}>
                  {STATUS_LABEL[status]}
                </Text>
                {price !== null && (
                  <Text style={styles.itemPrice}>
                    {formatCents(price)}
                    {product?.promoCents != null ? ' sale' : ''}
                  </Text>
                )}
              </View>
            </View>
          );
        })}
    </View>
  );
}

const TIER_COLORS: Record<PriceTier, string> = {
  discount: '#dff3e4',
  standard: '#e6eef7',
  unrated: '#eeeeee',
  premium: '#f7e8dc',
};

const STATUS_COLORS: Record<ItemStatus, string> = {
  found: '#2e7d32',
  low: '#b26a00',
  out: '#c0392b',
  'not-found': '#c0392b',
  unknown: '#8a97a3',
};

const styles = StyleSheet.create({
  card: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: '#f5f7fa',
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e4e9ef',
  },
  top: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  name: {
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
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  badge: {
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#33414e',
  },
  tripBadge: {
    backgroundColor: '#2f95dc',
  },
  tripBadgeText: {
    color: '#fff',
  },
  unknown: {
    marginTop: 8,
    fontSize: 13,
    color: '#8a97a3',
  },
  availability: {
    marginTop: 8,
  },
  availabilityLine: {
    fontSize: 14,
    fontWeight: '600',
    color: '#33414e',
  },
  availabilitySource: {
    marginTop: 2,
    fontSize: 12,
    color: '#8a97a3',
  },
  itemRow: {
    flexDirection: 'row',
    paddingVertical: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#d4dbe3',
    marginTop: 6,
    gap: 8,
  },
  itemText: {
    flex: 1,
    minWidth: 0,
  },
  itemName: {
    fontSize: 14,
    color: '#33414e',
  },
  itemProduct: {
    fontSize: 12,
    color: '#5b6b7b',
  },
  itemRight: {
    alignItems: 'flex-end',
  },
  itemStatus: {
    fontSize: 13,
    fontWeight: '600',
  },
  itemPrice: {
    fontSize: 12,
    color: '#5b6b7b',
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  action: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2f95dc',
  },
  actionText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2f95dc',
  },
  actionOn: {
    backgroundColor: '#2f95dc',
  },
  actionOnText: {
    color: '#fff',
  },
});
