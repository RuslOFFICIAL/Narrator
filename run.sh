#!/bin/sh
cd "$(dirname "$0")" || exit

echo "Make sure there is only one host of bot!" && echo

# Configuration.
FILE_STARTUP=narrator.js

# Startup.
npm install
echo
npx --yes nodemon --watch . --watch .env --ext js,json,env "$FILE_STARTUP"
