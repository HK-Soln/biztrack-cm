import { Stack } from 'expo-router'

export default function RootLayout() {
  return (
    <Stack screenOptions={{ headerStyle: { backgroundColor: '#16a34a' }, headerTintColor: '#fff' }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
    </Stack>
  )
}
