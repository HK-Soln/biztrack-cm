'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { AddCartItemRequest } from '@biztrack/types'
import { addCartItem } from './api'
import { useCartSession } from './cart-store'

/**
 * Add-to-cart mutation, shared by product cards and the product detail page.
 * On success it persists the session token and primes the cart cache so the header
 * badge updates instantly (no extra round-trip).
 */
export function useAddToCart(slug: string) {
  const queryClient = useQueryClient()
  const setSessionToken = useCartSession((s) => s.setSessionToken)

  return useMutation({
    mutationFn: (payload: AddCartItemRequest) => addCartItem(slug, payload),
    onSuccess: (cart) => {
      setSessionToken(cart.sessionToken)
      queryClient.setQueryData(['cart', slug, cart.sessionToken], cart)
      queryClient.invalidateQueries({ queryKey: ['cart', slug] })
    },
  })
}
