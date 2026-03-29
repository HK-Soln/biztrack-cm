import { View, Text, StyleSheet } from 'react-native'

export default function SellScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Vendre</Text>
      <Text style={styles.sub}>Tap-to-sell POS — coming soon</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#f9fafb' },
  title: { fontSize: 22, fontWeight: '700', color: '#111827', marginBottom: 4 },
  sub: { color: '#6b7280' },
})
