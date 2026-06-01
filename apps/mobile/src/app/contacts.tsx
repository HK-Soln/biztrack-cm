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
  User,
  Phone,
  MapPin,
  FileText,
  UserCheck,
  Building,
  Trash2,
} from 'lucide-react-native'
import { useContactsStore, Contact, ContactType, CreateContactPayload } from '../store/useContactsStore'
import { Colors, addOpacity } from '../utils/colors'
import { AppInput, AppButton, AppBadge } from '../components/ui'

const { NAVY, CREAM, WHITE, MUTED, BORDER, BLUE, AMBER } = Colors

export default function ContactsScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()

  const {
    searchQuery,
    selectedType,
    setSearchQuery,
    setSelectedType,
    fetchContacts,
    addContact,
    editContact,
    removeContact,
    filteredContacts,
  } = useContactsStore()

  useEffect(() => {
    fetchContacts().catch((err) => console.error('Error fetching contacts:', err))
  }, [fetchContacts])


  // Modal states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false)
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null)

  // Form states
  const [name, setName] = useState('')
  const [type, setType] = useState<ContactType>('CUSTOMER')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [notes, setNotes] = useState('')

  const openAddModal = () => {
    setName('')
    setType('CUSTOMER')
    setPhone('')
    setAddress('')
    setNotes('')
    setIsAddModalOpen(true)
  }

  const openDetailModal = (contact: Contact) => {
    setSelectedContact(contact)
    setName(contact.name)
    setType(contact.type)
    setPhone(contact.phone || '')
    setAddress(contact.address || '')
    setNotes(contact.notes || '')
    setIsDetailModalOpen(true)
  }

  const handleSave = async (isEdit: boolean) => {
    if (!name.trim()) {
      Alert.alert('Erreur', 'Veuillez saisir un nom complet.')
      return
    }

    const payload: CreateContactPayload = {
      name: name.trim(),
      type,
      phone: phone.trim() || null,
      phoneAlt: null,
      address: address.trim() || null,
      notes: notes.trim() || null,
    }

    try {
      if (isEdit && selectedContact) {
        await editContact(selectedContact.id, payload)
        setIsDetailModalOpen(false)
      } else {
        await addContact(payload)
        setIsAddModalOpen(false)
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Une erreur est survenue.'
      Alert.alert('Erreur', errorMessage)
    }
  }

  const handleDelete = (id: string) => {
    Alert.alert(
      'Supprimer le contact',
      'Êtes-vous sûr de vouloir supprimer ce contact ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            await removeContact(id)
            setIsDetailModalOpen(false)
          },
        },
      ]
    )
  }

  const items = filteredContacts()

  return (
    <View style={{ flex: 1, backgroundColor: CREAM }}>
      {/* ─── Header ────────────────────────────────────────────────────── */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <ChevronLeft size={22} color={NAVY} />
          </TouchableOpacity>
          <View>
            <Text style={styles.headerTitle}>Contacts</Text>
            <Text style={styles.headerSub}>Clients & Fournisseurs</Text>
          </View>
        </View>
        <TouchableOpacity onPress={openAddModal} activeOpacity={0.8} style={styles.plusBtn}>
          <Plus size={20} color={WHITE} strokeWidth={2.5} />
        </TouchableOpacity>
      </View>

      {/* ─── Filters & Search ─────────────────────────────────────────── */}
      <View style={{ paddingHorizontal: 16, paddingTop: 14, gap: 10 }}>
        <AppInput
          placeholder="Rechercher par nom, téléphone..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          leftSlot={<Search size={16} color={MUTED} />}
          rightSlot={searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <X size={16} color={MUTED} />
            </TouchableOpacity>
          ) : null}
        />

        {/* Tab Filters */}
        <View style={styles.tabContainer}>
          {(['ALL', 'CUSTOMER', 'SUPPLIER'] as const).map((tab) => {
            const isSelected = selectedType === tab
            let label = 'Tous'
            if (tab === 'CUSTOMER') label = 'Clients'
            if (tab === 'SUPPLIER') label = 'Fournisseurs'

            return (
              <TouchableOpacity
                key={tab}
                onPress={() => setSelectedType(tab)}
                style={[styles.tab, isSelected && styles.activeTab]}
              >
                <Text style={[styles.tabText, isSelected && styles.activeTabText]}>
                  {label}
                </Text>
              </TouchableOpacity>
            )
          })}
        </View>
      </View>

      {/* ─── List ──────────────────────────────────────────────────────── */}
      {items.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconWrap}>
            <User size={32} color={BLUE} />
          </View>
          <Text style={styles.emptyTitle}>Aucun contact trouvé</Text>
          <Text style={styles.emptySub}>
            {searchQuery ? 'Modifiez vos critères de recherche.' : 'Enregistrez des clients et fournisseurs pour gérer vos ventes et achats.'}
          </Text>
          <AppButton size="sm" onPress={openAddModal} variant="secondary">
            Ajouter un contact
          </AppButton>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 20, paddingTop: 8 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const isCustomer = item.type === 'CUSTOMER' || item.type === 'BOTH'
            return (
              <TouchableOpacity
                onPress={() => openDetailModal(item)}
                activeOpacity={0.75}
                style={styles.card}
              >
                <View style={styles.cardLeft}>
                  <View style={[styles.avatar, { backgroundColor: isCustomer ? addOpacity(BLUE, '15') : addOpacity(AMBER, '15') }]}>
                    <Text style={[styles.avatarText, { color: isCustomer ? BLUE : AMBER }]}>
                      {item.name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <Text style={styles.cardName} numberOfLines={1}>
                        {item.name}
                      </Text>
                      <AppBadge size="sm" variant={item.type === 'CUSTOMER' ? 'info' : item.type === 'SUPPLIER' ? 'warning' : 'success'}>
                        {item.type === 'CUSTOMER' ? 'Client' : item.type === 'SUPPLIER' ? 'Fournisseur' : 'Mixte'}
                      </AppBadge>
                    </View>
                    <Text style={styles.cardSub} numberOfLines={1}>
                      {item.phone ? `📞 ${item.phone}` : 'Pas de téléphone'}
                      {item.address ? ` · 📍 ${item.address}` : ''}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            )
          }}
        />
      )}

      {/* ─── Add / Edit Modal ────────────────────────────────────────── */}
      <Modal
        visible={isAddModalOpen || isDetailModalOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => {
          setIsAddModalOpen(false)
          setIsDetailModalOpen(false)
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1, backgroundColor: CREAM }}
        >
          {/* Header */}
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {isAddModalOpen ? 'Nouveau contact' : 'Détails du contact'}
            </Text>
            <TouchableOpacity onPress={() => {
              setIsAddModalOpen(false)
              setIsDetailModalOpen(false)
            }}>
              <X size={22} color={NAVY} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }} keyboardShouldPersistTaps="handled">
            <AppInput
              label="Nom complet *"
              placeholder="ex: Société ABC, Paul Mba..."
              value={name}
              onChangeText={setName}
            />

            {/* Type selector */}
            <View>
              <Text style={styles.fieldLabel}>Type de contact *</Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                {(['CUSTOMER', 'SUPPLIER', 'BOTH'] as const).map((t) => {
                  const isSel = type === t
                  let lbl = 'Client'
                  let icon = <UserCheck size={16} color={isSel ? WHITE : NAVY} />
                  if (t === 'SUPPLIER') {
                    lbl = 'Fournisseur'
                    icon = <Building size={16} color={isSel ? WHITE : NAVY} />
                  }
                  if (t === 'BOTH') {
                    lbl = 'Les deux'
                    icon = <User size={16} color={isSel ? WHITE : NAVY} />
                  }

                  return (
                    <TouchableOpacity
                      key={t}
                      onPress={() => setType(t)}
                      activeOpacity={0.8}
                      style={[
                        styles.typeBtn,
                        isSel && { backgroundColor: BLUE, borderColor: BLUE }
                      ]}
                    >
                      {icon}
                      <Text style={[styles.typeBtnText, isSel && { color: WHITE }]}>
                        {lbl}
                      </Text>
                    </TouchableOpacity>
                  )
                })}
              </View>
            </View>

            <AppInput
              label="Téléphone"
              placeholder="ex: +237 6xx xxx xxx"
              keyboardType="phone-pad"
              value={phone}
              onChangeText={setPhone}
              leftSlot={<Phone size={18} color={MUTED} />}
            />

            <AppInput
              label="Adresse"
              placeholder="ex: Avenue Kennedy, Yaoundé"
              value={address}
              onChangeText={setAddress}
              leftSlot={<MapPin size={18} color={MUTED} />}
            />

            <AppInput
              label="Notes / Détails"
              placeholder="Conditions de crédit, horaires, etc."
              value={notes}
              onChangeText={setNotes}
              multiline
              leftSlot={<FileText size={18} color={MUTED} />}
            />

            {/* Actions */}
            <View style={{ marginTop: 24, gap: 10 }}>
              <AppButton
                onPress={() => handleSave(!isAddModalOpen)}
                fullWidth
              >
                {isAddModalOpen ? 'Créer le contact' : 'Enregistrer les modifications'}
              </AppButton>

              {isDetailModalOpen && selectedContact && (
                <AppButton
                  variant="danger"
                  onPress={() => handleDelete(selectedContact.id)}
                  fullWidth
                >
                  <Trash2 size={16} color={WHITE} /> Supprimer le contact
                </AppButton>
              )}
            </View>
          </ScrollView>
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
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#F1EFE840',
    borderRadius: 12,
    padding: 3,
    borderWidth: 1,
    borderColor: BORDER,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 9,
  },
  activeTab: {
    backgroundColor: WHITE,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 2,
  },
  tabText: {
    fontSize: 12,
    fontWeight: '600',
    color: MUTED,
  },
  activeTabText: {
    color: NAVY,
    fontWeight: '700',
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
    backgroundColor: addOpacity(BLUE, '15'),
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
  card: {
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
  cardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '700',
  },
  cardName: {
    fontSize: 14,
    fontWeight: '600',
    color: NAVY,
    maxWidth: '70%',
  },
  cardSub: {
    fontSize: 11,
    color: MUTED,
    marginTop: 3,
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
  typeBtn: {
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
  typeBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: NAVY,
  },
})
