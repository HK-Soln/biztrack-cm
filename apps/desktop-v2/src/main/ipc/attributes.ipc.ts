import { ipcMain } from 'electron'
import { IPC, type AttributeGroupInput, type AttributeOptionInput, type CategoryAttributeLinkInput } from '../../shared/ipc'
import type { AttributesService } from '../services/attributes.service'

export function registerAttributesIpc(attributes: AttributesService): void {
  ipcMain.handle(IPC.attributesListGroups, () => attributes.listGroups())
  ipcMain.handle(IPC.attributesCreateGroup, (_e, input: AttributeGroupInput) => attributes.createGroup(input))
  ipcMain.handle(IPC.attributesUpdateGroup, (_e, id: string, input: AttributeGroupInput) => attributes.updateGroup(id, input))
  ipcMain.handle(IPC.attributesDeleteGroup, (_e, id: string) => attributes.deleteGroup(id))
  ipcMain.handle(IPC.attributesAddOption, (_e, groupId: string, input: AttributeOptionInput) => attributes.addOption(groupId, input))
  ipcMain.handle(IPC.attributesUpdateOption, (_e, optionId: string, input: AttributeOptionInput) => attributes.updateOption(optionId, input))
  ipcMain.handle(IPC.attributesDeleteOption, (_e, optionId: string) => attributes.deleteOption(optionId))
  ipcMain.handle(IPC.attributesListCategoryLinks, (_e, categoryId: string) => attributes.listCategoryLinks(categoryId))
  ipcMain.handle(IPC.attributesSetCategoryLinks, (_e, categoryId: string, links: CategoryAttributeLinkInput[]) =>
    attributes.setCategoryLinks(categoryId, links),
  )
}
