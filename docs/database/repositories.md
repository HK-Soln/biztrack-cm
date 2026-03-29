# Base Repositories

All repositories should extend:
- `BaseRepository<T extends BaseEntity>`
- `ImmutableBaseRepository<T extends ImmutableBaseEntity>`

These provide common CRUD helpers and a `paginate` method returning:
`{ data, total, page, limit, totalPages }`.

Modules own their repositories and do not export them.
