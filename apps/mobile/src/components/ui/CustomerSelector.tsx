import React, { useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  FlatList,
  StyleSheet,
  Alert,
} from 'react-native'
import { User, Search, Plus, X, Phone, MapPin, Check, ChevronDown } from 'lucide-react-native'
import { useContactsStore, Contact } from '../../store/useContactsStore'
import { Colors, addOpacity } from '../../utils/colors'
import { AppInput } from './AppInput'
import { AppButton } from './AppButton'

const { NAVY, CREAM, WHITE, MUTED, BORDER, BLUE } = Colors

interface CustomerSelectorProps {
  selectedCustomer: Contact | null
  onSelect: (customer: Contact | null) => void
}

export function CustomerSelector({ selectedCustomer, onSelect }: CustomerSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isAddMode, setIsAddMode] = useState(false)
  const { contacts, searchQuery, setSearchQuery, addContact, fetchContacts } = useContactsStore()

  React.useEffect(() => {
    fetchContacts().catch((err) => console.error('Error fetching contacts in selector:', err))
  }, [fetchContacts])

  // Form states for creating contact
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [notes, setNotes] = useState('')

  const handleSaveContact = async () => {
    if (!name.trim()) {
      Alert.alert('Erreur', 'Veuillez saisir un nom valide.')
      return
    }

    try {
      const newContact = await addContact({
        type: 'CUSTOMER',
        name: name.trim(),
        phone: phone.trim() || null,
        phoneAlt: null,
        address: address.trim() || null,
        notes: notes.trim() || null,
      })

      // Select and close
      onSelect(newContact)
      setIsAddMode(false)
      setIsOpen(false)
      // Reset form
      setName('')
      setPhone('')
      setAddress('')
      setNotes('')
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Une erreur est survenue.'
      Alert.alert('Erreur', errorMessage)
    }
  }

  const handleSelectCustomer = (customer: Contact) => {
    onSelect(customer)
    setIsOpen(false)
  }

  const handleClearSelection = () => {
    onSelect(null)
    setIsOpen(false)
  }

  // Filter contacts locally — do NOT use the shared filteredContacts() selector
  // because it inherits the global selectedType from the Contacts screen, which
  // could hide pure CUSTOMER contacts if the user had previously filtered by SUPPLIER.
  const q = searchQuery.trim().toLowerCase()
  const items = contacts
    .filter((c) => c.isActive && (c.type === 'CUSTOMER' || c.type === 'BOTH'))
    .filter((c) =>
      !q ||
      c.name.toLowerCase().includes(q) ||
      c.phone?.toLowerCase().includes(q) ||
      c.address?.toLowerCase().includes(q)
    )

  return (
    <>
      {/* Trigger Button */}
      <TouchableOpacity
        activeOpacity={0.75}
        onPress={() => {
          setSearchQuery('')
          setIsOpen(true)
        }}
        style={styles.trigger}
      >
        <View style={styles.triggerLeft}>
          <View style={[styles.avatarIcon, { backgroundColor: selectedCustomer ? addOpacity(BLUE, '15') : '#F1EFE8' }]}>
            <User size={18} color={selectedCustomer ? BLUE : MUTED} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.triggerLabel}>Client</Text>
            <Text style={[styles.triggerValue, { color: selectedCustomer ? NAVY : MUTED }]} numberOfLines={1}>
              {selectedCustomer ? selectedCustomer.name : 'Client de passage (Par défaut)'}
            </Text>
          </View>
        </View>
        <ChevronDown size={18} color={MUTED} />
      </TouchableOpacity>

      {/* Main Selector Modal */}
      <Modal
        visible={isOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => {
          setIsOpen(false)
          setIsAddMode(false)
        }}
      >
        <View style={{ flex: 1, backgroundColor: CREAM }}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {isAddMode ? 'Nouveau Client' : 'Sélectionner un Client'}
            </Text>
            <TouchableOpacity
              onPress={() => {
                if (isAddMode) {
                  setIsAddMode(false)
                } else {
                  setIsOpen(false)
                }
              }}
              hitSlop={8}
            >
              <X size={22} color={NAVY} />
            </TouchableOpacity>
          </View>

          {isAddMode ? (
            /* Add Customer Screen */
            <FlatList
              data={[]}
              renderItem={null}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.formContainer}
              ListHeaderComponent={
                <View style={{ gap: 16 }}>
                  <AppInput
                    label="Nom complet *"
                    placeholder="ex: Jean Dupont"
                    value={name}
                    onChangeText={setName}
                  />

                  <AppInput
                    label="Téléphone"
                    placeholder="ex: +237 6xx xxx xxx"
                    keyboardType="phone-pad"
                    value={phone}
                    onChangeText={setPhone}
                    leftSlot={<Phone size={16} color={MUTED} />}
                  />

                  <AppInput
                    label="Adresse"
                    placeholder="ex: Bastos, Yaoundé"
                    value={address}
                    onChangeText={setAddress}
                    leftSlot={<MapPin size={16} color={MUTED} />}
                  />

                  <AppInput
                    label="Notes"
                    placeholder="Détails supplémentaires..."
                    value={notes}
                    onChangeText={setNotes}
                    multiline
                  />

                  <View style={styles.formActions}>
                    <AppButton fullWidth onPress={handleSaveContact}>
                      Créer & Sélectionner
                    </AppButton>
                    <AppButton fullWidth variant="secondary" onPress={() => setIsAddMode(false)}>
                      Annuler
                    </AppButton>
                  </View>
                </View>
              }
            />
          ) : (
            /* Customer Search List */
            <View style={{ flex: 1 }}>
              {/* Search Bar & Add Button */}
              <View style={styles.searchSection}>
                <View style={{ flex: 1 }}>
                  <AppInput
                    placeholder="Rechercher par nom ou téléphone..."
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
                <TouchableOpacity
                  onPress={() => setIsAddMode(true)}
                  activeOpacity={0.8}
                  style={styles.addButton}
                >
                  <Plus size={20} color={WHITE} />
                </TouchableOpacity>
              </View>

              {/* Default Option (Anonymous Passenger) */}
              <TouchableOpacity
                onPress={handleClearSelection}
                activeOpacity={0.72}
                style={[
                  styles.customerRow,
                  { borderBottomWidth: 1, borderBottomColor: BORDER },
                  !selectedCustomer && styles.selectedRow,
                ]}
              >
                <View style={[styles.avatarIcon, { backgroundColor: '#F1EFE8' }]}>
                  <User size={18} color={MUTED} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.customerName, { fontWeight: '700' }]}>Client de passage</Text>
                  <Text style={styles.customerSub}>Pas de compte client (Vente comptant direct)</Text>
                </View>
                {!selectedCustomer && <Check size={18} color={BLUE} strokeWidth={2.5} />}
              </TouchableOpacity>

              {/* Customer List */}
              {items.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyTitle}>Aucun client trouvé</Text>
                  <Text style={styles.emptyDesc}>
                    {searchQuery ? 'Essayez avec un autre nom ou téléphone.' : 'Commencez par ajouter votre premier client.'}
                  </Text>
                  <AppButton size="sm" variant="secondary" onPress={() => setIsAddMode(true)}>
                    Ajouter un client
                  </AppButton>
                </View>
              ) : (
                <FlatList
                  data={items}
                  keyExtractor={(item) => item.id}
                  contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 20 }}
                  keyboardShouldPersistTaps="handled"
                  renderItem={({ item }) => {
                    const isSelected = selectedCustomer?.id === item.id
                    return (
                      <TouchableOpacity
                        onPress={() => handleSelectCustomer(item)}
                        activeOpacity={0.75}
                        style={[styles.customerRow, isSelected && styles.selectedRow]}
                      >
                        <View style={[styles.avatarIcon, { backgroundColor: isSelected ? addOpacity(BLUE, '15') : '#E6F1FB' }]}>
                          <Text style={{ fontWeight: '700', color: BLUE, fontSize: 13 }}>
                            {item.name.charAt(0).toUpperCase()}
                          </Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.customerName}>{item.name}</Text>
                          <Text style={styles.customerSub}>
                            {item.phone ? `📞 ${item.phone}` : 'Pas de téléphone'}
                            {item.address ? ` · 📍 ${item.address}` : ''}
                          </Text>
                        </View>
                        {isSelected && <Check size={18} color={BLUE} strokeWidth={2.5} />}
                      </TouchableOpacity>
                    )
                  }}
                />
              )}
            </View>
          )}
        </View>
      </Modal>
    </>
  )
}

const styles = StyleSheet.create({
  trigger: {
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.01,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 1,
  },
  triggerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  avatarIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  triggerLabel: {
    fontSize: 10,
    color: MUTED,
    fontWeight: '500',
  },
  triggerValue: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 1,
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
    fontSize: 17,
    fontWeight: '700',
    color: NAVY,
  },
  searchSection: {
    flexDirection: 'row',
    gap: 8,
    padding: 16,
    alignItems: 'center',
    backgroundColor: WHITE,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: BLUE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  customerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: WHITE,
    borderRadius: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  selectedRow: {
    borderColor: addOpacity(BLUE, '40'),
    backgroundColor: addOpacity(BLUE, '03'),
  },
  customerName: {
    fontSize: 14,
    fontWeight: '600',
    color: NAVY,
  },
  customerSub: {
    fontSize: 11,
    color: MUTED,
    marginTop: 2,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: NAVY,
  },
  emptyDesc: {
    fontSize: 12,
    color: MUTED,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 8,
  },
  formContainer: {
    padding: 20,
  },
  formActions: {
    marginTop: 24,
    gap: 10,
  },
})
