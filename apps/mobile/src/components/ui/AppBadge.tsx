import React from 'react'
import { StyleSheet, Text, View } from 'react-native'

import theme from '../../../theme'
const { colors, radius } = theme

export type BadgeVariant =
  | 'owner'
  | 'manager'
  | 'cashier'
  | 'accountant'
  | 'pending'
  | 'active'
  | 'suspended'
  | 'trial'
  | 'info'
  | 'success'
  | 'warning'
  | 'danger'

interface AppBadgeProps {
  variant: BadgeVariant
  label?: string
  size?: 'sm' | 'md' | 'lg'
  children?: React.ReactNode
  className?: string
}

const BADGE_STYLES: Record<BadgeVariant, { bg: string; text: string; defaultLabel: string }> = {
  owner:       { bg: colors.success[50], text: colors.success[800], defaultLabel: 'Owner' },
  manager:     { bg: colors.brand[50],   text: colors.brand[800],   defaultLabel: 'Manager' },
  cashier:     { bg: colors.warning[50], text: colors.warning[800], defaultLabel: 'Cashier' },
  accountant:  { bg: colors.brand[50],   text: colors.brand[600],   defaultLabel: 'Accountant' },
  pending:     { bg: colors.neutral[50], text: colors.neutral[400], defaultLabel: 'Pending' },
  active:      { bg: colors.success[50], text: colors.success[800], defaultLabel: 'Active' },
  suspended:   { bg: colors.danger[50],  text: colors.danger[800],  defaultLabel: 'Suspended' },
  trial:       { bg: colors.warning[50], text: colors.warning[800], defaultLabel: 'Trial' },
  info:        { bg: colors.brand[50],   text: colors.brand[800],   defaultLabel: 'Info' },
  success:     { bg: colors.success[50], text: colors.success[800], defaultLabel: 'Success' },
  warning:     { bg: colors.warning[50], text: colors.warning[800], defaultLabel: 'Warning' },
  danger:      { bg: colors.danger[50],  text: colors.danger[800],  defaultLabel: 'Danger' },
}

export const AppBadge: React.FC<AppBadgeProps> = ({ variant, label, size, children, className }) => {
  const style = BADGE_STYLES[variant]
  const textContent = children || label || style.defaultLabel

  return (
    <View
      className={className}
      accessibilityRole="text"
      accessibilityLabel={`Badge: ${typeof textContent === 'string' ? textContent : ''}`}
      style={[
        styles.container,
        { backgroundColor: style.bg },
        size === 'sm' && { paddingHorizontal: 6, paddingVertical: 2 }
      ]}
    >
      {typeof textContent === 'string' || typeof textContent === 'number' ? (
        <Text style={[styles.text, { color: style.text }, size === 'sm' && { fontSize: 9 }]}>
          {textContent}
        </Text>
      ) : (
        textContent
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    borderRadius: radius.icon, // default 8 or 6 based on theme
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 10,
    fontWeight: '500',
  },
})
