import { describe, expect, it } from 'vitest'
import { computeCashVariance, computeExpectedCash } from './expected-cash'

describe('computeExpectedCash', () => {
  it('is just the float when nothing was sold', () => {
    expect(computeExpectedCash({ openingFloat: 10000, cashPayments: 0, changeGiven: 0 })).toBe(
      10000,
    )
  })

  it('adds cash taken and subtracts the change handed back', () => {
    // Sale total 4500, customer tenders 5000 cash, 500 change out of the drawer.
    // Net cash into the drawer = 4500.
    expect(computeExpectedCash({ openingFloat: 10000, cashPayments: 5000, changeGiven: 500 })).toBe(
      14500,
    )
  })

  it('AC: a heavy-discount shift reconciles to zero variance when the drawer is right', () => {
    // Two sales, both discounted. Cash tendered is already net of the discounts.
    //   A: total 4500 (after a 500 discount), tendered 5000 cash, change 500  → net 4500
    //   B: total 3000 (after a 2000 discount), tendered 3000 cash, change 0   → net 3000
    // Drawer should hold float 10000 + 4500 + 3000 = 17500.
    const expected = computeExpectedCash({
      openingFloat: 10000,
      cashPayments: 5000 + 3000,
      changeGiven: 500 + 0,
    })
    expect(expected).toBe(17500)
    // Cashier counts exactly that → zero variance, despite 2500 XAF of discounts.
    expect(computeCashVariance(17500, expected)).toBe(0)
  })

  it('folds cash movements in and out', () => {
    expect(
      computeExpectedCash({
        openingFloat: 10000,
        cashPayments: 8000,
        changeGiven: 0,
        cashIn: 2000, // a float top-up
        cashOut: 3000, // an expense paid from the till
      }),
    ).toBe(17000)
  })

  it('never lets forgotten change hide as a shortage', () => {
    // Without subtracting change this would read 15000 and the drawer (14500) would
    // look 500 short every time.
    expect(computeExpectedCash({ openingFloat: 10000, cashPayments: 5000, changeGiven: 500 })).toBe(
      14500,
    )
  })

  it('rounds the result to whole XAF', () => {
    expect(
      computeExpectedCash({ openingFloat: 10000.4, cashPayments: 5000.4, changeGiven: 0 }),
    ).toBe(15001)
  })
})

describe('computeCashVariance', () => {
  it('is positive when the drawer is over and negative when short', () => {
    expect(computeCashVariance(17600, 17500)).toBe(100)
    expect(computeCashVariance(17300, 17500)).toBe(-200)
  })
})
