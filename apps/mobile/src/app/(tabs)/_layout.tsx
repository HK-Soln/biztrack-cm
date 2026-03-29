import { Tabs } from 'expo-router'

export default function TabLayout() {
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: '#16a34a' }}>
      <Tabs.Screen name="index" options={{ title: 'Accueil' }} />
      <Tabs.Screen name="sell" options={{ title: 'Vendre' }} />
      <Tabs.Screen name="products" options={{ title: 'Produits' }} />
      <Tabs.Screen name="expenses" options={{ title: 'Dépenses' }} />
      <Tabs.Screen name="reports" options={{ title: 'Rapports' }} />
    </Tabs>
  )
}
