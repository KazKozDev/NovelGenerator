#!/bin/sh
# Start the NovelGenerator MCP server over stdio from any folder: agents point their config here.
cd "$(dirname "$0")/.." || exit 1
exec ./node_modules/.bin/vite-node mcp/server.ts
