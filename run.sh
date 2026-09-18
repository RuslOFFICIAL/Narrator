#!/bin/sh
cd "$(dirname "$0")" || exit

echo "Make sure there is only one host of bot!" && echo

# Configuration.
FILE_STARTUP=narrator.js
FILE_PACKAGE=package.json

# Install dependencies.
if [ -f "$FILE_PACKAGE" ]; then
	npm install
else
	echo "File '$FILE_PACKAGE' not found."
fi

echo

# Startup.
npx --yes nodemon --watch . --watch .env --ext js,json,env "$FILE_STARTUP"
