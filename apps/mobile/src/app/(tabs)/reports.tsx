import { useState, useEffect, useMemo } from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Platform,
  StyleSheet,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  CreditCard,
  Info,
  DollarSign,
  Activity,
} from 'lucide-react-native'
import { useSalesStore } from '../../store/useSalesStore'
import { useExpensesStore, EXPENSE_CATEGORIES } from '../../store/useExpensesStore'
import { useDebtsStore } from '../../store/useDebtsStore'
import { AppSyncIndicator } from '../../components/ui'

// Premium Palette Colors
const NAVY = '#042C53'
const BLUE = '#185FA5'
const CREAM = '#F1EFE8'
const GREEN = '#639922'
const AMBER = '#BA7517'
const WHITE = '#FFFFFF'
const MUTED = '#888780'
const BORDER = '#D3D1C7'

const formatCFA = (val: number) => val.toLocaleString('fr-FR') + ' F'

export default function ReportsScreen() {
  const insets = useSafeAreaInsets()
  const [timeframe, setTimeframe] = useState<'TODAY' | 'WEEK' | 'MONTH'>('MONTH')

  // Bind Zustand Stores
  const sales = useSalesStore((state) => state.sales)
  const expenses = useExpensesStore((state) => state.expenses)
  
  const getOutstandingBalance = useDebtsStore((state) => state.getOutstandingBalance)

  // Re-fetch all metrics on screen mount to guarantee accurate real-time data
  useEffect(() => {
    useSalesStore.getState().fetchSales()
    useExpensesStore.getState().fetchExpenses()
    useDebtsStore.getState().fetchDebts()
  }, [])

  // Calculate Date Thresholds
  const thresholds = useMemo(() => {
    const now = new Date()
    const todayStr = now.toISOString().slice(0, 10)

    // Current Week (Monday 00:00:00 to now)
    const startOfWeek = new Date(now)
    const day = startOfWeek.getDay()
    const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1)
    startOfWeek.setDate(diff)
    startOfWeek.setHours(0, 0, 0, 0)

    // Current Month (1st Day of month 00:00:00 to now)
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    startOfMonth.setHours(0, 0, 0, 0)

    return {
      todayStr,
      startOfWeek,
      startOfMonth,
    }
  }, [])

  // Filter Sales & Expenses & Debts by selected Timeframe
  const { filteredSales, filteredExpenses } = useMemo(() => {

    if (timeframe === 'TODAY') {
      return {
        filteredSales: sales.filter((s) => s.createdAt.slice(0, 10) === thresholds.todayStr),
        filteredExpenses: expenses.filter((e) => e.date === thresholds.todayStr),
      }
    }

    if (timeframe === 'WEEK') {
      const minTime = thresholds.startOfWeek.getTime()
      return {
        filteredSales: sales.filter((s) => new Date(s.createdAt).getTime() >= minTime),
        filteredExpenses: expenses.filter(
          (e) => new Date(e.date + 'T00:00:00').getTime() >= minTime
        ),
      }
    }

    // Default: THIS_MONTH
    const minTime = thresholds.startOfMonth.getTime()
    return {
      filteredSales: sales.filter((s) => new Date(s.createdAt).getTime() >= minTime),
      filteredExpenses: expenses.filter(
        (e) => new Date(e.date + 'T00:00:00').getTime() >= minTime
      ),
    }
  }, [timeframe, sales, expenses, thresholds])

  // Aggregate Key Statistics
  const stats = useMemo(() => {
    const totalSales = filteredSales.reduce((sum, s) => sum + s.total, 0)
    const totalExpenses = filteredExpenses.reduce((sum, e) => sum + e.amount, 0)
    const netProfit = totalSales - totalExpenses

    // Paid Volume vs Credit Volume
    const paidSales = filteredSales.filter((s) => s.paymentMethod !== 'CREDIT')
    const paidVolume = paidSales.reduce((sum, s) => sum + s.total, 0)
    const creditSales = filteredSales.filter((s) => s.paymentMethod === 'CREDIT')
    const creditVolume = creditSales.reduce((sum, s) => sum + s.total, 0)

    const profitMargin = totalSales > 0 ? (netProfit / totalSales) * 100 : 0

    // Expenses breakdown
    const expBreakdown: Record<string, number> = {}
    filteredExpenses.forEach((e) => {
      expBreakdown[e.category] = (expBreakdown[e.category] || 0) + e.amount
    })

    return {
      totalSales,
      totalExpenses,
      netProfit,
      paidVolume,
      creditVolume,
      profitMargin,
      expBreakdown,
    }
  }, [filteredSales, filteredExpenses])

  // Get dynamic outstanding balances from SQLite
  const outstandingReceivable = getOutstandingBalance('RECEIVABLE')
  const outstandingPayable = getOutstandingBalance('PAYABLE')

  // Pure View Grid Timeline Data Calculations
  const chartData = useMemo(() => {
    if (timeframe === 'TODAY') {
      const intervals = ['00h-06h', '06h-12h', '12h-18h', '18h-24h']
      const data = intervals.map((label) => ({ label, revenue: 0, expenses: 0 }))

      filteredSales.forEach((s) => {
        const hr = new Date(s.createdAt).getHours()
        if (hr < 6) data[0].revenue += s.total
        else if (hr < 12) data[1].revenue += s.total
        else if (hr < 18) data[2].revenue += s.total
        else data[3].revenue += s.total
      })

      // Distribute today's expenses evenly across standard opening periods for clean charting representation
      const totalExp = filteredExpenses.reduce((sum, e) => sum + e.amount, 0)
      if (totalExp > 0) {
        data[1].expenses += totalExp / 2
        data[2].expenses += totalExp / 2
      }
      return data
    }

    if (timeframe === 'WEEK') {
      const intervals = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
      const data = intervals.map((label) => ({ label, revenue: 0, expenses: 0 }))

      filteredSales.forEach((s) => {
        const d = new Date(s.createdAt)
        const dDay = d.getDay() // 0 Sun, 1-6 Mon-Sat
        const index = dDay === 0 ? 6 : dDay - 1
        if (index >= 0 && index < 7) {
          data[index].revenue += s.total
        }
      })

      filteredExpenses.forEach((e) => {
        const d = new Date(e.date + 'T00:00:00')
        const dDay = d.getDay()
        const index = dDay === 0 ? 6 : dDay - 1
        if (index >= 0 && index < 7) {
          data[index].expenses += e.amount
        }
      })

      return data
    }

    // Default: MONTH (4 weeks visualization)
    const intervals = ['Sem 1', 'Sem 2', 'Sem 3', 'Sem 4']
    const data = intervals.map((label) => ({ label, revenue: 0, expenses: 0 }))

    filteredSales.forEach((s) => {
      const date = new Date(s.createdAt).getDate()
      if (date <= 7) data[0].revenue += s.total
      else if (date <= 14) data[1].revenue += s.total
      else if (date <= 21) data[2].revenue += s.total
      else data[3].revenue += s.total
    })

    filteredExpenses.forEach((e) => {
      const date = new Date(e.date + 'T00:00:00').getDate()
      if (date <= 7) data[0].expenses += e.amount
      else if (date <= 14) data[1].expenses += e.amount
      else if (date <= 21) data[2].expenses += e.amount
      else data[3].expenses += e.amount
    })

    return data
  }, [timeframe, filteredSales, filteredExpenses])

  // Get max interval value for scaling bar heights
  const maxVal = useMemo(() => {
    let max = 0
    chartData.forEach((d) => {
      if (d.revenue > max) max = d.revenue
      if (d.expenses > max) max = d.expenses
    })
    return max > 0 ? max : 1000
  }, [chartData])

  return (
    <View style={{ flex: 1, backgroundColor: CREAM }}>
      <StatusBar
        barStyle="light-content"
        {...(Platform.OS === 'android' && { backgroundColor: NAVY })}
      />

      {/* ─── Premium Sticky Header ─────────────────────────────────────────── */}
      <View
        style={{
          backgroundColor: NAVY,
          paddingTop: insets.top + 12,
          paddingBottom: 18,
          paddingHorizontal: 20,
          borderBottomWidth: 1,
          borderBottomColor: BLUE + '20',
        }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View>
            <Text style={{ fontSize: 12, color: '#85B7EB', fontWeight: '600', letterSpacing: 0.5 }}>
              ANALYTIQUE CM
            </Text>
            <Text style={{ fontSize: 22, fontWeight: '800', color: WHITE, marginTop: 2 }}>
              Rapports Financiers
            </Text>
          </View>
          <AppSyncIndicator />
        </View>

        {/* Timeframe selector tabs */}
        <View style={styles.timeframeTabs}>
          {(
            [
              { id: 'TODAY', label: "Aujourd'hui" },
              { id: 'WEEK', label: 'Cette semaine' },
              { id: 'MONTH', label: 'Ce mois-ci' },
            ] as const
          ).map((t) => {
            const active = timeframe === t.id
            return (
              <TouchableOpacity
                key={t.id}
                onPress={() => setTimeframe(t.id)}
                activeOpacity={0.8}
                style={[styles.tabButton, active && styles.activeTabButton]}
              >
                <Text style={[styles.tabLabel, active && styles.activeTabLabel]}>{t.label}</Text>
              </TouchableOpacity>
            )
          })}
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 20, paddingBottom: insets.bottom + 30 }}
      >
        {/* ─── Section 1: Dynamic Visual Trend Bar Chart ──────────────────── */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={getCardIconBoxStyle(addOpacity(BLUE, '12'))}>
              <Activity size={18} color={BLUE} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>Évolution du commerce</Text>
              <Text style={styles.cardSubtitle}>Recettes vs Dépenses par période</Text>
            </View>
          </View>

          {/* Pure CSS Vertical Bar Chart Grid */}
          <View style={styles.chartContainer}>
            {/* Background grid lines */}
            <View style={styles.chartGridLines}>
              {[0, 1, 2].map((i) => (
                <View key={i} style={styles.gridLine} />
              ))}
            </View>

            {/* Columns list */}
            <View style={styles.chartColumnsWrapper}>
              {chartData.map((d, index) => {
                const revHeightPercent = Math.max(5, (d.revenue / maxVal) * 100)
                const expHeightPercent = Math.max(5, (d.expenses / maxVal) * 100)

                return (
                  <View key={index} style={styles.chartColumn}>
                    <View style={styles.barsContainer}>
                      {/* Revenue Bar */}
                      <View
                        style={[
                          styles.bar,
                          { height: `${revHeightPercent}%`, backgroundColor: BLUE },
                        ]}
                      >
                        {d.revenue > 0 && (
                          <View style={styles.barTooltip}>
                            <Text style={styles.tooltipText}>{formatCFA(d.revenue)}</Text>
                          </View>
                        )}
                      </View>
                      {/* Expenses Bar */}
                      <View
                        style={[
                          styles.bar,
                          { height: `${expHeightPercent}%`, backgroundColor: AMBER },
                        ]}
                      >
                        {d.expenses > 0 && (
                          <View style={styles.barTooltip}>
                            <Text style={styles.tooltipText}>{formatCFA(d.expenses)}</Text>
                          </View>
                        )}
                      </View>
                    </View>
                    <Text style={styles.chartColumnLabel}>{d.label}</Text>
                  </View>
                )
              })}
            </View>
          </View>

          {/* Chart Legend */}
          <View style={styles.chartLegend}>
            <View style={styles.legendItem}>
              <View style={[styles.legendIndicator, { backgroundColor: BLUE }]} />
              <Text style={styles.legendText}>{"Chiffre d'affaires"}</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendIndicator, { backgroundColor: AMBER }]} />
              <Text style={styles.legendText}>Dépenses réelles</Text>
            </View>
          </View>
        </View>

        {/* ─── Section 2: Premium KPI Aggregate Cards ─────────────────────── */}
        
        {/* KPI 1: Chiffre d'affaires / Sales */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={getCardIconBoxStyle(addOpacity(BLUE, '12'))}>
              <TrendingUp size={18} color={BLUE} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardLabel}>{"CHIFFRE D'AFFAIRES"}</Text>
              <Text style={styles.kpiValue}>{formatCFA(stats.totalSales)}</Text>
            </View>
            <View style={[styles.trendBadge, { backgroundColor: addOpacity(GREEN, '12') }]}>
              <ArrowUpRight size={14} color={GREEN} />
              <Text style={{ fontSize: 10, fontWeight: '700', color: GREEN }}>Active</Text>
            </View>
          </View>

          {/* Progress volume splitter */}
          <View style={styles.splitterContainer}>
            <View style={styles.splitterHeader}>
              <Text style={styles.splitterLabel}>Volume encaissé (Espèces/Momo)</Text>
              <Text style={styles.splitterLabel}>Ventes à crédit (Dettes)</Text>
            </View>
            {/* Visual dual bar gauge */}
            <View style={styles.dualBarBackground}>
              <View
                style={[
                  styles.dualBarFill,
                  {
                    width: `${stats.totalSales > 0 ? (stats.paidVolume / stats.totalSales) * 100 : 100}%`,
                    backgroundColor: BLUE,
                  },
                ]}
              />
            </View>
            <View style={styles.splitterHeader}>
              <Text style={[styles.splitterValue, { color: BLUE }]}>
                {formatCFA(stats.paidVolume)} ({stats.totalSales > 0 ? ((stats.paidVolume / stats.totalSales) * 100).toFixed(0) : 100}%)
              </Text>
              <Text style={[styles.splitterValue, { color: AMBER }]}>
                {formatCFA(stats.creditVolume)} ({stats.totalSales > 0 ? ((stats.creditVolume / stats.totalSales) * 100).toFixed(0) : 0}%)
              </Text>
            </View>
          </View>
        </View>

        {/* KPI 2: Dépenses / Outflows */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={getCardIconBoxStyle(addOpacity(AMBER, '12'))}>
              <TrendingDown size={18} color={AMBER} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardLabel}>CHARGES / DÉPENSES</Text>
              <Text style={styles.kpiValue}>{formatCFA(stats.totalExpenses)}</Text>
            </View>
            <View style={[styles.trendBadge, { backgroundColor: addOpacity(AMBER, '12') }]}>
              <Text style={{ fontSize: 10, fontWeight: '700', color: AMBER }}>{filteredExpenses.length} transactions</Text>
            </View>
          </View>

          {/* Expenses category bars breakdown */}
          <View style={{ marginTop: 14 }}>
            <Text style={{ fontSize: 11, fontWeight: '600', color: MUTED, marginBottom: 8, letterSpacing: 0.2 }}>
              VENTILATION PAR CATÉGORIE
            </Text>

            {filteredExpenses.length === 0 ? (
              <View style={styles.emptyState}>
                <Info size={14} color={MUTED} />
                <Text style={styles.emptyStateText}>Aucune sortie de caisse enregistrée.</Text>
              </View>
            ) : (
              Object.entries(EXPENSE_CATEGORIES).map(([catKey, catMeta]) => {
                const amount = stats.expBreakdown[catKey] || 0
                if (amount === 0) return null

                const percent = stats.totalExpenses > 0 ? (amount / stats.totalExpenses) * 100 : 0
                return (
                  <View key={catKey} style={styles.catRow}>
                    <View style={styles.catMeta}>
                      <Text style={{ fontSize: 12, marginRight: 6 }}>{catMeta.emoji}</Text>
                      <Text style={styles.catLabel} numberOfLines={1}>{catMeta.label}</Text>
                      <Text style={styles.catPercent}>{percent.toFixed(0)}%</Text>
                      <Text style={styles.catAmount}>{formatCFA(amount)}</Text>
                    </View>
                    <View style={styles.catBarBg}>
                      <View
                        style={[
                          styles.catBarFill,
                          {
                            width: `${percent}%`,
                            backgroundColor: catMeta.color,
                          },
                        ]}
                      />
                    </View>
                  </View>
                )
              })
            )}
          </View>
        </View>

        {/* KPI 3: Profitability */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={getCardIconBoxStyle(addOpacity(GREEN, '12'))}>
              <DollarSign size={18} color={GREEN} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardLabel}>BÉNÉFICE NET ESTIMÉ</Text>
              <Text style={[styles.kpiValue, { color: stats.netProfit >= 0 ? GREEN : '#EF4444' }]}>
                {formatCFA(stats.netProfit)}
              </Text>
            </View>
            <View
              style={[
                styles.trendBadge,
                { backgroundColor: addOpacity(stats.netProfit >= 0 ? GREEN : '#EF4444', '12') },
              ]}
            >
              <Text style={{ fontSize: 10, fontWeight: '700', color: stats.netProfit >= 0 ? GREEN : '#EF4444' }}>
                Marge: {stats.profitMargin.toFixed(0)}%
              </Text>
            </View>
          </View>

          {/* Simple Linear Gauge for Profitability */}
          <View style={{ marginTop: 14 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
              <Text style={styles.splitterLabel}>Seuil de rentabilité (Recettes {'>'} Dépenses)</Text>
              <Text style={[styles.splitterValue, { color: stats.netProfit >= 0 ? GREEN : '#EF4444' }]}>
                {stats.netProfit >= 0 ? 'Bénéficiaire' : 'Déficitaire'}
              </Text>
            </View>
            <View style={styles.dualBarBackground}>
              <View
                style={[
                  styles.dualBarFill,
                  {
                    width: `${Math.min(100, Math.max(0, stats.totalSales > 0 ? (stats.netProfit / stats.totalSales) * 100 : 0))}%`,
                    backgroundColor: GREEN,
                  },
                ]}
              />
            </View>
          </View>
        </View>

        {/* KPI 4: Credit Exposure & Debts Ledger */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={getCardIconBoxStyle(addOpacity(AMBER, '12'))}>
              <CreditCard size={18} color={AMBER} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardLabel}>EN-COURS CRÉDIT CLIENTS</Text>
              <Text style={styles.kpiValue}>{formatCFA(outstandingReceivable)}</Text>
            </View>
            <View style={[styles.trendBadge, { backgroundColor: addOpacity(AMBER, '12') }]}>
              <Text style={{ fontSize: 10, fontWeight: '700', color: AMBER }}>Exposition active</Text>
            </View>
          </View>

          {/* Debts split details */}
          <View style={styles.debtsBreakdownContainer}>
            <View style={styles.debtMetric}>
              <Text style={styles.debtMetricLabel}>Créances Clients (Recevables)</Text>
              <Text style={[styles.debtMetricValue, { color: GREEN }]}>
                + {formatCFA(outstandingReceivable)}
              </Text>
            </View>
            <View style={styles.debtMetricDivider} />
            <View style={styles.debtMetric}>
              <Text style={styles.debtMetricLabel}>Dettes Fournisseurs (Payables)</Text>
              <Text style={[styles.debtMetricValue, { color: AMBER }]}>
                - {formatCFA(outstandingPayable)}
              </Text>
            </View>
          </View>

          <View style={styles.debtInfoNote}>
            <Info size={12} color={MUTED} />
            <Text style={styles.debtInfoText}>
              {"Le solde des créances clients représente l'argent dehors que vos clients vous doivent actuellement dans SQLite."}
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  )
}

