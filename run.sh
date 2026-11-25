#!/bin/bash
[ -n "$BASH_VERSION" ] && set +H
cd "$(dirname "$0")" || exit

# Variables.
SCRIPT_NAME="$(basename "$0")"
SCRIPT_PATH="./$SCRIPT_NAME"
MAIN_SCRIPT_NAME="narrator.js"
MAIN_SCRIPT="./$MAIN_SCRIPT_NAME"
FILE_PACKAGE_NAME="package.json"
FILE_PACKAGE="./$FILE_PACKAGE_NAME"
ENV_FILE_NAME=".env"
ENV_FILE="./$ENV_FILE_NAME"

BOT_WATCH_TARGETS=(
	"$MAIN_SCRIPT_NAME"
	"$FILE_PACKAGE_NAME"
	"$ENV_FILE_NAME"
	"commands"
	"locales"
)

DATA_DIR="data"
CONF_FILE="$DATA_DIR/run.conf"

WATCH_FILES=""
NM_PID=""

# Terminal colors.
if [ -t 1 ]; then
	C_RESET='\033[0m'
	C_DIM='\033[2m'
	C_RED='\033[0;31m'
	C_GREEN='\033[0;32m'
	C_YELLOW='\033[0;33m'
	C_BLUE='\033[0;34m'
	C_CYAN='\033[0;36m'
else
	C_RESET='' C_DIM='' C_RED='' C_GREEN='' C_YELLOW='' C_BLUE='' C_CYAN=''
fi

say_info()	{ echo -e "${C_CYAN}$*${C_RESET}"; }
say_ok()	{ echo -e "${C_GREEN}$*${C_RESET}"; }
say_warn()	{ echo -e "${C_YELLOW}$*${C_RESET}"; }
say_err()	{ echo -e "${C_RED}$*${C_RESET}"; }

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
		printf '%s %s\n' "$f" "$(get_mtime "$f")"
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

is_run_sh() {
	if [ -r "/proc/$1/cmdline" ]; then
		tr '\0' ' ' < "/proc/$1/cmdline" | grep -q "$SCRIPT_NAME"
	else
		ps -p "$1" -o command= 2>/dev/null | grep -q "$SCRIPT_NAME"
	fi
}

cleanup() {
	trap '' EXIT INT TERM HUP
	stop_nodemon
	if [ "$$" = "$(get_conf PID)" ]; then
		rm -f "$CONF_FILE"
	fi
}

log_forced_end() {
	node -e "require('./commands/helpers.js').writeCenteredLog('End of the session (' + process.argv[1] + ')')" "${1:-Forced Stop}" 2>/dev/null
}

kill_tree() {
	WINPID=$(cat "/proc/$1/winpid" 2>/dev/null)
	if [ -n "$WINPID" ] && command -v taskkill >/dev/null 2>&1; then
		taskkill //F //T //PID "$WINPID" >/dev/null 2>&1
		log_forced_end "Updated File"
	fi
}

# Files that restart the bot when changed.
get_bot_snapshot() {
	for target in "${BOT_WATCH_TARGETS[@]}"; do
		if [ -d "$target" ]; then
			find "$target" -type f -name '*.js' 2>/dev/null
		else
			printf '%s\n' "$target"
		fi
	done | while IFS= read -r f; do
		printf '%s %s\n' "$f" "$(get_mtime "$f")"
	done
}

# Waits until a bot file or a watcher file changes.
wait_for_changes() {
	SNAP=$(get_bot_snapshot)
	while true; do
		CHANGED_FILE=$(get_changed)
		if [ -n "$CHANGED_FILE" ]; then
			stty sane 2>/dev/null
			say_warn "\nChanges detected in '$CHANGED_FILE'. Restarting completely...\n"
			trap - EXIT
			exec bash "$SCRIPT_PATH"
		fi
		[ "$(get_bot_snapshot)" != "$SNAP" ] && return 0
		sleep 1
	done
}

main() {
	# Keep a copy of the real stdin (console input) for nodemon.
	exec 3<&0

	# Add watched files.
	add_watch "$SCRIPT_NAME"
	
	# Take the snapshot first.
	INITIAL_SNAPSHOT=$(get_snapshot)

	# Stop any other running instances.
	if [ -f "$CONF_FILE" ]; then
		OLD_PID=$(get_conf PID)
		if [ -n "$OLD_PID" ] && [ "$OLD_PID" != "$$" ] && kill -0 "$OLD_PID" 2>/dev/null && is_run_sh "$OLD_PID"; then
			say_warn "Stopping previous instance (PID: $OLD_PID)...\n"
			kill -15 "$OLD_PID" 2>/dev/null
			sleep 1
			kill -0 "$OLD_PID" 2>/dev/null && kill -9 "$OLD_PID" 2>/dev/null
		fi
	fi

	# Write fresh config.
	mkdir -p "$DATA_DIR"
	echo "PID=$$" > "$CONF_FILE"
	export RUN_SH_PID=$$
	trap cleanup EXIT
	trap 'exit 143' INT TERM HUP

	say_warn "Make sure there is only one host of bot!"

	# Install dependencies.
	if [ ! -f "$FILE_PACKAGE" ]; then
		say_warn "\nFile '$FILE_PACKAGE_NAME' not found."
		npm init -y
	fi

	say_info "\nConfiguring npm..."
	npm config set fund false --location=project

	say_info "\nInstalling dependencies..."
	npm install

	say_info "\nRunning vulnerability audit check..."
	npm audit --omit=dev || true

	echo

	# A watched file may have changed while installing.
	CHANGED_FILE=$(get_changed)
	if [ -n "$CHANGED_FILE" ]; then
		say_warn "\nChanges detected in '$CHANGED_FILE'. Restarting completely...\n"
		trap - EXIT
		exec bash "$SCRIPT_PATH"
	fi

	# Run the bot in a loop and react to its exit code.
	while true; do
		BOT_SNAPSHOT=$(get_bot_snapshot)
		node "$MAIN_SCRIPT" <&3 3<&- &
		NM_PID=$!
		RESTART_BOT=""

		# Watch for file changes while the bot is running.
		while kill -0 "$NM_PID" 2>/dev/null; do
			CHANGED_FILE=$(get_changed)
			if [ -n "$CHANGED_FILE" ]; then
				stop_nodemon
				stty sane 2>/dev/null
				say_warn "\nChanges detected in '$CHANGED_FILE'. Restarting completely..."
				trap - EXIT
				exec bash "$SCRIPT_PATH"
			fi
			if [ "$(get_bot_snapshot)" != "$BOT_SNAPSHOT" ]; then
				say_warn "\nBot files changed. Restarting bot..."
				stop_nodemon
				RESTART_BOT=1
				break
			fi
			sleep 1
		done

		if [ -n "$RESTART_BOT" ]; then
			STATUS=42
		else
			wait "$NM_PID" 2>/dev/null
			STATUS=$?
		fi
		NM_PID=""
		stty sane 2>/dev/null

		case "$STATUS" in
			0)
				say_ok "\nBot exited (Status 0). Exiting watcher...\n"
				return 0
				;;
			42)
				say_ok "\nRestarting bot (Status 42)...\n"
				;;
			43)
				say_ok "\nBot shut down (Status 43). Waiting for changes...\n"
				wait_for_changes
				;;
			44)
				say_ok "\nRestarting watcher (Status 44)...\n"
				trap - EXIT
				exec bash "$SCRIPT_PATH"
				;;
			*)
				say_err "\nBot crashed (Status $STATUS). Waiting for changes...\n"
				wait_for_changes
				;;
		esac
	done
}

main "$@"; exit $?
