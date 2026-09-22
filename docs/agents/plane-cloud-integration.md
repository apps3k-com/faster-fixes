# Plane Cloud integration

## Product contract

Plane connects at the Faster Fixes organization level. Organization owners and
admins manage the connection, project bindings, invitations and reviewer email.
Plane roles never grant Faster Fixes privileges. Imported invitations use the
existing invitation acceptance and seat-limit flow.

Each project chooses manual export (default), Intake, or a selected Plane state.
Use an appropriate work item type and a writable text property for the immutable
FF feedback UUID. FF stores the remote UUID, identifier and URL independently.
An admin-maintained reviewer email can select the matching eligible Plane project
member; otherwise use the explicitly configured generic assignee. The integration
remains the technical creator. No identity is inferred from widget metadata.

Plane status mappings affect only FF: selected progress states map to
`in_progress`, selected done states to `resolved`. Unmapped states do nothing.
Remote deletion never removes feedback. Incoming status changes do not fan out
to other trackers.

Discussions are available only to organization members in the dashboard.
Comment sync is off by default. Enabling it synchronizes new comments, not the
historical backlog. Imported comments are readonly, edits belong to the source,
and deletions leave a tombstone. The original feedback text is not a discussion
comment. No Plane-internal content is exposed through the widget API.

## Cloud setup

Create a private OAuth application under Plane workspace settings → Integrations.
Configure these URLs using the externally reachable FF base URL:

- Setup: `/integrations` (choose the FF organization, then Connect Plane).
- Callback: `/api/plane/callback`.
- Webhook: `/api/webhooks/plane`.

The infrastructure owner supplies these variables in the runtime secret store or
`apps/web/.env.local`, never in committed configuration:

| Variable                     | Purpose                                               |
| ---------------------------- | ----------------------------------------------------- |
| `PLANE_ENABLED`              | Set to `true` to enable provider operations           |
| `PLANE_CLIENT_ID`            | Private application client ID                         |
| `PLANE_CLIENT_SECRET`        | Private application secret                            |
| `PLANE_TOKEN_ENCRYPTION_KEY` | 32 random bytes encoded as 64 hex characters          |
| `PLANE_WEBHOOK_SECRET`       | Secret for the configured Plane webhook               |
| `BETTER_AUTH_URL`            | Public FF origin used for OAuth callback construction |

The exact requested scopes live in `server/plane/client.ts`. Grant read access to
projects, their features/members/states/types/properties and workspace members;
grant read/write access to Intake, work items, property values, attachments and
comments. Configure v2 work-item and comment events. Test the actual app scopes
and webhook signature in the target Cloud workspace before enabling automation.

Keep the encryption key stable across upgrades. Changing it without re-encrypting
stored tokens and pending upload credentials prevents their decryption.

## Runtime and recovery

Run the existing Inngest integration alongside the Next.js application. Register
the `/api/inngest` endpoint. Local development uses the Inngest development server;
production needs the existing event/signing keys. The five-minute sweep recovers
persisted exports and events when initial delivery was missed, and reconciles
remote status and discussions. A healthy web process alone does not prove the
background processing is running.

Feedback and its Plane export intent commit in one database transaction. Export
stages persist independently: work item, reference property, image, diagnostic
Markdown. Downloads use FF storage access; Plane receives actual uploaded files.
If there is no screenshot or diagnostic data, the stage is recorded as absent.

The feedback panel displays remote links, stage states, assignment fallback and
errors. Retry resumes the operation. An uncertain creation is reconciled by
external correlation before any further creation; if no unique outcome can be
proven, investigate in Plane rather than creating a duplicate blindly.

Webhook signatures are checked against raw request bytes. Durable events use the
stable v2 `event_id`, not the per-delivery UUID. Acknowledge only after storage.
Disconnecting pauses synchronization and retains all mappings; reconnect to the
same workspace to resume. Do not repoint an existing linked feedback history at a
different Plane project.

