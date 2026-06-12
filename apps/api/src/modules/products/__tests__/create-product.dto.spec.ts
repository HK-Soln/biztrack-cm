/// <reference types="jest" />
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { CreateProductDto } from '../dto/create-product.dto'

const base = {
  name: 'Coca-Cola 50cl',
  sellingPrice: 500,
  unitOfMeasureId: '123e4567-e89b-42d3-a456-426614174000',
}

const validateDto = async (overrides: Record<string, unknown>) => {
  const dto = plainToInstance(CreateProductDto, { ...base, ...overrides })
  const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true })
  return errors.flatMap((e) => Object.keys(e.constraints ?? {}))
}

describe('CreateProductDto validation bounds', () => {
  it('accepts a well-formed product', async () => {
    expect(await validateDto({ taxRate: 19.25 })).toHaveLength(0)
  })

  it('rejects a tax rate above 100%', async () => {
    const errors = await validateDto({ taxRate: 5000 })
    expect(errors).toContain('max')
  })

  it('rejects a selling price with more than 2 decimal places', async () => {
    const errors = await validateDto({ sellingPrice: 9.999 })
    expect(errors).toContain('isNumber')
  })

  it('rejects a selling price beyond the decimal(12,2) ceiling', async () => {
    const errors = await validateDto({ sellingPrice: 99_999_999_999 })
    expect(errors).toContain('max')
  })

  it('allows a decimal quantity (scale 3) on openingStock', async () => {
    expect(await validateDto({ openingStock: 1.5 })).toHaveLength(0)
  })

  it('accepts a valid productType', async () => {
    expect(await validateDto({ productType: 'VARIABLE_QUANTITY' })).toHaveLength(0)
    expect(await validateDto({ productType: 'COMPOSITE' })).toHaveLength(0)
  })

  it('rejects an unknown productType', async () => {
    const errors = await validateDto({ productType: 'BUNDLE' })
    expect(errors).toContain('isEnum')
  })

  it('stays valid for legacy clients that send only isService (no productType)', async () => {
    expect(await validateDto({ isService: true })).toHaveLength(0)
  })
})
