import { StyleSheet, Text, View } from 'react-native';

export default function StoresScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Stores & Prices</Text>
      <Text style={styles.body}>
        Coming next: nearby low-cost grocery stores and price comparison, with Walmart as the
        baseline and cheaper options always shown.
      </Text>
      <Text style={styles.note}>Recipes and shopping lists work now — tap the Recipes tab.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 12,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    color: '#5b6b7b',
    textAlign: 'center',
  },
  note: {
    marginTop: 16,
    fontSize: 14,
    color: '#8a97a3',
    textAlign: 'center',
  },
});