## Migration and upstream updates

The schema adds Plane/discussion tables and nullable reviewer email. Existing
feedback and tracker models retain their semantics. New migration SQL must be
reviewed for destructive operations before application. Back up the database and
encryption key, apply the migration through the deployment owner's established
procedure, deploy with the feature disabled, then run a manual-export pilot.
Production migrations are user-managed; agents must not run `migrate:prod`.

To roll back application code, disable Plane first and stop its workers. Keep the
additive schema and mappings in place rather than dropping data. Preserve pending
jobs for a later forward fix.

Upstream touch points are the feedback transaction, root tRPC router, Inngest
registration, integration/settings/project-creation UI, reviewer email and the
feedback panel. Provider API logic stays under `server/plane`. Review these seams
when merging upstream changes and run existing tracker flows with Plane disabled.

## Focused acceptance

Use a dedicated Plane test project with Intake and a text property. Verify:

1. OAuth connect, token renewal, disconnect and reconnect from an FF admin session.
2. Project creation/linking, mode settings and role-independent user invitations.
3. Manual, Intake and state exports with both stored references and assignments.
4. Real image and Markdown attachments, including retry of a failed upload.
5. Plane progress/done/reopen mapping without a reverse tracker update.
6. Team discussion creation/edit/tombstone in both directions with no echo.
7. A duplicate webhook and a request by a user outside the organization.

Required repository checks: `pnpm typecheck`, `pnpm lint`, `pnpm lint:agent-rules`.
Use the repository-pinned pnpm version (10.4.1); a system pnpm 11 installation
interprets workspace overrides differently. Generate Prisma and build workspace
packages before checking a fresh checkout. Starting Next generates MDX collections
and route types needed by the existing typecheck.

`apps/web/scripts/plane-e2e-seed.ts` creates a fixture only when DATABASE_URL points
to a loopback database named `ff_plane_e2e`. Its credentials are deliberately local
test values. Never use that account or fixture in a deployed environment. Record
local FF/database checks separately from actual Plane Cloud E2E evidence.

## Verification record — 2026-09-22

- Passed: repository typecheck, Prisma generation and additive migrations against
  an isolated local PostgreSQL database, scoped agent lint for all changed web
  TypeScript files, and `git diff --check`.
- Passed with real Chromium, Next.js and PostgreSQL: sign-in, authorized feedback
  deep link, discussion create/edit/tombstone, reviewer email editing and disabled
  integration setup state (`scripts/plane-ui-e2e.py`).
- Passed with real PostgreSQL and mocked Plane/storage transport: manual/state/
  Intake exports, reference writing, assignment, image/Markdown upload stages,
  resumable retries and status processing (`scripts/plane-export-integration.ts`).
  Additional focused tRPC checks verified paused settings persistence, enabling
  the submitted form, clearing mappings and pausing while Plane is unavailable.
- Full lint commands remain unsuccessful on pre-existing warnings reproduced
  from an untouched HEAD archive. UI lint reports unused `children` in combobox;
  agent lint baseline contains 198 warnings. No source warning suppression was
  added. Generated Next/MDX output is excluded from lint.
- Live Plane OAuth, invitations, exports, attachments, webhook delivery and
  bidirectional comments remain unverified until test credentials and an eligible
  test project are supplied. Read-only capability inspection found no types or
  properties in FFA3K; workspace property access reports a plan limitation.
  Do not treat mocked transport checks as Cloud acceptance.

## Sources

- [OAuth bot flow](https://developers.plane.so/dev-tools/build-plane-app/choose-token-flow)
- [Webhook v2 contract](https://developers.plane.so/dev-tools/intro-webhooks)
- [Attachment upload](https://developers.plane.so/api-reference/issue-attachments/overview)
- [Planning project](https://app.plane.so/apps3k/projects/e1138ec3-3f29-4c1a-89db-5700fa976152/issues), FFA3K-1 through FFA3K-10
