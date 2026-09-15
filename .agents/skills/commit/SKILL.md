---
name: commit
description: Create focused git commits, one concern each, in Commitizen format. Use when the user asks to commit or stage work, when a commit message needs writing, or when another skill reaches its commit step.
---

Read `git status` and `git diff HEAD` to see everything uncommitted, untracked files included. Understand what the work actually did before naming it.

Group the changes so each commit holds a single concern: one feature, one fix, one refactor, one chore. When a group feels mixed, split it. When everything genuinely serves one purpose, a single commit is the right answer.

Commit each group in turn: stage that group's paths explicitly with `git add <paths>`, then `git commit -m "<message>"`. Done when every changed and untracked file sits in a commit.

Messages follow Commitizen: one imperative line, scoped, no trailing period, e.g. `fix(sidebar): stop radix Slot from dropping RSC children during SSR`. `git log --oneline -20` shows the types and scopes in use here.

Sign the work as the user alone: the message ends on its subject line, with no `Co-Authored-By` line and no Claude Code footer.
