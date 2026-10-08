import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { formatDistance } from '@/lib/geo';
import type { NearbyStore } from '@/lib/nearbyStores';
import { formatCents } from '@/lib/planner';
import { AVERAGE_PRICE_LABEL } from '@/lib/prices/estimate';
import { tripMapsUrl, type TripPlan, type TripStop } from '@/lib/tripPlanner';

/**
 * The suggested (or user-adjusted) shopping trip: one chained route through
 * the chosen stores with what to get at each and the expected total.
 */
export function TripCard({
  itemCount,
  plan,
  checking,
  customized,
  alternativesFor,
  onSwap,
  onReset,
}: {
  /** Items still to buy. */
  itemCount: number;
  plan: TripPlan | null;
  checking: boolean;
  /** The user changed the suggested stores. */
  customized: boolean;
  alternativesFor: (stop: TripStop) => NearbyStore[];
  onSwap: (fromId: string, toId: string) => void;
  onReset: () => void;
}) {
  if (itemCount === 0) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>Shopping trip</Text>
        <Text style={styles.muted}>
          Your shopping list is empty or all checked off. Add recipes to plan a trip.
        </Text>
      </View>
    );
  }
  if (!plan || plan.stops.length === 0) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>Shopping trip · {plural(itemCount, 'item')}</Text>
        <Text style={styles.muted}>
          {checking
            ? 'Checking availability…'
            : 'None of the stores in range can supply your list. Try a larger distance.'}
        </Text>
        {customized && <ResetLink onReset={onReset} />}
      </View>
    );
  }

  const unverified = plan.stops.some((stop) => stop.purchases.some((p) => !p.verified));
  const mapsUrl = tripMapsUrl(plan.stops);
  return (
    <View style={styles.card}>
      <Text style={styles.title}>Shopping trip · {plural(itemCount, 'item')}</Text>
      <Text style={styles.total}>Expected ≈ {formatCents(plan.totalCents)}</Text>
      <Text style={styles.muted}>
        At {AVERAGE_PRICE_LABEL}, for the amounts in your recipes — not store prices.
        {plan.unpricedCount > 0 ? ` ${plural(plan.unpricedCount, 'item')} without an average price.` : ''}
      </Text>

      {plan.stops.map((stop, index) => {
        const alternatives = alternativesFor(stop);
        return (
          <View key={stop.store.id} style={styles.stop}>
            <Text style={styles.stopTitle}>
              {index + 1}. {stop.store.name}
            </Text>
            <Text style={styles.muted}>
              {formatDistance(stop.legKm)} {index === 0 ? 'from you' : 'from the last stop'} ·{' '}
              {plural(stop.purchases.length, 'item')}
              {stop.subtotalCents > 0 ? ` · ≈ ${formatCents(stop.subtotalCents)}` : ''}
            </Text>
            <Text style={styles.items}>
              {stop.purchases.map((p) => (p.verified ? p.line.name : `${p.line.name}?`)).join(', ')}
            </Text>
            {alternatives.length > 0 && (
              <View style={styles.swapRow}>
                <Text style={styles.swapLabel}>Or get these at:</Text>
                {alternatives.map((alt) => (
                  <Pressable key={alt.id} style={styles.swapChip} onPress={() => onSwap(stop.store.id, alt.id)}>
                    <Text style={styles.swapChipText}>
                      {alt.name} · {formatDistance(alt.distanceKm)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        );
      })}

      {plan.missing.length > 0 && (
        <Text style={styles.warning}>
          Not available at your chosen stores: {plan.missing.map((l) => l.name).join(', ')}. Add
          another store with “Use on trip”.
        </Text>
      )}
      {unverified && (
        <Text style={styles.muted}>
          “?” = availability unknown at that store; the trip assumes it carries the item.
        </Text>
      )}
      {checking && <Text style={styles.muted}>Still checking availability; the trip may change.</Text>}

      <View style={styles.actions}>
        {mapsUrl && (
          <Pressable style={styles.primary} onPress={() => void Linking.openURL(mapsUrl).catch(() => {})}>
            <Text style={styles.primaryText}>Open route in Google Maps</Text>
          </Pressable>
        )}
        {customized && <ResetLink onReset={onReset} />}
      </View>
    </View>
  );
}

function ResetLink({ onReset }: { onReset: () => void }) {
  return (
    <Pressable onPress={onReset} hitSlop={8}>
      <Text style={styles.reset}>Back to suggested stores</Text>
    </Pressable>
  );
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

const styles = StyleSheet.create({
  card: {
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#eef6fc',
    borderWidth: 1,
    borderColor: '#cfe3f3',
    marginBottom: 12,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 4,
  },
  total: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1d6fa5',
  },
  muted: {
    fontSize: 13,
    lineHeight: 18,
    color: '#5b6b7b',
  },
  stop: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#b9d3e8',
  },
  stopTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  items: {
    marginTop: 2,
    fontSize: 14,
    color: '#33414e',
  },
  swapRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  swapLabel: {
    fontSize: 12,
    color: '#5b6b7b',
  },
  swapChip: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2f95dc',
  },
  swapChipText: {
    fontSize: 12,
    color: '#2f95dc',
  },
  warning: {
    marginTop: 10,
    fontSize: 13,
    color: '#b26a00',
  },
  actions: {
    marginTop: 12,
    gap: 10,
    alignItems: 'flex-start',
  },
  primary: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: '#2f95dc',
  },
  primaryText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  reset: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2f95dc',
  },
});
