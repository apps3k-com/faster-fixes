# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Layout

This is a **single-context** repo (one product, one domain language across `apps/` and `packages/`).

```
/
├── CONTEXT.md            ← glossary
├── docs/
│   ├── adr/              ← architectural decisions
│   ├── product/          ← product context (problem, solution, ICP)
│   │   ├── project.md
│   │   └── icp.md
│   ├── systems/          ← internal infrastructure docs
│   ├── features/         ← business feature docs
│   └── guides/           ← operational how-tos
└── ...
```

## Before exploring, read these

- **`CONTEXT.md`** at the repo root — domain glossary.
- **`docs/adr/`** — read ADRs that touch the area you're about to work in.
- **`docs/product/project.md`** and **`docs/product/icp.md`** — broader product context (problem, solution, target users). Useful when the work needs more than the glossary alone (e.g. naming features, writing user-facing copy, weighing trade-offs against the target user).

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill creates and updates them when terms or decisions actually get resolved.

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders) — but worth reopening because…_
