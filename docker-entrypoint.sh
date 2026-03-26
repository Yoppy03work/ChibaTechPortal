#!/bin/sh
# WHY: anonymous volumeがDockerfile内のprisma generate結果を上書きするため、
# コンテナ起動時に再度生成する
npx prisma generate --schema=./packages/db/prisma/schema.prisma
exec "$@"
