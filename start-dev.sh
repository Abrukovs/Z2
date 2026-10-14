#!/bin/bash
cd /home/z/my-project
export OPENROUTER_API_KEY=${OPENROUTER_API_KEY:-}
export CROSSCHECK_MODEL=nvidia/nemotron-3-ultra-550b-a55b:free
export DATABASE_URL=file:/home/z/my-project/db/custom.db
exec ./node_modules/.bin/next dev -p 3000
