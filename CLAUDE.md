# BizTrack CM

## Business logic goes in `packages/domain`

Every business rule (money, totals, discounts, stock, debts, settlement, cash variance,
calendar and period rules, limits, permissions) is implemented once, as a pure function in
`@biztrack/domain`, and called from the entry points. Never implement a rule directly in an
API service or controller, the sync applier, a desktop service or IPC handler, the renderer,
or the mobile app: those load state, call the domain, and persist the result.

Before writing or changing any such rule, use the `domain-logic` skill
(`.claude/skills/domain-logic/SKILL.md`). Design, roadmap and known divergences:
`docs/design/domain-package.md`.
