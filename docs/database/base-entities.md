# Base Entities

All entities must extend one of:
- `BaseEntity`: mutable entities, includes `id`, `createdAt`, `updatedAt`, `deletedAt`.
- `ImmutableBaseEntity`: immutable entities (logs, audits), includes `id`, `createdAt`.

Soft deletes are implemented with `deletedAt` (`DeleteDateColumn`).
