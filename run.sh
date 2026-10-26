#!/bin/sh
cd "$(dirname "$0")" || exit

# Variables.
SCRIPT_NAME="$(basename "$0")"
SCRIPT_PATH="./$SCRIPT_NAME"
FILE_PACKAGE="package.json"
CONF_FILE=".run.conf"

WATCH_FILES=""
NM_PID=""

# Functions.
add_watch() {
	WATCH_FILES="${WATCH_FILES:+$WATCH_FILES }$1"
}

get_mtime() {
	stat -c %Y "$1" 2>/dev/null || stat -f %m "$1" 2>/dev/null
}

get_conf() {
	sed -n "s/^$1=//p" "$CONF_FILE" 2>/dev/null | tail -n 1
}

# Prints "<file> <mtime>" per watched file.
get_snapshot() {
	for f in $WATCH_FILES; do
		echo "$f $(get_mtime "$f")"
	done
}

# Prints the first watched file that differs from the initial snapshot.
get_changed() {
	for f in $WATCH_FILES; do
		cur=$(get_mtime "$f")
		old=$(printf '%s\n' "$INITIAL_SNAPSHOT" | sed -n "s/^$f //p")
		if [ "$cur" != "$old" ]; then
			echo "$f"
			return
		fi
	done
}

# Gracefully stops nodemon.
stop_nodemon() {
	[ -n "$NM_PID" ] || return 0
	kill -0 "$NM_PID" 2>/dev/null || return 0
	kill -TERM "$NM_PID" 2>/dev/null
	TRIES=0
	while kill -0 "$NM_PID" 2>/dev/null; do
		TRIES=$((TRIES + 1))
		if [ "$TRIES" -ge 5 ]; then
			kill -9 "$NM_PID" 2>/dev/null
			break
		fi
		sleep 1
	done
	wait "$NM_PID" 2>/dev/null
}

cleanup() {
	trap '' EXIT INT TERM HUP
	stop_nodemon
	if [ "$$" = "$(get_conf PID)" ]; then
		rm -f "$CONF_FILE"
	fi
}

main() {
	# Add watched files.
	add_watch "$SCRIPT_NAME"
	[ -f "nodemon.json" ] && add_watch "nodemon.json"
	
	# Take the snapshot first.
	INITIAL_SNAPSHOT=$(get_snapshot)

	# Stop any other running instances.
	if [ -f "$CONF_FILE" ]; then
		OLD_PID=$(get_conf PID)
		if [ -n "$OLD_PID" ] && [ "$OLD_PID" != "$$" ] && kill -0 "$OLD_PID" 2>/dev/null; then
			echo "Stopping previous instance (PID: $OLD_PID)..."
			kill -15 "$OLD_PID" 2>/dev/null
			sleep 1
			kill -0 "$OLD_PID" 2>/dev/null && kill -9 "$OLD_PID" 2>/dev/null
		fi
	fi

	# Write fresh config.
	echo "PID=$$" > "$CONF_FILE"
	trap cleanup EXIT
	trap 'exit 143' INT TERM HUP

	echo "Make sure there is only one host of bot!"

	# Install dependencies.
	if [ ! -f "$FILE_PACKAGE" ]; then
		echo && echo "File '$FILE_PACKAGE' not found."
		npm init -y
	fi

	echo && echo "Configuring npm..."
	npm config set fund false --location=project

	echo && echo "Installing dependencies..."
	npm install

	echo && echo "Running vulnerability audit check..."
	npm audit fix --omit=dev

	echo

	# A watched file may have changed while installing.
	CHANGED_FILE=$(get_changed)
	if [ -n "$CHANGED_FILE" ]; then
		echo "Changes detected in '$CHANGED_FILE'. Restarting completely..."
		trap - EXIT
		exec sh "$SCRIPT_PATH"
	fi

	# Start nodemon in the background.
	npx --yes nodemon <&0 &
	NM_PID=$!

	CHANGED_FILE=""
	while kill -0 "$NM_PID" 2>/dev/null; do
		CHANGED_FILE=$(get_changed)
		if [ -n "$CHANGED_FILE" ]; then
			stop_nodemon
			break
		fi
		sleep 1
	done

	if [ -n "$CHANGED_FILE" ]; then
		stty sane 2>/dev/null
		echo && echo "Changes detected in '$CHANGED_FILE'. Restarting completely..."
		trap - EXIT
		exec sh "$SCRIPT_PATH"
	fi
	
	wait "$NM_PID" 2>/dev/null
	STATUS=$?
	NM_PID=""
	stty sane 2>/dev/null
	echo && echo "Nodemon exited (Status $STATUS)."
	return "$STATUS"
}

main "$@"; exit $?