/**
 * Media type registry stub.
 * Real types (text / image / video / youtube) land in later subtareas.
 */

export type ItemTypeId = string;

export type ItemTypeRegistration = {
  type: ItemTypeId;
  label: string;
};

/** Empty registry — no product types registered yet. */
export const itemTypeRegistry: ReadonlyArray<ItemTypeRegistration> = [];

export function getItemType(type: ItemTypeId): ItemTypeRegistration | undefined {
  return itemTypeRegistry.find((entry) => entry.type === type);
}
