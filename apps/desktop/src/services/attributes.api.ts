'use client'

import { api } from './api'
import type {
  AttributeGroup,
  AttributeOption,
  CreateAttributeGroupRequest,
  CreateAttributeOptionRequest,
  UpdateAttributeGroupRequest,
  UpdateAttributeOptionRequest,
} from '@biztrack/types'
import { type ApiEnvelope, unwrapApiResponse } from './api-response'

// Attribute-group management is online-only (the device keeps a read-only mirror
// via sync). These call the API directly.

export async function listAttributeGroups(): Promise<AttributeGroup[]> {
  const { data } = await api.get<ApiEnvelope<AttributeGroup[]>>('/attribute-groups')
  return unwrapApiResponse<AttributeGroup[]>(data)
}

export async function createAttributeGroup(
  payload: CreateAttributeGroupRequest,
): Promise<AttributeGroup> {
  const { data } = await api.post<ApiEnvelope<AttributeGroup>>('/attribute-groups', payload)
  return unwrapApiResponse<AttributeGroup>(data)
}

export async function updateAttributeGroup(
  id: string,
  payload: UpdateAttributeGroupRequest,
): Promise<AttributeGroup> {
  const { data } = await api.patch<ApiEnvelope<AttributeGroup>>(`/attribute-groups/${id}`, payload)
  return unwrapApiResponse<AttributeGroup>(data)
}

export async function deleteAttributeGroup(id: string): Promise<void> {
  await api.delete(`/attribute-groups/${id}`)
}

export async function addAttributeOption(
  groupId: string,
  payload: CreateAttributeOptionRequest,
): Promise<AttributeOption> {
  const { data } = await api.post<ApiEnvelope<AttributeOption>>(
    `/attribute-groups/${groupId}/options`,
    payload,
  )
  return unwrapApiResponse<AttributeOption>(data)
}

export async function updateAttributeOption(
  groupId: string,
  optionId: string,
  payload: UpdateAttributeOptionRequest,
): Promise<AttributeOption> {
  const { data } = await api.patch<ApiEnvelope<AttributeOption>>(
    `/attribute-groups/${groupId}/options/${optionId}`,
    payload,
  )
  return unwrapApiResponse<AttributeOption>(data)
}

export async function deleteAttributeOption(groupId: string, optionId: string): Promise<void> {
  await api.delete(`/attribute-groups/${groupId}/options/${optionId}`)
}
