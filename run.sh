#!/bin/sh
cd "$(dirname "$0")" || exit

echo "Make sure there is only one host of bot!" && echo

# Configuration.
FILE_STARTUP=narrator.js

# Startup.
npm install
echo
node --watch $FILE_STARTUP	