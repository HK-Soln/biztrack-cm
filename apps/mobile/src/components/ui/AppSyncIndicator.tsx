import React, { useEffect, useRef, useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  Animated,
  Easing,
  Platform,
} from 'react-native'
import {
  Cloud,
  CloudOff,
  RefreshCw,
  AlertCircle,
  Database,
  X,
  CheckCircle2,
} from 'lucide-react-native'
import { useSyncStore } from '../../store/useSyncStore'
import { Colors, addOpacity } from '../../utils/colors'
import { AppButton } from './AppButton'

const { NAVY, GREEN, AMBER, WHITE, MUTED, BORDER, BLUE } = Colors

export function AppSyncIndicator() {
  const { status, pendingCount, lastSyncedAt, error, triggerSync } = useSyncStore()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const spinValue = useRef(new Animated.Value(0)).current

  // Spin animation during sync
  useEffect(() => {
    let animation: Animated.CompositeAnimation | null = null

    if (status === 'syncing') {
      spinValue.setValue(0)
      animation = Animated.loop(
        Animated.timing(spinValue, {
          toValue: 1,
          duration: 1200,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      )
      animation.start()
    } else {
      spinValue.setValue(0)
    }

    return () => {
      if (animation) animation.stop()
    }
  }, [status, spinValue])

  const spin = spinValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  })

  // Get status color & icon configuration
  const getStatusConfig = () => {
    switch (status) {
      case 'syncing':
        return {
          bg: addOpacity(BLUE, '15'),
          color: BLUE,
          text: 'Sync...',
          icon: (
            <Animated.View style={{ transform: [{ rotate: spin }] }}>
              <RefreshCw size={14} color={BLUE} strokeWidth={2.2} />
            </Animated.View>
          ),
        }
      case 'offline':
        return {
          bg: addOpacity(AMBER, '15'),
          color: AMBER,
          text: 'Hors ligne',
          icon: <CloudOff size={14} color={AMBER} strokeWidth={2.2} />,
        }
      case 'error':
        return {
          bg: addOpacity(AMBER, '15'),
          color: AMBER,
          text: 'Erreur',
          icon: <AlertCircle size={14} color={AMBER} strokeWidth={2.2} />,
        }
      case 'idle':
      default:
        return {
          bg: addOpacity(GREEN, '15'),
          color: GREEN,
          text: 'Synchro',
          icon: <Cloud size={14} color={GREEN} strokeWidth={2.2} />,
        }
    }
  }

  const config = getStatusConfig()

  const formatLastSynced = () => {
    if (!lastSyncedAt) return 'Jamais'
    const date = new Date(lastSyncedAt)
    return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  }

  return (
    <>
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => setIsModalOpen(true)}
        style={[styles.pill, { backgroundColor: config.bg, borderColor: addOpacity(config.color, '30') }]}
      >
        {config.icon}
        <Text style={[styles.pillText, { color: config.color }]}>{config.text}</Text>
      </TouchableOpacity>

      <Modal
        visible={isModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsModalOpen(false)}
        statusBarTranslucent
      >
        <View style={styles.backdrop}>
          <View style={styles.modalCard}>
            {/* Header */}
            <View style={styles.modalHeader}>
              <View style={styles.headerTitleRow}>
                <Database size={18} color={NAVY} />
                <Text style={styles.modalTitle}>Statut Offline Sync</Text>
              </View>
              <TouchableOpacity onPress={() => setIsModalOpen(false)} hitSlop={8}>
                <X size={20} color={MUTED} />
              </TouchableOpacity>
            </View>

            {/* Content Body */}
            <View style={styles.modalBody}>
              {/* Detailed status row */}
              <View style={styles.statusDisplay}>
                <View style={[styles.statusIconWrap, { backgroundColor: config.bg }]}>
                  {status === 'idle' && <CheckCircle2 size={32} color={GREEN} strokeWidth={1.8} />}
                  {status === 'syncing' && (
                    <Animated.View style={{ transform: [{ rotate: spin }] }}>
                      <RefreshCw size={32} color={BLUE} strokeWidth={1.8} />
                    </Animated.View>
                  )}
                  {status === 'offline' && <CloudOff size={32} color={AMBER} strokeWidth={1.8} />}
                  {status === 'error' && <AlertCircle size={32} color={AMBER} strokeWidth={1.8} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.statusTitle}>
                    {status === 'idle' && 'Données synchronisées'}
                    {status === 'syncing' && 'Synchronisation en cours'}
                    {status === 'offline' && 'Mode hors-ligne actif'}
                    {status === 'error' && 'Erreur de synchronisation'}
                  </Text>
                  <Text style={styles.statusDesc}>
                    {status === 'idle' && 'Toutes les transactions locales ont été enregistrées sur le serveur.'}
                    {status === 'syncing' && 'Envoi et réception des modifications de la base de données...'}
                    {status === 'offline' && 'L\'application sauvegarde tout localement sur l\'appareil.'}
                    {status === 'error' && (error || 'Impossible de se connecter au serveur distant.')}
                  </Text>
                </View>
              </View>

              <View style={styles.infoSection}>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Modifications en attente</Text>
                  <View style={[styles.infoBadge, { backgroundColor: pendingCount > 0 ? addOpacity(AMBER, '15') : '#F1EFE8' }]}>
                    <Text style={[styles.infoValue, { color: pendingCount > 0 ? AMBER : NAVY }]}>
                      {pendingCount}
                    </Text>
                  </View>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Dernière synchronisation</Text>
                  <Text style={[styles.infoValue, { fontWeight: '500' }]}>{formatLastSynced()}</Text>
                </View>
              </View>

              {/* Force manual sync button */}
              <AppButton
                fullWidth
                loading={status === 'syncing'}
                onPress={async () => {
                  await triggerSync()
                }}
                disabled={status === 'idle' && pendingCount === 0}
              >
                Forcer la synchronisation
              </AppButton>
            </View>
          </View>
        </View>
      </Modal>
    </>
  )
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 99,
    borderWidth: 1,
  },
  pillText: {
    fontSize: 10,
    fontWeight: '700',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: WHITE,
    borderRadius: 16,
    width: '100%',
    maxWidth: 340,
    overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.15, shadowOffset: { width: 0, height: 6 }, shadowRadius: 15 },
      android: { elevation: 8 },
    }),
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modalTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: NAVY,
  },
  modalBody: {
    padding: 16,
    gap: 16,
  },
  statusDisplay: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  statusIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: NAVY,
    marginBottom: 4,
  },
  statusDesc: {
    fontSize: 11,
    color: MUTED,
    lineHeight: 16,
  },
  infoSection: {
    backgroundColor: '#F1EFE840',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: BORDER,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  infoLabel: {
    fontSize: 12,
    color: MUTED,
  },
  infoValue: {
    fontSize: 12,
    fontWeight: '700',
    color: NAVY,
  },
  infoBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 99,
  },
})