function addOpacity(hex: string, opacity: string): string {
  if (!hex.startsWith('#')) return hex
  return `${hex}${opacity}`
}

const getCardIconBoxStyle = (bg: string) => ({
  width: 36,
  height: 36,
  borderRadius: 10,
  backgroundColor: bg,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
})

const styles = StyleSheet.create({
  timeframeTabs: {
    flexDirection: 'row',
    backgroundColor: WHITE + '15',
    borderRadius: 10,
    marginTop: 14,
    padding: 3,
    gap: 4,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeTabButton: {
    backgroundColor: WHITE,
  },
  tabLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#85B7EB',
  },
  activeTabLabel: {
    color: NAVY,
    fontWeight: '700',
  },
  card: {
    backgroundColor: WHITE,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 16,
    marginBottom: 16,
    shadowColor: NAVY,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: NAVY,
  },
  cardSubtitle: {
    fontSize: 11,
    color: MUTED,
    marginTop: 1,
  },
  cardLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: MUTED,
    letterSpacing: 0.5,
  },
  kpiValue: {
    fontSize: 20,
    fontWeight: '800',
    color: NAVY,
    marginTop: 2,
  },
  trendBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
  },
  splitterContainer: {
    marginTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#F0EEE8',
    paddingTop: 12,
  },
  splitterHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  splitterLabel: {
    fontSize: 10,
    color: MUTED,
  },
  splitterValue: {
    fontSize: 11,
    fontWeight: '600',
  },
  dualBarBackground: {
    height: 6,
    backgroundColor: '#F0EEE8',
    borderRadius: 3,
    overflow: 'hidden',
    marginVertical: 4,
  },
  dualBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  emptyState: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: CREAM + '40',
    borderWidth: 1,
    borderRadius: 10,
    borderColor: '#E6E4DD',
    padding: 10,
    justifyContent: 'center',
  },
  emptyStateText: {
    fontSize: 11,
    color: MUTED,
  },
  catRow: {
    marginBottom: 10,
  },
  catMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  catLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: NAVY,
    flex: 1,
  },
  catPercent: {
    fontSize: 10,
    color: MUTED,
    marginRight: 8,
  },
  catAmount: {
    fontSize: 11,
    fontWeight: '700',
    color: NAVY,
  },
  catBarBg: {
    height: 4,
    backgroundColor: '#F0EEE8',
    borderRadius: 2,
    overflow: 'hidden',
  },
  catBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  chartContainer: {
    height: 140,
    marginTop: 20,
    justifyContent: 'flex-end',
    position: 'relative',
  },
  chartGridLines: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 20,
    justifyContent: 'space-between',
  },
  gridLine: {
    height: 1,
    backgroundColor: '#F0EEE8',
    width: '100%',
  },
  chartColumnsWrapper: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-end',
    height: '100%',
    zIndex: 2,
  },
  chartColumn: {
    alignItems: 'center',
    flex: 1,
    height: '100%',
    justifyContent: 'flex-end',
  },
  barsContainer: {
    flexDirection: 'row',
    gap: 4,
    alignItems: 'flex-end',
    height: '75%',
    marginBottom: 6,
  },
  bar: {
    width: 14,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    position: 'relative',
  },
  barTooltip: {
    position: 'absolute',
    top: -20,
    left: -20,
    right: -20,
    alignItems: 'center',
    backgroundColor: NAVY,
    borderRadius: 4,
    paddingVertical: 2,
    opacity: 0, // tooltips hidden on mobile but here for structure / interactive layouts if added
  },
  tooltipText: {
    fontSize: 8,
    color: WHITE,
    fontWeight: '700',
  },
  chartColumnLabel: {
    fontSize: 10,
    color: MUTED,
    fontWeight: '600',
  },
  chartLegend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F0EEE8',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendIndicator: {
    width: 10,
    height: 10,
    borderRadius: 3,
  },
  legendText: {
    fontSize: 10,
    fontWeight: '600',
    color: NAVY,
  },
  debtsBreakdownContainer: {
    flexDirection: 'row',
    marginTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#F0EEE8',
    paddingTop: 14,
  },
  debtMetric: {
    flex: 1,
    alignItems: 'center',
  },
  debtMetricDivider: {
    width: 1,
    backgroundColor: '#F0EEE8',
    height: '80%',
    alignSelf: 'center',
  },
  debtMetricLabel: {
    fontSize: 9,
    color: MUTED,
    fontWeight: '500',
    marginBottom: 4,
    textAlign: 'center',
  },
  debtMetricValue: {
    fontSize: 13,
    fontWeight: '700',
  },
  debtInfoNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    backgroundColor: CREAM + '30',
    borderRadius: 10,
    padding: 8,
    marginTop: 12,
  },
  debtInfoText: {
    fontSize: 9,
    color: MUTED,
    flex: 1,
    lineHeight: 12,
  },
})
