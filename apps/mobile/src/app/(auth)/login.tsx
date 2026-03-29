import { View, Text, StyleSheet } from 'react-native'

export default function LoginScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>BizTrack CM</Text>
      <Text>Login — coming soon</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  title: { fontSize: 28, fontWeight: 'bold', color: '#16a34a', marginBottom: 8 },
})
