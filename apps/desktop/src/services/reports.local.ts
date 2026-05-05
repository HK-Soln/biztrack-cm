'use client'

import { dbQuery } from './local-db'
import { assertBusinessId } from './products.local'

export type ReportSaleRow = {
  id: string
  business_id: string
  cashier_id: string
  cashier_name: string | null
  sale_number: string | null
  receipt_number: string | null
  status: string
  total_amount: number | null
  amount_paid: number | null
  credit_amount: number | null
  payment_method: string | null
  customer_name: string | null
  price_drift_warning: number | null
  sale_date: string | null
  sold_at: string | null
  synced_at: string | null
  voided_at: string | null
  void_reason: string | null
  created_at: string
}

export type ReportSaleItemRow = {
  id: string
  sale_id: string
  product_id: string
  product_name: string
  product_sku: string | null
  quantity: number
  line_total: number | null
  total_price: number | null
  cost_price: number | null
}

export type ReportSalePaymentRow = {
  id: string
  sale_id: string
  method: string
  amount: number
  mobile_money_reference: string | null
  created_at: string
}

export type ReportRestockRow = {
  id: string
  business_id: string
  reference_number: string | null
  supplier_id: string | null
  supplier_name: string | null
  total_amount: number | null
  total_cost: number | null
  amount_paid: number | null
  credit_amount: number
  notes: string | null
  created_at: string
}

export type ReportRestockItemRow = {
  id: string
  restock_record_id: string
  product_id: string
  product_name: string | null
  quantity: number
  unit_cost: number | null
  new_quantity: number
  created_at: string
}

export type ReportRestockPaymentRow = {
  id: string
  restock_record_id: string
  method: string
  amount: number
  mobile_money_reference: string | null
  created_at: string
}

export async function getReportSalesSnapshotLocal(
  businessId: string,
  startDate: string,
  endDate: string,
) {
  const normalizedBusinessId = assertBusinessId(businessId)
  const sales = await dbQuery<ReportSaleRow>(
    `
      SELECT
        id,
        business_id,
        cashier_id,
        cashier_name,
        sale_number,
        receipt_number,
        status,
        total_amount,
        amount_paid,
        credit_amount,
        payment_method,
        customer_name,
        price_drift_warning,
        sale_date,
        sold_at,
        synced_at,
        voided_at,
        void_reason,
        created_at
      FROM sales
      WHERE business_id = ?
        AND is_deleted = 0
        AND sale_date >= ?
        AND sale_date <= ?
      ORDER BY sold_at DESC, created_at DESC
    `,
    [normalizedBusinessId, startDate, endDate],
  )

  if (sales.length === 0) {
    return {
      sales: [] as ReportSaleRow[],
      items: [] as ReportSaleItemRow[],
      payments: [] as ReportSalePaymentRow[],
    }
  }

  const saleIds = sales.map((sale) => sale.id)
  const salePlaceholders = saleIds.map(() => '?').join(', ')
  const items = await dbQuery<ReportSaleItemRow>(
    `
      SELECT
        id,
        sale_id,
        product_id,
        product_name,
        product_sku,
        quantity,
        line_total,
        total_price,
        cost_price
      FROM sale_items
      WHERE is_deleted = 0
        AND sale_id IN (${salePlaceholders})
    `,
    saleIds,
  )
  const payments = await dbQuery<ReportSalePaymentRow>(
    `
      SELECT
        id,
        sale_id,
        method,
        amount,
        mobile_money_reference,
        created_at
      FROM sale_payments
      WHERE sale_id IN (${salePlaceholders})
    `,
    saleIds,
  )

  return {
    sales,
    items,
    payments,
  }
}

export async function getReportRestocksSnapshotLocal(
  businessId: string,
  startDate: string,
  endDate: string,
) {
  const normalizedBusinessId = assertBusinessId(businessId)
  const restocks = await dbQuery<ReportRestockRow>(
    `
      SELECT
        id,
        business_id,
        reference_number,
        supplier_id,
        supplier_name,
        total_amount,
        total_cost,
        amount_paid,
        credit_amount,
        notes,
        created_at
      FROM restock_records
      WHERE business_id = ?
        AND substr(created_at, 1, 10) >= ?
        AND substr(created_at, 1, 10) <= ?
      ORDER BY created_at DESC
    `,
    [normalizedBusinessId, startDate, endDate],
  )

  if (restocks.length === 0) {
    return {
      restocks: [] as ReportRestockRow[],
      items: [] as ReportRestockItemRow[],
      payments: [] as ReportRestockPaymentRow[],
    }
  }

  const restockIds = restocks.map((restock) => restock.id)
  const restockPlaceholders = restockIds.map(() => '?').join(', ')
  const items = await dbQuery<ReportRestockItemRow>(
    `
      SELECT
        ri.id,
        ri.restock_record_id,
        ri.product_id,
        p.name AS product_name,
        ri.quantity,
        ri.unit_cost,
        ri.new_quantity,
        ri.created_at
      FROM restock_items ri
      LEFT JOIN products p ON p.id = ri.product_id
      WHERE ri.restock_record_id IN (${restockPlaceholders})
      ORDER BY ri.created_at DESC
    `,
    restockIds,
  )
  const payments = await dbQuery<ReportRestockPaymentRow>(
    `
      SELECT
        id,
        restock_record_id,
        method,
        amount,
        mobile_money_reference,
        created_at
      FROM restock_payments
      WHERE restock_record_id IN (${restockPlaceholders})
      ORDER BY created_at DESC
    `,
    restockIds,
  )

  return {
    restocks,
    items,
    payments,
  }
}
