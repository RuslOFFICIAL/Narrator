#!/bin/sh
cd "$(dirname "$0")" || exit

SCRIPT_NAME="run.sh"
SCRIPT_PATH="./$SCRIPT_NAME"
CONFIG_NAME="nodemon.json"
get_mtime() {
	stat -c %Y "$1" 2>/dev/null || stat -f %m "$1" 2>/dev/null
}

echo "Make sure there is only one host of bot!" && echo

# Configuration.
FILE_PACKAGE=package.json

# Install dependencies.
if [ ! -f "$FILE_PACKAGE" ]; then
	echo "File '$FILE_PACKAGE' not found."
	npm init -y
fi
npm install

echo

# Startup.
npx --yes nodemon --no-stdin &
BOT_PID=$!

sleep 5
INITIAL_SCRIPT_MTIME=$(get_mtime "$SCRIPT_PATH")
INITIAL_CONFIG_MTIME=$(get_mtime "$CONFIG_NAME")

# Monitor loop.
while kill -0 $BOT_PID 2>/dev/null; do
	sleep 2
	CURRENT_SCRIPT_MTIME=$(get_mtime "$SCRIPT_PATH")
	CURRENT_CONFIG_MTIME=$(get_mtime "$CONFIG_NAME")
	
	if [ "$CURRENT_SCRIPT_MTIME" != "$INITIAL_SCRIPT_MTIME" ]; then
		echo && echo "Changes detected in '$SCRIPT_NAME'. Restarting completely..."
		kill -15 $BOT_PID 2>/dev/null
		wait $BOT_PID 2>/dev/null
		exec sh "$SCRIPT_PATH"
	fi

	if [ "$CURRENT_CONFIG_MTIME" != "$INITIAL_CONFIG_MTIME" ]; then
		echo && echo "Changes detected in '$CONFIG_NAME'. Restarting completely..."
		kill -15 $BOT_PID 2>/dev/null
		wait $BOT_PID 2>/dev/null
		exec sh "$SCRIPT_PATH"
	fi
done

wait $BOT_PID
