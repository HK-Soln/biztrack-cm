import React, { useEffect, useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ShoppingCart, Search, X, AlertTriangle, Package } from 'lucide-react-native'
import { useProductsStore, type Product } from '../../store/useProductsStore'
import { useCartStore } from '../../store/cart.store'
import { useSalesStore } from '../../store/useSalesStore'
import { Colors, addOpacity } from '../../utils/colors'
import { AppInput, AppButton, AppSyncIndicator } from '../../components/ui'
import { PosProductTile } from '../../components/sell/PosProductTile'
import { CartDrawer } from '../../components/sell/CartDrawer'
import { SaleReceiptModal } from '../../components/sell/SaleReceiptModal'
import { createSale, type Sale } from '../../services/sales.service'

const { NAVY, BLUE, CREAM, WHITE, MUTED, BORDER, AMBER } = Colors

export default function SellScreen() {
  const insets = useSafeAreaInsets()

  // Store actions/states
  const {
    categories,
    isLoading,
    error,
    searchQuery,
    selectedCategoryId,
    filteredProducts,
    setSearchQuery,
    setSelectedCategory,
    fetchProducts,
    fetchCategories,
  } = useProductsStore()

  const {
    items: cartItems,
    paymentMethod,
    discountAmount,
    customer,
    itemCount,
    total: getCartTotal,
    addItem,
    clear: clearCart,
  } = useCartStore()

  // Local UI states
  const [isCartOpen, setIsCartOpen] = useState(false)
  const [isCheckingOut, setIsCheckingOut] = useState(false)
  const [isReceiptOpen, setIsReceiptOpen] = useState(false)
  const [createdSale, setCreatedSale] = useState<Sale | null>(null)

  // Fetch catalog on mount
  useEffect(() => {
    fetchProducts().catch(() => {})
    fetchCategories().catch(() => {})
  }, [fetchProducts, fetchCategories])

  const handleProductPress = (product: Product) => {
    addItem(product)
  }

  const handleCheckout = async () => {
    if (cartItems.length === 0) {
      Alert.alert('Erreur', 'Votre panier est vide.')
      return
    }

    if (paymentMethod === 'CREDIT' && !customer) {
      Alert.alert('Client requis', 'Veuillez sélectionner un client pour effectuer une vente à crédit.')
      return
    }

    setIsCheckingOut(true)
    try {
      const saleItems = cartItems.map((item) => ({
        productId: item.product.id,
        productName: item.product.name,
        quantity: item.quantity,
        unitPrice: item.product.price,
        subtotal: item.product.price * item.quantity,
      }))

      const payload = {
        items: saleItems,
        paymentMethod,
        discountAmount: discountAmount || undefined,
        customerId: customer?.id || undefined,
      }

      const saleResult = await createSale(payload)

      // Add to sales store state reactive cache
      useSalesStore.getState().addSaleToState({
        id: saleResult.id,
        receiptNumber: saleResult.receiptNumber,
        items: saleResult.items.map((it, index) => ({
          id: `${saleResult.id}-item-${index}`,
          productId: it.productId,
          productName: it.productName,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          totalPrice: it.subtotal,
        })),
        paymentMethod: saleResult.paymentMethod,
        subtotal: saleResult.subtotal,
        discountAmount: saleResult.discountAmount,
        total: saleResult.total,
        customerId: saleResult.customerId,
        createdAt: saleResult.createdAt,
      })

      // Success flow
      if (saleResult.paymentMethod === 'CREDIT') {
        // Dynamically import and refresh the debts store cache
        import('../../store/useDebtsStore').then(({ useDebtsStore }) => {
          useDebtsStore.getState().fetchDebts().catch(() => {})
        }).catch(() => {})
      }

      setCreatedSale(saleResult)
      setIsCartOpen(false)
      setIsReceiptOpen(true)
      clearCart()
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Une erreur est survenue lors de la validation de la vente.'
      Alert.alert('Erreur', errorMessage)
    } finally {
      setIsCheckingOut(false)
    }
  }

  const itemsToRender = filteredProducts()
  const cartItemCount = itemCount()
  const cartTotal = getCartTotal()

  return (
    <View style={{ flex: 1, backgroundColor: CREAM }}>
      {/* Header */}
      <View style={{
        backgroundColor: NAVY,
        paddingTop: insets.top + 12,
        paddingBottom: 16,
        paddingHorizontal: 20,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <View>
          <Text style={{ fontSize: 18, fontWeight: '700', color: WHITE }}>Nouvelle vente</Text>
          <Text style={{ fontSize: 12, color: '#85B7EB', marginTop: 2 }}>Point de vente / POS</Text>
        </View>
        <AppSyncIndicator />
      </View>

      {/* Search & Filters */}
      <View style={{ paddingHorizontal: 16, paddingTop: 14, gap: 10 }}>
        <AppInput
          placeholder="Rechercher un produit..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          leftSlot={<Search size={18} color={MUTED} />}
          rightSlot={searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <X size={18} color={MUTED} />
            </TouchableOpacity>
          ) : null}
        />

        {/* Categories list */}
        <FlatList
          horizontal
          data={[{ id: null, name: 'Tous' } as unknown as typeof categories[number], ...categories]}
          keyExtractor={(item) => (item.id === null ? 'all' : item.id)}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingBottom: 4 }}
          renderItem={({ item }) => {
            const isSelected = selectedCategoryId === item.id
            return (
              <TouchableOpacity
                onPress={() => setSelectedCategory(item.id)}
                activeOpacity={0.72}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  borderRadius: 20,
                  backgroundColor: isSelected ? NAVY : WHITE,
                  borderWidth: 1,
                  borderColor: isSelected ? NAVY : BORDER,
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: '600', color: isSelected ? WHITE : NAVY }}>
                  {item.name}
                </Text>
              </TouchableOpacity>
            )
          }}
        />
      </View>

      {/* Catalog items list */}
      {isLoading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={BLUE} />
          <Text style={{ color: MUTED, marginTop: 8, fontSize: 12 }}>Chargement du catalogue...</Text>
        </View>
      ) : error ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 12 }}>
          <AlertTriangle size={36} color={AMBER} />
          <Text style={{ fontSize: 14, color: NAVY, fontWeight: '600', textAlign: 'center' }}>{error}</Text>
          <AppButton size="sm" onPress={fetchProducts}>Réessayer</AppButton>
        </View>
      ) : itemsToRender.length === 0 ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 12 }}>
          <View style={{ width: 72, height: 72, borderRadius: 20, backgroundColor: addOpacity(BLUE, '12'), alignItems: 'center', justifyContent: 'center' }}>
            <Package size={32} color={BLUE} />
          </View>
          <Text style={{ fontSize: 16, fontWeight: '700', color: NAVY }}>Aucun produit trouvé</Text>
          <Text style={{ fontSize: 12, color: MUTED, textAlign: 'center', lineHeight: 18 }}>
            {searchQuery ? 'Modifiez votre recherche ou sélectionnez une autre catégorie.' : 'Aucun produit actif disponible pour la vente.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={itemsToRender}
          keyExtractor={(item) => item.id}
          numColumns={2}
          renderItem={({ item }) => (
            <PosProductTile product={item} onPress={handleProductPress} />
          )}
          contentContainerStyle={{
            paddingHorizontal: 12,
            paddingTop: 8,
            paddingBottom: cartItemCount > 0 ? insets.bottom + 80 : insets.bottom + 20,
          }}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Bottom Cart Action Bar */}
      {cartItemCount > 0 && (
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => setIsCartOpen(true)}
          style={[styles.bottomBar, { bottom: insets.bottom + 8 }]}
        >
          <View style={styles.bottomBarLeft}>
            <View style={styles.cartIconBadge}>
              <ShoppingCart size={16} color={WHITE} strokeWidth={2} />
              <View style={styles.badgeCount}>
                <Text style={styles.badgeText}>{cartItemCount}</Text>
              </View>
            </View>
            <Text style={styles.bottomBarText}>
              Panier ({cartItemCount} {cartItemCount > 1 ? 'articles' : 'article'})
            </Text>
          </View>
          <View style={styles.bottomBarRight}>
            <Text style={styles.totalLabel}>Total :</Text>
            <Text style={styles.totalValue}>{cartTotal.toLocaleString('fr-FR')} F</Text>
          </View>
        </TouchableOpacity>
      )}

      {/* Cart Drawer */}
      <CartDrawer
        visible={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        onCheckout={handleCheckout}
        isCheckingOut={isCheckingOut}
      />

      {/* Post-Checkout Success Receipt Modal */}
      <SaleReceiptModal
        sale={createdSale}
        visible={isReceiptOpen}
        onClose={() => {
          setIsReceiptOpen(false)
          setCreatedSale(null)
        }}
        onNewSale={() => {
          setIsReceiptOpen(false)
          setCreatedSale(null)
        }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  bottomBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    backgroundColor: Colors.NAVY,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 6,
  },
  bottomBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cartIconBadge: {
    position: 'relative',
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeCount: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: Colors.BLUE,
    borderRadius: 9,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: Colors.NAVY,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: Colors.WHITE,
  },
  bottomBarText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.WHITE,
  },
  bottomBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  totalLabel: {
    fontSize: 12,
    color: '#85B7EB',
  },
  totalValue: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.WHITE,
  },
})
