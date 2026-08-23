#!/bin/sh
set -eu

pnpm --filter @workspace/db exec prisma migrate deploy
exec pnpm --filter web start
