#!/bin/sh
cd "$(dirname "$0")" || exit

SCRIPT_NAME="run.sh"
SCRIPT_PATH="./$SCRIPT_NAME"
get_mtime() {
	stat -c %Y "$SCRIPT_PATH" 2>/dev/null || stat -f %m "$SCRIPT_PATH" 2>/dev/null
}

echo "Make sure there is only one host of bot!" && echo

# Configuration.
FILE_STARTUP=narrator.js
FILE_PACKAGE=package.json

# Install dependencies.
if [ ! -f "$FILE_PACKAGE" ]; then
	echo "File '$FILE_PACKAGE' not found."
	npm init -y
fi
npm install

echo

# Startup.
npx --yes nodemon \
	--no-stdin \
	--watch . \
	--watch "$SCRIPT_NAME" \
	--ignore lores/ \
	--ignore sounds/ \
	--ignore node_modules/ \
	--ignore package-lock.json \
	--ignore voice-state.json \
	--watch .env \
	--ext js,json,env \
	--delay 1 \
	--dns-result-order=ipv4first \
	"$FILE_STARTUP"
BOT_PID=$!

sleep 5
INITIAL_MTIME=$(get_mtime)

# Monitor loop.
while kill -0 $BOT_PID 2>/dev/null; do
	sleep 2
	CURRENT_MTIME=$(get_mtime)
	if [ "$CURRENT_MTIME" != "$INITIAL_MTIME" ]; then
		echo && echo "Changes detected in '$SCRIPT_NAME'. Restarting completely..."
		kill -15 $BOT_PID 2>/dev/null
		wait $BOT_PID 2>/dev/null
		exec sh "$SCRIPT_PATH"
	fi
done

wait $BOT_PID
