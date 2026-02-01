#!/bin/sh
set -e

export DIRECT_URL=${DIRECT_URL:-$DATABASE_URL}

npx prisma generate
npx prisma migrate deploy
next build
