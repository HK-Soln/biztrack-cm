export function TopBar() {
  return (
    <header style={{ height: 52, background: '#fff', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 1.5rem' }}>
      <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>Derniere synchro: il y a 2 min</div>
      <div style={{ fontSize: '0.85rem', color: '#374151' }}>Jean Kamga</div>
    </header>
  )
}
