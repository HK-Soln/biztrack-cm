# Constraint Naming

TypeORM must not auto-name constraints or indexes.

Conventions:
- Unique constraints: `unq_<table>_<columns>`
- Normal indexes: `idx_<table>_<columns>`
- Check constraints: `chk_<table>_<rule>`
- Foreign keys: `fk_<table>_<column>`

Always set explicit names via `@Index`, `@Unique`, and `JoinColumn` options.
