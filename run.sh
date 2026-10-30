#!/bin/sh
set +H
cd "$(dirname "$0")" || exit

# Variables.
SCRIPT_NAME="$(basename "$0")"
SCRIPT_PATH="./$SCRIPT_NAME"
FILE_PACKAGE="package.json"
CONF_FILE=".run.conf"
STOP_FILE=".run.stop"

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
	kill_tree "$NM_PID"
	command -v pkill >/dev/null 2>&1 && pkill -TERM -P "$NM_PID" 2>/dev/null
	kill -TERM "$NM_PID" 2>/dev/null
	TRIES=0
	while kill -0 "$NM_PID" 2>/dev/null; do
		TRIES=$((TRIES + 1))
		if [ "$TRIES" -ge 5 ]; then
			command -v pkill >/dev/null 2>&1 && pkill -KILL -P "$NM_PID" 2>/dev/null
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

kill_tree() {
	WINPID=$(cat "/proc/$1/winpid" 2>/dev/null)
	if [ -n "$WINPID" ] && command -v taskkill >/dev/null 2>&1; then
		taskkill //F //T //PID "$WINPID" >/dev/null 2>&1
	fi
}

main() {
	# Keep a copy of the real stdin (console input) for nodemon.
	exec 3<&0

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
	rm -f "$STOP_FILE"
	export RUN_SH_PID=$$
	trap cleanup EXIT
	trap 'exit 143' INT TERM HUP

	echo "Make sure there is only one host of bot!"

	# Install dependencies.
	if [ ! -f "$FILE_PACKAGE" ]; then
		echo -e "\nFile '$FILE_PACKAGE' not found."
		npm init -y
	fi

	echo -e "\nConfiguring npm..."
	npm config set fund false --location=project

	echo -e "\nInstalling dependencies..."
	npm install

	echo -e "\nRunning vulnerability audit check..."
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
	npx --yes nodemon --no-stdin <&3 3<&- &
	NM_PID=$!

	CHANGED_FILE=""
	while kill -0 "$NM_PID" 2>/dev/null; do
		if [ -f "$STOP_FILE" ]; then
			rm -f "$STOP_FILE"
			echo -e "\nStop requested. Exiting..."
			stop_nodemon
			cleanup
			exit 0
		fi
		CHANGED_FILE=$(get_changed)
		if [ -n "$CHANGED_FILE" ]; then
			stop_nodemon
			break
		fi
		sleep 1
	done
	
	if [ -z "$CHANGED_FILE" ]; then
		cleanup
		exit 0
	fi


	if [ -n "$CHANGED_FILE" ]; then
		stty sane 2>/dev/null
		echo -e "\nChanges detected in '$CHANGED_FILE'. Restarting completely..."
		trap - EXIT
		exec sh "$SCRIPT_PATH"
	fi
	
	wait "$NM_PID" 2>/dev/null
	STATUS=$?
	NM_PID=""
	stty sane 2>/dev/null
	echo -e "\nNodemon exited (Status $STATUS)."
	return "$STATUS"
}

main "$@"; exit $?
