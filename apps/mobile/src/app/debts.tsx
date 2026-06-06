import React, { useState, useEffect } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  Modal,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  ScrollView,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  ChevronLeft,
  Plus,
  Search,
  X,
  TrendingDown,
  TrendingUp,
  Calendar,
  DollarSign,
  AlertCircle,
  FileText,
} from 'lucide-react-native'
import { useDebtsStore, Debt, DebtDirection, CreateDebtPayload, RecordPaymentPayload } from '../store/useDebtsStore'
import { useContactsStore } from '../store/useContactsStore'
import { Colors, addOpacity } from '../utils/colors'
import { AppInput, AppButton, AppBadge, CustomerSelector } from '../components/ui'
import { AppSyncIndicator } from '../components/ui/AppSyncIndicator'
import { PaymentMethodPicker } from '../components/sell/PaymentMethodPicker'
import { PaymentMethod } from '../store/cart.store'

const { NAVY, CREAM, WHITE, MUTED, BORDER, BLUE, AMBER, GREEN } = Colors

export default function DebtsScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()

  const {
    debts,
    fetchDebts,
    addDebt,
    recordPayment,
    writeOffDebt,
    getOutstandingBalance,
    getOutstandingCount,
  } = useDebtsStore()

  const { contacts, fetchContacts } = useContactsStore()

  useEffect(() => {
    fetchDebts().catch((err) => console.error('Error fetching debts:', err))
    fetchContacts().catch((err) => console.error('Error fetching contacts:', err))
  }, [fetchDebts, fetchContacts])


  // Tab Filtering
  const [selectedDirection, setSelectedDirection] = useState<DebtDirection>('RECEIVABLE')
  const [searchQuery, setSearchQuery] = useState('')

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false)
  const [selectedDebt, setSelectedDebt] = useState<Debt | null>(null)

  // Add Debt Form State
  const [selectedContactId, setSelectedContactId] = useState('')
  const [debtAmount, setDebtAmount] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [debtNotes, setDebtNotes] = useState('')
  const [debtDirection, setDebtDirection] = useState<DebtDirection>('RECEIVABLE')

  // Payment Form State
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH')
  const [paymentNotes, setPaymentNotes] = useState('')

  // Lookup helpers
  const getContactName = (contactId: string) => {
    const c = contacts.find((item) => item.id === contactId)
    return c ? c.name : 'Contact inconnu'
  }

  // Filtered Debts
  const getFilteredDebts = () => {
    return debts.filter((d) => {
      const isCorrectDirection = d.direction === selectedDirection
      const isNotSettled = d.status !== 'SETTLED' && d.status !== 'WRITTEN_OFF'
      
      let matchesSearch = true
      if (searchQuery.trim()) {
        const contactName = getContactName(d.contactId).toLowerCase()
        const ref = d.sourceReference.toLowerCase()
        const q = searchQuery.toLowerCase()
        matchesSearch = contactName.includes(q) || ref.includes(q)
      }

      return isCorrectDirection && isNotSettled && matchesSearch
    })
  }

  const handleCreateDebt = async () => {
    if (!selectedContactId) {
      Alert.alert('Erreur', 'Veuillez sélectionner un contact.')
      return
    }

    const amountNum = parseFloat(debtAmount)
    if (isNaN(amountNum) || amountNum <= 0) {
      Alert.alert('Erreur', 'Veuillez entrer un montant valide.')
      return
    }

    try {
      const payload: CreateDebtPayload = {
        contactId: selectedContactId,
        direction: debtDirection,
        sourceType: 'MANUAL',
        originalAmount: amountNum,
        dueDate: dueDate || null,
        notes: debtNotes || null,
      }

      await addDebt(payload)
      setIsAddModalOpen(false)
      
      // Reset form
      setSelectedContactId('')
      setDebtAmount('')
      setDueDate('')
      setDebtNotes('')
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Une erreur est survenue.'
      Alert.alert('Erreur', errorMessage)
    }
  }

  const handleRecordPayment = async () => {
    if (!selectedDebt) return

    const amountNum = parseFloat(paymentAmount)
    if (isNaN(amountNum) || amountNum <= 0) {
      Alert.alert('Erreur', 'Veuillez entrer un montant de paiement valide.')
      return
    }

    try {
      const payload: RecordPaymentPayload = {
        amount: amountNum,
        method: paymentMethod,
        paymentDate: new Date().toISOString(),
        notes: paymentNotes || null,
      }

      await recordPayment(selectedDebt.id, payload)
      setIsPaymentModalOpen(false)
      
      // Reset
      setPaymentAmount('')
      setPaymentNotes('')
      setSelectedDebt(null)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Une erreur est survenue.'
      Alert.alert('Erreur', errorMessage)
    }
  }

  const handleWriteOff = (debtId: string) => {
    Alert.prompt(
      'Annuler la dette',
      "Veuillez entrer le motif d'annulation de cette créance :",
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Confirmer',
          style: 'destructive',
          onPress: async (reason?: string) => {
            if (!reason || !reason.trim()) {
              Alert.alert('Erreur', "Un motif d'annulation est requis.")
              return
            }
            try {
              await writeOffDebt(debtId, reason)
              setIsPaymentModalOpen(false)
              setSelectedDebt(null)
            } catch (err) {
              const errorMessage = err instanceof Error ? err.message : 'Une erreur est survenue.'
              Alert.alert('Erreur', errorMessage)
            }
          },
        },
      ]
    )
  }

  const openPaymentModal = (debt: Debt) => {
    setSelectedDebt(debt)
    setPaymentAmount(debt.outstandingAmount.toString())
    setIsPaymentModalOpen(true)
  }

  const filteredItems = getFilteredDebts()
  const totalReceivable = getOutstandingBalance('RECEIVABLE')
  const totalPayable = getOutstandingBalance('PAYABLE')

  return (
    <View style={{ flex: 1, backgroundColor: CREAM }}>
      {/* ─── Header ────────────────────────────────────────────────────── */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <ChevronLeft size={22} color={NAVY} />
          </TouchableOpacity>
          <View>
            <Text style={styles.headerTitle}>Créances & Dettes</Text>
            <Text style={styles.headerSub}>Suivi des crédits & balances</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <AppSyncIndicator />
          <TouchableOpacity onPress={() => setIsAddModalOpen(true)} activeOpacity={0.8} style={styles.plusBtn}>
            <Plus size={20} color={WHITE} strokeWidth={2.5} />
          </TouchableOpacity>
        </View>
      </View>

      {/* ─── Summary Dashboard Cards ────────────────────────────────────── */}
      <View style={styles.summaryContainer}>
        {/* Receivables Card */}
        <TouchableOpacity
          onPress={() => setSelectedDirection('RECEIVABLE')}
          activeOpacity={0.85}
          style={[
            styles.summaryCard,
            selectedDirection === 'RECEIVABLE' && { borderColor: BLUE, borderWidth: 2 }
          ]}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={[styles.iconBox, { backgroundColor: addOpacity(BLUE, '15') }]}>
              <TrendingDown size={18} color={BLUE} />
            </View>
            <Text style={styles.cardIndicatorText}>Clients débiteurs</Text>
          </View>
          <Text style={styles.summaryAmount}>{totalReceivable.toLocaleString()} F</Text>
          <Text style={styles.summarySub}>{getOutstandingCount('RECEIVABLE')} factures impayées</Text>
        </TouchableOpacity>

        {/* Payables Card */}
        <TouchableOpacity
          onPress={() => setSelectedDirection('PAYABLE')}
          activeOpacity={0.85}
          style={[
            styles.summaryCard,
            selectedDirection === 'PAYABLE' && { borderColor: AMBER, borderWidth: 2 }
          ]}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={[styles.iconBox, { backgroundColor: addOpacity(AMBER, '15') }]}>
              <TrendingUp size={18} color={AMBER} />
            </View>
            <Text style={styles.cardIndicatorText}>Crédits fournisseurs</Text>
          </View>
          <Text style={styles.summaryAmount}>{totalPayable.toLocaleString()} F</Text>
          <Text style={styles.summarySub}>{getOutstandingCount('PAYABLE')} dettes fournisseurs</Text>
        </TouchableOpacity>
      </View>

      {/* ─── Search & Tab Filters ──────────────────────────────────────── */}
      <View style={{ paddingHorizontal: 16, paddingTop: 10, gap: 10 }}>
        <AppInput
          placeholder="Rechercher un client, fournisseur, référence..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          leftSlot={<Search size={16} color={MUTED} />}
          rightSlot={searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <X size={16} color={MUTED} />
            </TouchableOpacity>
          ) : null}
        />
      </View>

      {/* ─── List ──────────────────────────────────────────────────────── */}
      {filteredItems.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconWrap}>
            <DollarSign size={32} color={GREEN} />
          </View>
          <Text style={styles.emptyTitle}>Tout est en ordre !</Text>
          <Text style={styles.emptySub}>
            Aucune dette active à afficher pour cet onglet.
          </Text>
          <AppButton size="sm" onPress={() => setIsAddModalOpen(true)} variant="secondary">
            Enregistrer une dette
          </AppButton>
        </View>
      ) : (
        <FlatList
          data={filteredItems}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 20, paddingTop: 10 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const pct = Math.round((item.paidAmount / item.originalAmount) * 100)
            const daysLeft = item.dueDate
              ? Math.ceil((new Date(item.dueDate).getTime() - new Date().getTime()) / (1000 * 3600 * 24))
              : null

            return (
              <View style={styles.debtCard}>
                <View style={styles.debtHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.debtContactName}>{getContactName(item.contactId)}</Text>
                    <Text style={styles.debtMeta}>
                      Réf: {item.sourceReference} · Crée le {new Date(item.createdAt).toLocaleDateString()}
                    </Text>
                  </View>
                  <AppBadge variant={item.status === 'PARTIALLY_PAID' ? 'warning' : 'danger'}>
                    {item.status === 'PARTIALLY_PAID' ? 'Partiel' : 'Impayé'}
                  </AppBadge>
                </View>

                {/* Progress bar */}
                <View style={styles.progressSection}>
                  <View style={styles.progressInfo}>
                    <Text style={styles.progressText}>Solde restant : {item.outstandingAmount.toLocaleString()} F</Text>
                    <Text style={styles.progressPct}>{pct}% payé</Text>
                  </View>
                  <View style={styles.progressBarBg}>
                    <View style={[styles.progressBarFill, { width: `${pct}%`, backgroundColor: item.direction === 'RECEIVABLE' ? BLUE : AMBER }]} />
                  </View>
                </View>

                {/* Due Date & Action */}
                <View style={styles.debtFooter}>
                  {daysLeft !== null ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Calendar size={14} color={daysLeft < 0 ? '#E24B4A' : MUTED} />
                      <Text style={[styles.dueDateText, daysLeft < 0 && { color: '#E24B4A', fontWeight: '600' }]}>
                        {daysLeft < 0 ? `En retard de ${Math.abs(daysLeft)} j.` : `Échéance dans ${daysLeft} j.`}
                      </Text>
                    </View>
                  ) : (
                    <View />
                  )}

                  <AppButton size="sm" onPress={() => openPaymentModal(item)}>
                    Encaisser
                  </AppButton>
                </View>
              </View>
            )
          }}
        />
      )}

      {/* ─── Add Debt Modal ────────────────────────────────────────────── */}
      <Modal
        visible={isAddModalOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setIsAddModalOpen(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1, backgroundColor: CREAM }}
        >
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Enregistrer une dette</Text>
            <TouchableOpacity onPress={() => setIsAddModalOpen(false)}>
              <X size={22} color={NAVY} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }} keyboardShouldPersistTaps="handled">
            {/* Direction Toggle */}
            <View>
              <Text style={styles.fieldLabel}>Sens de la transaction *</Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity
                  onPress={() => setDebtDirection('RECEIVABLE')}
                  style={[
                    styles.directionBtn,
                    debtDirection === 'RECEIVABLE' && { backgroundColor: BLUE, borderColor: BLUE }
                  ]}
                >
                  <TrendingDown size={16} color={debtDirection === 'RECEIVABLE' ? WHITE : NAVY} />
                  <Text style={[styles.directionBtnText, debtDirection === 'RECEIVABLE' && { color: WHITE }]}>
                    À recevoir (Client)
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setDebtDirection('PAYABLE')}
                  style={[
                    styles.directionBtn,
                    debtDirection === 'PAYABLE' && { backgroundColor: AMBER, borderColor: AMBER }
                  ]}
                >
                  <TrendingUp size={16} color={debtDirection === 'PAYABLE' ? WHITE : NAVY} />
                  <Text style={[styles.directionBtnText, debtDirection === 'PAYABLE' && { color: WHITE }]}>
                    À payer (Fournisseur)
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Customer Selector */}
            <View style={{ zIndex: 10 }}>
              <Text style={styles.fieldLabel}>Client ou Fournisseur *</Text>
              <CustomerSelector
                selectedCustomer={contacts.find((c) => c.id === selectedContactId) || null}
                onSelect={(c) => setSelectedContactId(c ? c.id : '')}
              />
            </View>

            <AppInput
              label="Montant initial * (CFA)"
              placeholder="ex: 25000"
              keyboardType="numeric"
              value={debtAmount}
              onChangeText={setDebtAmount}
              leftSlot={<DollarSign size={18} color={MUTED} />}
            />

            <AppInput
              label="Date d'échéance (Optionnel)"
              placeholder="ex: AAAA-MM-JJ"
              value={dueDate}
              onChangeText={setDueDate}
              leftSlot={<Calendar size={18} color={MUTED} />}
            />

            <AppInput
              label="Notes / Détails"
              placeholder="ex: Facture de livraison n°45, acompte déjà versé..."
              value={debtNotes}
              onChangeText={setDebtNotes}
              multiline
              leftSlot={<FileText size={18} color={MUTED} />}
            />

            <View style={{ marginTop: 12 }}>
              <AppButton onPress={handleCreateDebt} fullWidth>
                Enregistrer la dette
              </AppButton>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* ─── Record Payment / Detail Modal ────────────────────────────── */}
      <Modal
        visible={isPaymentModalOpen && selectedDebt !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => {
          setIsPaymentModalOpen(false)
          setSelectedDebt(null)
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1, backgroundColor: CREAM }}
        >
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Encaisser un paiement</Text>
            <TouchableOpacity onPress={() => {
              setIsPaymentModalOpen(false)
              setSelectedDebt(null)
            }}>
              <X size={22} color={NAVY} />
            </TouchableOpacity>
          </View>

          {selectedDebt && (
            <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }} keyboardShouldPersistTaps="handled">
              <View style={styles.paymentDebtSummary}>
                <Text style={styles.paymentDebtTitle}>{getContactName(selectedDebt.contactId)}</Text>
                <Text style={styles.paymentDebtSubtitle}>Référence : {selectedDebt.sourceReference}</Text>
                <View style={styles.paymentBalanceRow}>
                  <View>
                    <Text style={styles.paymentLabel}>Dette initiale</Text>
                    <Text style={styles.paymentValue}>{selectedDebt.originalAmount.toLocaleString()} F</Text>
                  </View>
                  <View style={styles.paymentDivider} />
                  <View>
                    <Text style={styles.paymentLabel}>Déjà payé</Text>
                    <Text style={styles.paymentValue}>{selectedDebt.paidAmount.toLocaleString()} F</Text>
                  </View>
                  <View style={styles.paymentDivider} />
                  <View>
                    <Text style={styles.paymentLabel}>Reste dû</Text>
                    <Text style={[styles.paymentValue, { color: '#E24B4A', fontWeight: '700' }]}>
                      {selectedDebt.outstandingAmount.toLocaleString()} F
                    </Text>
                  </View>
                </View>
              </View>

              <AppInput
                label="Montant versé (CFA)"
                placeholder="Montant du versement..."
                keyboardType="numeric"
                value={paymentAmount}
                onChangeText={setPaymentAmount}
                leftSlot={<DollarSign size={18} color={MUTED} />}
              />

              <View>
                <Text style={styles.fieldLabel}>Mode de règlement</Text>
                <PaymentMethodPicker
                  selected={paymentMethod}
                  onSelect={setPaymentMethod}
                />
              </View>

              <AppInput
                label="Notes de règlement"
                placeholder="Référence de virement, acompte, etc."
                value={paymentNotes}
                onChangeText={setPaymentNotes}
                multiline
                leftSlot={<FileText size={18} color={MUTED} />}
              />

              <View style={{ marginTop: 24, gap: 10 }}>
                <AppButton onPress={handleRecordPayment} fullWidth>
                  Valider le paiement
                </AppButton>
                
                {selectedDebt.direction === 'RECEIVABLE' && (
                  <AppButton
                    variant="danger"
                    onPress={() => handleWriteOff(selectedDebt.id)}
                    fullWidth
                  >
                    <AlertCircle size={16} color={WHITE} /> Déclarer comme irrécouvrable
                  </AppButton>
                )}
              </View>
            </ScrollView>
          )}
        </KeyboardAvoidingView>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: WHITE,
    paddingBottom: 16,
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: CREAM,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: NAVY,
  },
  headerSub: {
    fontSize: 11,
    color: MUTED,
    marginTop: 1,
  },
  plusBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: BLUE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 12,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: WHITE,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: BORDER,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.02,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 2,
  },
  iconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardIndicatorText: {
    fontSize: 10,
    fontWeight: '600',
    color: MUTED,
  },
  summaryAmount: {
    fontSize: 16,
    fontWeight: '700',
    color: NAVY,
    marginTop: 12,
  },
  summarySub: {
    fontSize: 9,
    color: MUTED,
    marginTop: 4,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    gap: 12,
  },
  emptyIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 24,
    backgroundColor: addOpacity(GREEN, '15'),
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: NAVY,
  },
  emptySub: {
    fontSize: 12,
    color: MUTED,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 8,
  },
  debtCard: {
    backgroundColor: WHITE,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: BORDER,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.02,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 2,
  },
  debtHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  debtContactName: {
    fontSize: 14,
    fontWeight: '700',
    color: NAVY,
  },
  debtMeta: {
    fontSize: 10,
    color: MUTED,
    marginTop: 2,
  },
  progressSection: {
    marginTop: 14,
    gap: 6,
  },
  progressInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressText: {
    fontSize: 12,
    fontWeight: '600',
    color: NAVY,
  },
  progressPct: {
    fontSize: 10,
    color: MUTED,
  },
  progressBarBg: {
    height: 6,
    backgroundColor: CREAM,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  debtFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingTop: 10,
  },
  dueDateText: {
    fontSize: 11,
    color: MUTED,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    backgroundColor: WHITE,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: NAVY,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: MUTED,
    marginBottom: 8,
  },
  directionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: WHITE,
  },
  directionBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: NAVY,
  },
  paymentDebtSummary: {
    backgroundColor: NAVY,
    borderRadius: 16,
    padding: 16,
  },
  paymentDebtTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: WHITE,
  },
  paymentDebtSubtitle: {
    fontSize: 11,
    color: '#85B7EB',
    marginTop: 2,
  },
  paymentBalanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#185FA5',
    paddingTop: 14,
  },
  paymentLabel: {
    fontSize: 9,
    color: '#85B7EB',
    fontWeight: '500',
  },
  paymentValue: {
    fontSize: 13,
    fontWeight: '600',
    color: WHITE,
    marginTop: 2,
  },
  paymentDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#185FA5',
  },
})
