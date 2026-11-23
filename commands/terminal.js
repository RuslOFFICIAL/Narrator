// Dependencies.
const fs = require('fs');
const path = require('path');
const net = require('net');
const { execFile } = require('child_process');
const { createAudioPlayer, createAudioResource, VoiceConnectionStatus } = require('@discordjs/voice');

// Variables.
const loresDir = path.join(__dirname, '../lores');
const soundsDir = path.join(__dirname, '../sounds');
const formatsMd = 'docs/formats.md'

const SOUND_EXT = '.mp3'

const stripControl = (text) => String(text).replace(/[\x00-\x1f\x7f]/g, '');

const LANG_CODE_REGEX = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/;
const SNOWFLAKE_REGEX = /^\d{5,25}$/;

const ROLE_ERRORS = {
	notFound: 'Role not found in that guild.',
	everyone: "The '@everyone' role cannot be selected.",
	managed: 'Bot/integration roles cannot be selected.',
	dangerous: 'Roles with Administrator, Manage Server or Manage Roles cannot be selected.',
	botPermission: 'The bot needs the Manage Roles permission.',
	botHierarchy: "That role is not below the bot's highest role.",
	userHierarchy: 'That role is not below your highest role.'
};
const ROLE_CREATE_ERRORS = {
	limit: 'Limit of roles per guild reached.',
	botPermission: ROLE_ERRORS.botPermission,
	invalidName: 'The role name cannot be empty.'
};
const ROLE_GIVE_ERRORS = {
	...ROLE_ERRORS,
	memberNotFound: 'Member not found in that guild.',
	notSelected: "That role is not in the guild's selected roles.",
	targetHierarchy: 'You do not outrank that member.',
	already: 'The member already has that role.'
};
const ROLE_TAKE_ERRORS = {
	...ROLE_GIVE_ERRORS,
	missing: 'The member does not have that role.'
};

function getHelpText(colorize) {
	return `${colorize('magenta', 'Commands')}:\n
${colorize('magenta', 'BOT')}:
- ${colorize('blue', 'help')}: Show terminal commands.
- ${colorize('blue', 'exit/shutdown')}: Shut down the bot.
- ${colorize('blue', 'stop')}: Completely end the process.
- ${colorize('blue', 'restart')}: Restart the bot.
- ${colorize('blue', 'reboot')}: Restart the bot and the watcher script.
- ${colorize('blue', 'status')}: Status of the bot.
- ${colorize('blue', 'ping')}: Check bot latency.
- ${colorize('blue', 'clear')}: Clear the terminal screen.
\nSERVER:
- ${colorize('blue', 'echo')}: Send a message to a specific channel by ID or edit a message by ID.
- ${colorize('blue', 'info')}: Show bot info.
- ${colorize('blue', 'role-create')}: Create a role and add it to a server's selected roles.
- ${colorize('blue', 'role-give')}: Give a selected role to a member.
- ${colorize('blue', 'role-take')}: Take a selected role from a member.
- ${colorize('blue', 'role-add')}: Add a role to a server's selected roles.
- ${colorize('blue', 'role-remove')}: Remove a role from server's selected roles.
- ${colorize('blue', 'role-list')}: List server's selected roles.
- ${colorize('blue', 'lore')}: Print a random lore snippet.
- ${colorize('blue', 'lore-list')}: Lists lore snippets.
- ${colorize('blue', 'lore-create')}: Create lore file for a guild.
- ${colorize('blue', 'lore-remove')}: Remove a specific lore snippet.
- ${colorize('blue', 'voice-join')}: Connect bot to specified voice channel by ID.
- ${colorize('blue', 'voice-leave')}: Disconnect bot from voice channel.
- ${colorize('blue', 'soundboard-play')}: Play the specified soundboard audio.
- ${colorize('blue', 'soundboard-stop')}: Stop playing the soundboard audio.
- ${colorize('blue', 'soundboard-volume')}: Set playback volume (0-100).
\nCheck command formats in file ${colorize('magenta', `"${formatsMd}"`)}.`;
}

const getLoreFiles = () => {
	try { return fs.readdirSync(loresDir).filter(file => file.endsWith('.js')); }
	catch (err) { return []; }
};

function restAfter(text, n) {
	let rest = text.trimStart();
	for (let i = 0; i < n; i++) rest = rest.replace(/^\S+\s*/, '');
	return rest;
}

async function runTerminalLine(line, context) {
	const { rl, colorize, consoleLog, getTimestamp } = context;
	
	const trimmedLine = line.trim();
	if (!trimmedLine) {
		rl.prompt();
		return;
	}

	let subCommands = [];
	let remaining = trimmedLine;
	while (remaining) {
		const firstWord = remaining.split(/\s+/)[0].toLowerCase();
		if (firstWord === 'echo' || firstWord === 'lore-create') {
			subCommands.push(remaining.trim());
			break;
		}
		const separatorIndex = remaining.indexOf('&&');
		if (separatorIndex === -1) {
			subCommands.push(remaining.trim());
			break;
		}
		subCommands.push(remaining.slice(0, separatorIndex).trim());
		remaining = remaining.slice(separatorIndex + 2).trim();
	}
	subCommands = subCommands.filter(Boolean);

	let isFirst = true;
	for (const subCmd of subCommands) {
		if (!isFirst) {
			consoleLog(); // Prints an empty line between commands.
		}
		isFirst = false;

		const args = subCmd.split(/\s+/);
		const command = args[0].toLowerCase();

		// Commands that are allowed to have more than 1 argument.
		const multiArgCommands = new Set([
			'echo',
			'role-create', 'role-give', 'role-take', 'role-add', 'role-remove', 'role-list',
			'lore', 'lore-list', 'lore-create', 'lore-remove',
			'voice-join', 'voice-leave', 'soundboard-play', 'soundboard-stop', 'soundboard-volume'
		]);

		// If the command is not in the multi-arg list, enforce strict single-word usage.
		if (!multiArgCommands.has(command) && TERMINAL_COMMANDS.includes(command) && args.length > 1) {
			consoleLog(`${getTimestamp()} ${colorize('yellow', 'Error')}: ${colorize('yellow', `'${command}' does not take any arguments.`)}`);
			break;
		}

		// Terminal commands.
		switch (command) {
			default: {
				consoleLog(`${getTimestamp()} Unknown terminal command: "${command}".`);
				break;
			}

			// Bot.
			case 'help': {
				await terminalHelp(subCmd, args, context);
				break;
			}

			case 'status': {
				await terminalStatus(subCmd, args, context);
				break;
			}

			case 'ping': {
				await terminalPing(subCmd, args, context);
				break;
			}

			case 'clear': {
				await terminalClear(subCmd, args, context);
				break;
			}

			case 'exit':
			case 'shutdown': {
				if (await terminalShutdown(subCmd, args, context)) return;
				break;
			}

			case 'stop': {
				if (await terminalStop(subCmd, args, context)) return;
				break;
			}

			case 'restart': {
				if (await terminalRestart(subCmd, args, context)) return;
				break;
			}

			case 'reboot': {
				if (await terminalReboot(subCmd, args, context)) return;
				break;
			}

			// Server.
			case 'echo': {
				await terminalEcho(subCmd, args, context);
				break;
			}

			case 'info': {
				await terminalInfo(subCmd, args, context);
				break;
			}
			
			case 'role-create': {
				await terminalRoleCreate(subCmd, args, context);
				break;
			}
			
			case 'role-give': {
				await terminalRoleGive(subCmd, args, context);
				break;
			}
			
			case 'role-take': {
				await terminalRoleTake(subCmd, args, context);
				break;
			}
			
			case 'role-add': {
				await terminalRoleAdd(subCmd, args, context);
				break;
			}

			case 'role-remove': {
				await terminalRoleRemove(subCmd, args, context);
				break;
			}

			case 'role-list': {
				await terminalRoleList(subCmd, args, context);
				break;
			}

			case 'lore': {
				await terminalLore(subCmd, args, context);
				break;
			}

			case 'lore-list': {
				await terminalLoreList(subCmd, args, context);
				break;
			}

			case 'lore-create': {
				await terminalLoreCreate(subCmd, args, context);
				break;
			}

			case 'lore-remove': {
				await terminalLoreRemove(subCmd, args, context);
				break;
			}

			case 'voice-join': {
				await terminalVoiceJoin(subCmd, args, context);
				break;
			}

			case 'voice-leave': {
				await terminalVoiceLeave(subCmd, args, context);
				break;
			}

			case 'soundboard-play': {
				await terminalSoundboardPlay(subCmd, args, context);
				break;
			}

			case 'soundboard-stop': {
				await terminalSoundboardStop(subCmd, args, context);
				break;
			}

			case 'soundboard-volume': {
				await terminalSoundboardVolume(subCmd, args, context);
				break;
			}
		}
	}

	consoleLog();
	try {
		if (!rl.closed) {
			rl.prompt();
		}
	} catch (err) {
		// Readline is closed, ignore safely.
	}
}

async function handleTerminalLine(line, context) {
	const { rl, colorize, consoleLog, getTimestamp } = context;
	try {
		await runTerminalLine(line, context);
	} catch (err) {
		consoleLog(`${getTimestamp()} ${colorize('red', 'Terminal command failed')}: `, err);
		try {
			if (!rl.closed) rl.prompt();
		} catch (e) {}
	}
}

// Tab completion.
const TERMINAL_COMMANDS = [
	'help', 'status', 'ping', 'clear',
	'exit', 'stop', 'shutdown', 'restart', 'reboot',
	'echo', 'info',
	'role-create', 'role-give', 'role-take', 'role-add', 'role-remove', 'role-list',
	'lore', 'lore-list', 'lore-create', 'lore-remove',
	'voice-join', 'voice-leave',
	'soundboard-play', 'soundboard-stop', 'soundboard-volume'
];
 
function completeTerminalLine(line, { client, locales, voiceConnections, guildPlayers, loadSafeModule, getAllGuildRoles, validateRoleSelection, getLoreFilePath }) {
	const lastSep = line.lastIndexOf('&&');
	const currentSegment = lastSep === -1 ? line : line.slice(lastSep + 2);
	const [cmd, ...args] = currentSegment.trimStart().split(/\s+/);
	let partial = args.length ? args.at(-1) : cmd;
 
	const keys = (map) => [...map.keys()];
	const langs = () => Object.keys(locales);
	const guilds = () => keys(client.guilds.cache);
	const channels = (test) => [...client.guilds.cache.values()].flatMap(g => [...g.channels.cache.filter(test).keys()]);
	const names = (dir, ext) => {
		try { return fs.readdirSync(dir).filter(f => f.endsWith(ext)).map(f => f.slice(0, -ext.length)); }
		catch { return []; }
	};
	const lores = () => names(loresDir, '.js');
	const sounds = () => {
		fs.mkdirSync(soundsDir, { recursive: true });
		return names(soundsDir, SOUND_EXT);
	};
	const storedRoles = () => { try { return getAllGuildRoles(); } catch (err) { return {}; } };
 
	const slots = (...fns) => (a) => fns[a.length - 1]?.(a) ?? [];
 
	const completers = {
		__proto__: null,
		'echo': slots(() => ['-e', ...channels(c => c.isTextBased())]),
		'role-create': slots(guilds),
		'role-give': slots(
			guilds,
			() => [],
			([guild, user]) => {
				const g = client.guilds.cache.get(guild);
				const member = g?.members.cache.get(user);
				return (storedRoles()[guild] ?? []).filter(id => !member?.roles.cache.has(id));
			}
		),
		'role-take': slots(
			guilds,
			() => [],
			([guild, user]) => {
				const g = client.guilds.cache.get(guild);
				const member = g?.members.cache.get(user);
				return (storedRoles()[guild] ?? []).filter(id => member?.roles.cache.has(id));
			}
		),
		'role-add': slots(
			guilds,
			([guild]) => {
				const g = client.guilds.cache.get(guild);
				if (!g) return [];
				const selected = new Set(storedRoles()[guild] ?? []);
				return [...g.roles.cache.values()]
					.filter(r => !selected.has(r.id) && !validateRoleSelection(g, r))
					.sort((a, b) => b.position - a.position)
					.map(r => r.id);
			}
		),
		'role-remove': slots(
			() => Object.keys(storedRoles()),
			([guild]) => storedRoles()[guild] ?? []
		),
		'role-list': slots(() => Object.keys(storedRoles())),
		'lore': slots(
			() => [...lores().map(f => f.split('_')[0]), ...langs()],
			([guild]) => lores().filter(f => f.startsWith(`${guild}_`)).map(f => f.slice(guild.length + 1)),
		),
		'lore-list': slots(
			() => [...lores().map(f => f.split('_')[0]), ...langs()],
			([guildOrLang]) => {
				const isGuild = lores().some(f => f.startsWith(guildOrLang + '_'));
				if (isGuild) {
					return lores().filter(f => f.startsWith(`${guildOrLang}_`)).map(f => f.slice(guildOrLang.length + 1));
				}
				return [];
			}
		),
		'lore-create': slots(guilds, langs),
		'lore-remove': slots(
			() => [...new Set(lores().map(f => f.split('_')[0]))],
			([guild]) => lores().filter(f => f.startsWith(`${guild}_`)).map(f => f.slice(guild.length + 1)),
			([guild, lang]) => {
				const filePath = getLoreFilePath(guild, lang);
				if (!filePath) return [];
				const snippets = loadSafeModule(filePath, []);
				return Array.from({ length: snippets.length }, (_, i) => String(i + 1));
			}
		),
		'voice-join': slots(() => channels(c => c.isVoiceBased() && c.joinable)), // Only channels the bot can actually join.
		'voice-leave': slots(() => keys(voiceConnections)),
		'soundboard-play': (a) => {
			partial = a.slice(a.length > 1 && voiceConnections.has(a[0]) ? 1 : 0).join(' ');
			return a.length === 1 ? [...keys(voiceConnections), ...sounds()] : sounds();
		},
		'soundboard-stop': slots(() => keys(guildPlayers)),
		'soundboard-volume': slots(
			() => ['0', '25', '50', '75', '100', ...guilds()],
			([g]) => client.guilds.cache.has(g) ? ['0', '25', '50', '75', '100'] : []
		),
	};
 
	const candidates = args.length ? completers[cmd.toLowerCase()]?.(args) ?? [] : TERMINAL_COMMANDS.map(c => `${c} `); // Trailing space ready for arguments.
	const needle = partial.toLowerCase();
	return [[...new Set(candidates)].filter(c => c.toLowerCase().startsWith(needle)), partial];
}

// Terminal commands.
// Bot.
async function terminalHelp(subCmd, args, { colorize, consoleLog, getTimestamp }) {
	consoleLog(`${getTimestamp()} ${getHelpText(colorize)}`);
}

async function terminalStatus(subCmd, args, { client, isBotReady, botStartTime, formatUptime, colorize, consoleLog, getTimestamp }) {
	const uptimeFormatted = formatUptime(Date.now() - botStartTime);
	consoleLog(`${getTimestamp()} ${colorize('magenta', 'Status')}:\n- ${colorize('blue', 'Bot is Ready')}: ${isBotReady}\n- ${colorize('blue', 'Logged in as')}: ${client.user ? client.user.tag : 'Not yet'}\n- ${colorize('blue', 'Uptime')}: ${uptimeFormatted}\n- ${colorize('blue', 'Server Count')}: ${client.guilds.cache.size}`);
}

async function terminalPing(subCmd, args, { colorize, consoleLog, getTimestamp }) {
	consoleLog(`${getTimestamp()} ${colorize('cyan', 'Pinging...')}`);
	const host = '8.8.8.8';

	// Platform-specific arguments.
	let pingArgs;
	if (process.platform === 'win32') pingArgs = ['-n', '1', '-w', '3000', host];
	else if (process.platform === 'darwin') pingArgs = ['-c', '1', '-W', '3000', host];
	else pingArgs = ['-c', '1', '-W', '3', host];

	// Fallback when the ping binary is missing or not permitted.
	const tcpPing = () => new Promise((resolve, reject) => {
		const start = process.hrtime.bigint();
		const socket = net.connect({ host, port: 53, timeout: 3000 });
		socket.once('connect', () => {
			const ms = Number(process.hrtime.bigint() - start) / 1e6;
			socket.destroy();
			resolve(ms.toFixed(1));
		});
		socket.once('timeout', () => { socket.destroy(); reject(new Error('timeout')); });
		socket.once('error', (e) => { socket.destroy(); reject(e); });
	});

	const result = await new Promise((resolve) => {
		execFile('ping', pingArgs, { timeout: 8000, windowsHide: true, env: { ...process.env, LC_ALL: 'C' } }, (err, stdout) => {
			if (err) return resolve({ err });
			const match = String(stdout).match(/time\s*[=<]\s*([\d.,]+)\s*ms/i);
			resolve({ time: match ? match[1].replace(',', '.') : null });
		});
	});

	if (result.time) {
		consoleLog(`${getTimestamp()} ${colorize('green', `Pong! Network latency: ${result.time}ms`)}`);
	} else {
		try {
			const ms = await tcpPing();
			consoleLog(`${getTimestamp()} ${colorize('yellow', `Pong! Network latency: ${ms}ms (TCP fallback, ping unavailable)`)}`);
		} catch (err) {
			consoleLog(`${getTimestamp()} ${colorize('red', `Failed to reach ${host}.`)}`);
		}
	}
}

async function terminalClear() {
	console.clear();
}

async function terminalShutdown(subCmd, args, { shutdown, colorize, consoleLog, getTimestamp }) {
	consoleLog(`${getTimestamp()} ${colorize('cyan', 'Stopping bot via terminal command...')}`);
	shutdown(43); // Shutdown with waiting for changes.
	return true;
}

async function terminalStop(subCmd, args, { shutdown, colorize, consoleLog, getTimestamp }) {
	consoleLog(`${getTimestamp()} ${colorize('cyan', 'Completely ending process via stop command...')}`);
	shutdown(0); // Full bot and watcher shutdown.
	return true;
}

async function terminalRestart(subCmd, args, { restart, colorize, consoleLog, getTimestamp }) {
	consoleLog(`${getTimestamp()} ${colorize('cyan', 'Restarting bot via terminal command...')}`);
	restart(42); // Restart bot.
	return true;
}

async function terminalReboot(subCmd, args, { shutdown, colorize, consoleLog, getTimestamp }) {
	consoleLog(`${getTimestamp()} ${colorize('cyan', 'Rebooting bot and watcher script via terminal command...')}`);
	shutdown(44); // Full bot and watcher restart.
	return true;
}

async function terminalEcho(subCmd, args, { client, colorize, consoleLog, getTimestamp }) {
	if (args[1] === '-e') {
		// Edit Message: echo -e [CHANNEL_ID] [MESSAGE_ID] [EDITED_TEXT]
		const editChannelId = args[2];
		const messageId = args[3];
		const newText = restAfter(subCmd, 4).replace(/\\n/g, '\n');
		if (!editChannelId || !messageId || !newText) {
			consoleLog(`${getTimestamp()} ${colorize('yellow', 'Error')}: ${colorize('yellow', 'Please provide a channel ID, a message ID and new text.')}`);
			return;
		}

		let targetChannel = null;
		for (const [, guild] of client.guilds.cache) {
			const channel = guild.channels.cache.get(editChannelId);
			if (channel) { targetChannel = channel; break; }
		}

		if (!targetChannel || !targetChannel.isTextBased()) {
			consoleLog(`${getTimestamp()} ${colorize('yellow', 'Error')}: ${colorize('yellow', `Could not find text channel with ID '${editChannelId}'.`)}`);
			return;
		}

		let targetMessage = null;
		try { targetMessage = await targetChannel.messages.fetch(messageId); } catch (err) {}
		if (!targetMessage) {
			consoleLog(`${getTimestamp()} ${colorize('yellow', 'Error')}: ${colorize('yellow', `Could not find message with ID '${messageId}' in #${targetChannel.name}.`)}`);
			return;
		}

		await targetMessage.edit(newText);
		consoleLog(`${getTimestamp()} ${colorize('green', `Message successfully edited in channel #${targetChannel.name}.`)}`);
	} else {
		// Send Message: echo [CHANNEL_ID] [MESSAGE]
		const channelId = args[1];
		const messageText = restAfter(subCmd, 2).replace(/\\n/g, '\n');
		if (!channelId || !messageText) {
			consoleLog(`${getTimestamp()} ${colorize('yellow', 'Error')}: ${colorize('yellow', 'Please provide a channel ID and a message.')}`);
			return;
		}
		let targetEchoChannel = null;
		for (const [, guild] of client.guilds.cache) {
			const channel = guild.channels.cache.get(channelId);
			if (channel) { targetEchoChannel = channel; break; }
		}
		if (!targetEchoChannel || !targetEchoChannel.isTextBased()) {
			consoleLog(`${getTimestamp()} ${colorize('yellow', 'Error')}: ${colorize('yellow', `Could not find text channel with ID '${channelId}'.`)}`);
			return;
		}
		await targetEchoChannel.send(messageText);
		consoleLog(`${getTimestamp()} ${colorize('green', `Message successfully sent to channel #${targetEchoChannel.name}.`)}`);
	}
}

async function terminalInfo(subCmd, args, { locales, defaultLang, packageJson, colorize, consoleLog, getTimestamp }) {
	const infoText = locales[defaultLang]?.infoText || locales['uk']?.infoText || 'Info text unavailable';
	consoleLog(`${getTimestamp()} ${colorize('magenta', 'Bot Info')}:\n${colorize('blue', `Narrator | ${packageJson.version}`)}\n\n${infoText}`);
}

async function terminalRoleCreate(subCmd, args, { client, createSelectedRole, colorize, consoleLog, getTimestamp }) {
	// Usage: role-create [GUILD_ID] [ROLE_NAME]
	const guildId = args[1];
	const roleName = stripControl(restAfter(subCmd, 2)).trim();
	if (!guildId || !SNOWFLAKE_REGEX.test(guildId) || !roleName) {
		consoleLog(`${getTimestamp()} ${colorize('yellow', 'Error')}: ${colorize('yellow', 'Usage')} -> role-create [GUILD_ID] [ROLE_NAME]`);
		return;
	}

	const guild = client.guilds.cache.get(guildId);
	if (!guild) {
		consoleLog(`${getTimestamp()} ${colorize('yellow', 'Error')}: ${colorize('yellow', `Guild '${guildId}' not found.`)}`);
		return;
	}

	try {
		const result = await createSelectedRole(guild, { name: roleName, reason: 'Created via terminal.' });
		if (result.status !== 'created') {
			consoleLog(`${getTimestamp()} ${colorize('red', 'Error')}: ${colorize('red', `${ROLE_CREATE_ERRORS[result.status] ?? `Could not create role (${result.status}).`}`)}`);
			return;
		}
		consoleLog(`${getTimestamp()} ${colorize('green', 'Success')}: ${colorize('green', `Created selected role '${stripControl(result.role.name)}' (${result.role.id}) in guild '${guildId}' via terminal.`)}`);
	} catch (err) {
		consoleLog(`${getTimestamp()} ${colorize('red', 'Error creating role')}: `, err);
	}
}

async function terminalRoleGive(subCmd, args, { client, giveGuildRole, colorize, consoleLog, getTimestamp }) {
	// Usage: role-give [GUILD_ID] [USER_ID] [ROLE_ID]
	const [, guildId, userId, roleId] = args;
	if (args.length !== 4 || !SNOWFLAKE_REGEX.test(guildId) || !SNOWFLAKE_REGEX.test(userId) || !SNOWFLAKE_REGEX.test(roleId)) {
		consoleLog(`${getTimestamp()} ${colorize('yellow', 'Error')}: ${colorize('yellow', 'Usage')} -> role-give [GUILD_ID] [USER_ID] [ROLE_ID]`);
		return;
	}

	const guild = client.guilds.cache.get(guildId);
	if (!guild) {
		consoleLog(`${getTimestamp()} ${colorize('yellow', 'Error')}: ${colorize('yellow', `Guild '${guildId}' not found.`)}`);
		return;
	}

	try {
		const member = await guild.members.fetch(userId).catch(() => null);
		const role = guild.roles.cache.get(roleId);
		const status = await giveGuildRole(guild, member, role, null, 'Given via terminal.');

		if (status !== 'given') {
			consoleLog(`${getTimestamp()} ${colorize('red', 'Error')}: ${colorize('red', `${ROLE_GIVE_ERRORS[status] ?? `Could not give role (${status}).`}`)}`);
			return;
		}
		consoleLog(`${getTimestamp()} ${colorize('green', 'Success')}: ${colorize('green', `Gave role '${stripControl(role.name)}' (${roleId}) to '${stripControl(member.user.tag)}' (${userId}) in guild '${guildId}' via terminal.`)}`);
	} catch (err) {
		consoleLog(`${getTimestamp()} ${colorize('red', 'Error giving role')}: `, err);
	}
}

async function terminalRoleTake(subCmd, args, { client, takeGuildRole, colorize, consoleLog, getTimestamp }) {
	// Usage: role-take [GUILD_ID] [USER_ID] [ROLE_ID]
	const [, guildId, userId, roleId] = args;
	if (args.length !== 4 || !SNOWFLAKE_REGEX.test(guildId) || !SNOWFLAKE_REGEX.test(userId) || !SNOWFLAKE_REGEX.test(roleId)) {
		consoleLog(`${getTimestamp()} ${colorize('yellow', 'Error')}: ${colorize('yellow', 'Usage')} -> role-take [GUILD_ID] [USER_ID] [ROLE_ID]`);
		return;
	}

	const guild = client.guilds.cache.get(guildId);
	if (!guild) {
		consoleLog(`${getTimestamp()} ${colorize('yellow', 'Error')}: ${colorize('yellow', `Guild '${guildId}' not found.`)}`);
		return;
	}

	try {
		const member = await guild.members.fetch(userId).catch(() => null);
		const role = guild.roles.cache.get(roleId);
		const status = await takeGuildRole(guild, member, role, null, 'Taken via terminal.');

		if (status !== 'taken') {
			consoleLog(`${getTimestamp()} ${colorize('red', 'Error')}: ${colorize('red', `${ROLE_TAKE_ERRORS[status] ?? `Could not take role (${status}).`}`)}`);
			return;
		}
		consoleLog(`${getTimestamp()} ${colorize('green', 'Success')}: ${colorize('green', `Took role '${stripControl(role.name)}' (${roleId}) from '${stripControl(member.user.tag)}' (${userId}) in guild '${guildId}' via terminal.`)}`);
	} catch (err) {
		consoleLog(`${getTimestamp()} ${colorize('red', 'Error taking role')}: `, err);
	}
}

async function terminalRoleAdd(subCmd, args, { client, validateRoleSelection, addGuildRole, getRolesMaxPerGuild, colorize, consoleLog, getTimestamp }) {
	// Usage: role-add [GUILD_ID] [ROLE_ID]
	const [, guildId, roleId] = args;
	if (args.length !== 3 || !SNOWFLAKE_REGEX.test(guildId) || !SNOWFLAKE_REGEX.test(roleId)) {
		consoleLog(`${getTimestamp()} ${colorize('yellow', 'Error')}: ${colorize('yellow', 'Usage')} -> role-add [GUILD_ID] [ROLE_ID]`);
		return;
	}

	const guild = client.guilds.cache.get(guildId);
	if (!guild) {
		consoleLog(`${getTimestamp()} ${colorize('yellow', 'Error')}: ${colorize('yellow', `Guild '${guildId}' not found.`)}`);
		return;
	}

	const role = guild.roles.cache.get(roleId);
	const problem = validateRoleSelection(guild, role);
	if (problem) {
		consoleLog(`${getTimestamp()} ${colorize('red', 'Error')}: ${colorize('red', `${ROLE_ERRORS[problem]}`)}`);
		return;
	}

	try {
		const result = addGuildRole(guildId, roleId);
		if (result === 'exists') consoleLog(`${getTimestamp()} ${colorize('cyan', `Role '${roleId}' is already selected in guild '${guildId}'.`)}`);
		else if (result === 'limit') consoleLog(`${getTimestamp()} ${colorize('yellow', 'Error')}: ${colorize('yellow', `Limit of ${getRolesMaxPerGuild()} roles per guild reached.`)}`);
		else consoleLog(`${getTimestamp()} ${colorize('green', 'Success')}: ${colorize('green', `Selected role '${stripControl(role.name)}' (${roleId}) in guild '${guildId}' via terminal.`)}`);
	} catch (err) {
		consoleLog(`${getTimestamp()} ${colorize('red', 'Error writing roles file')}: `, err);
	}
}

async function terminalRoleRemove(subCmd, args, { removeGuildRole, colorize, consoleLog, getTimestamp }) {
	// Usage: role-remove [GUILD_ID] [ROLE_ID]
	const [, guildId, roleId] = args;
	if (args.length !== 3 || !SNOWFLAKE_REGEX.test(guildId) || !SNOWFLAKE_REGEX.test(roleId)) {
		consoleLog(`${getTimestamp()} ${colorize('yellow', 'Error')}: ${colorize('yellow', 'Usage')} -> role-remove [GUILD_ID] [ROLE_ID]`);
		return;
	}

	try {
		const result = removeGuildRole(guildId, roleId);
		if (result === 'missing') consoleLog(`${getTimestamp()} ${colorize('yellow', 'Error')}: ${colorize('yellow', `Role '${roleId}' is not selected in guild '${guildId}'.`)}`);
		else consoleLog(`${getTimestamp()} ${colorize('green', 'Success')}: ${colorize('green', `Unselected role '${roleId}' in guild '${guildId}' via terminal.`)}`);
	} catch (err) {
		consoleLog(`${getTimestamp()} ${colorize('red', 'Error writing roles file')}: `, err);
	}
}

async function terminalRoleList(subCmd, args, { client, getAllGuildRoles, colorize, consoleLog, getTimestamp }) {
	// Global: role-list
	// Specific Guild: role-list [GUILD_ID]
	const guildId = args[1];
	if (args.length > 2 || (guildId && !SNOWFLAKE_REGEX.test(guildId))) {
		consoleLog(`${getTimestamp()} ${colorize('yellow', 'Error')}: ${colorize('yellow', 'Usage')} -> role-list [GUILD_ID]`);
		return;
	}

	let all;
	try {
		all = getAllGuildRoles();
	} catch (err) {
		consoleLog(`${getTimestamp()} ${colorize('red', 'Error reading roles file')}: `, err);
		return;
	}

	let hasEntries = false;
	consoleLog(`${getTimestamp()} ${colorize('magenta', 'Selected roles')}:`);
	for (const gId of (guildId ? [guildId] : Object.keys(all))) {
		const ids = all[gId] ?? [];
		if (ids.length === 0) continue;
		hasEntries = true;
		const guild = client.guilds.cache.get(gId);
		consoleLog(`\n--- Guild: '${gId}'${guild ? ` (${stripControl(guild.name)})` : ''} ---`);
		for (const id of ids) {
			const role = guild?.roles.cache.get(id);
			consoleLog(`	${id}: ${role ? stripControl(role.name) : `${colorize('gray', '(unknown or deleted)')}`}`);
		}
	}
	if (!hasEntries) consoleLog(`${getTimestamp()} ${colorize('cyan', 'No roles selected')}.`);
}

async function terminalLore(subCmd, args, { locales, defaultLang, loadSafeModule, colorize, consoleLog, getTimestamp }) {
	const allLoreFiles = getLoreFiles();

	if (!fs.existsSync(loresDir)) {
		consoleLog(`${getTimestamp()} ${colorize('yellow', 'Error')}: ${colorize('yellow', `'${loresDir}' directory not found.`)}`);
		return;
	}

	if (allLoreFiles.length === 0) {
		consoleLog(`${getTimestamp()} No guild lore files found in '${loresDir}'.`);
		return;
	}

	let targetFile = null;
	let rawSnippets = [];

	let requestedGuildId = null;
	let requestedLang = null;

	if (args[1]) {
		const isKnownGuild = allLoreFiles.some(file => file.startsWith(args[1] + '_'));

		if (isKnownGuild) {
			// Specific Guild: lore [GUILD_ID]
			requestedGuildId = args[1];
			if (args[2]) {
				// Specific Guild with Language: lore [GUILD_ID] [LANGUAGE]
				requestedLang = args[2];
			}
		} else {
			// Specific Language: lore [LANGUAGE]
			requestedLang = args[1];
		}
		// Random: lore
	}

	if (requestedLang && !LANG_CODE_REGEX.test(requestedLang)) {
		consoleLog(`${getTimestamp()} ${colorize('yellow', 'Error')}: ${colorize('yellow', `Invalid language code '${requestedLang}'.`)}`);
		return;
	}

	if (requestedGuildId) {
		const languagesToTry = [];
		if (requestedLang) languagesToTry.push(requestedLang);
		if (defaultLang && !languagesToTry.includes(defaultLang)) languagesToTry.push(defaultLang);

		// Try specific languages first.
		for (const lang of languagesToTry) {
			const filePath = `${loresDir}/${requestedGuildId}_${lang}.js`;
			const snippets = loadSafeModule(filePath, []);
			if (snippets.length > 0) {
				rawSnippets = snippets;
				targetFile = `${requestedGuildId}_${lang}.js`;
				break;
			}
		}

		// If requested/default failed for this guild, fallback to any available language file for this guild.
		if (rawSnippets.length === 0) {
			const guildFiles = allLoreFiles.filter(file => file.startsWith(`${requestedGuildId}_`));
			for (const file of guildFiles) {
				const snippets = loadSafeModule(`${loresDir}/${file}`, []);
				if (snippets.length > 0) {
					rawSnippets = snippets;
					targetFile = file;
					break;
				}
			}
		}

		if (rawSnippets.length === 0) {
			consoleLog(`${getTimestamp()} ${colorize('yellow', 'Error')}: ${colorize('yellow', `No non-empty lore files found for guild ID '${requestedGuildId}'.`)}`);
			return;
		}
	} else {
		const uniqueGuilds = [...new Set(allLoreFiles.map(file => file.split('_')[0]))];
		let availableGuilds = [...uniqueGuilds];

		while (availableGuilds.length > 0) {
			const randomGuildIndex = Math.floor(Math.random() * availableGuilds.length);
			const candidateGuildId = availableGuilds[randomGuildIndex];

			const languagesToTry = [];
			if (requestedLang) languagesToTry.push(requestedLang);
			if (defaultLang && !languagesToTry.includes(defaultLang)) languagesToTry.push(defaultLang);

			let foundForGuild = false;

			// Try requested/default languages for this candidate guild.
			for (const lang of languagesToTry) {
				const filePath = `${loresDir}/${candidateGuildId}_${lang}.js`;
				const snippets = loadSafeModule(filePath, []);
				if (snippets.length > 0) {
					rawSnippets = snippets;
					targetFile = `${candidateGuildId}_${lang}.js`;
					foundForGuild = true;
					break;
				}
			}

			if (foundForGuild) break;

			// Fallback to any other language file for this candidate guild.
			const guildFiles = allLoreFiles.filter(file => file.startsWith(`${candidateGuildId}_`));
			for (const file of guildFiles) {
				const snippets = loadSafeModule(`${loresDir}/${file}`, []);
				if (snippets.length > 0) {
					rawSnippets = snippets;
					targetFile = file;
					foundForGuild = true;
					break;
				}
			}

			if (foundForGuild) break;

			// If no valid snippets anywhere for this guild, drop it and try another.
			availableGuilds.splice(randomGuildIndex, 1);
		}

		if (rawSnippets.length === 0) {
			consoleLog(`${getTimestamp()} ${colorize('yellow', 'Error')}: ${colorize('yellow', `All lore files across all guilds in '${loresDir}' are empty.`)}`);
			return;
		}
	}

	// Pick a random snippet from the chosen file.
	const randomSnippetIndex = Math.floor(Math.random() * rawSnippets.length);
	const selectedSnippet = String(rawSnippets[randomSnippetIndex]);

	// Determine template language with fallback.
	const templateLang = requestedLang || defaultLang;
	const loreTemplate = colorize('blue',`${locales[templateLang]?.replyLore || locales[defaultLang]?.replyLore || locales['uk']?.replyLore || 'Lore: {loreSnippet}'}`);

	consoleLog(`${getTimestamp()} ${colorize('magenta', `[File: '${targetFile}']`)} ${loreTemplate.replace(/\{loreSnippet\}/g, () => selectedSnippet)}`);
}

async function terminalLoreList(subCmd, args, { loadSafeModule, colorize, consoleLog, getTimestamp }) {
	const allLoreFiles = getLoreFiles();

	if (!fs.existsSync(loresDir)) {
		consoleLog(`${getTimestamp()} ${colorize('yellow', 'Error')}: ${colorize('yellow', `'${loresDir}' directory not found.`)}`);
		return;
	}

	if (allLoreFiles.length === 0) {
		consoleLog(`${getTimestamp()} ${colorize('cyan', 'No lore files found')}`);
		return;
	}

	let targetGuildId = args[1];
	let targetLang = args[2];

	let selectedFiles = [];

	if (!targetGuildId) {
		// Show all lores: lore-list
		selectedFiles = allLoreFiles;
	} else {
		const isGuild = allLoreFiles.some(f => f.startsWith(targetGuildId + '_'));
		if (!isGuild) {
			// Specific language: lore-list [LANGUAGE]
			targetLang = targetGuildId;
			targetGuildId = null;
			selectedFiles = allLoreFiles.filter(f => f.endsWith(`_${targetLang}.js`));
		} else if (targetLang) {
			// Specific guild and language: lore-list [GUILD_ID] [LANGUAGE]
			selectedFiles = [`${targetGuildId}_${targetLang}.js`];
		} else {
			// Specific guild: lore-list [GUILD_ID]
			selectedFiles = allLoreFiles.filter(f => f.startsWith(`${targetGuildId}_`));
		}
	}

	if (targetLang && !LANG_CODE_REGEX.test(targetLang)) {
		consoleLog(`${getTimestamp()} ${colorize('yellow', 'Error')}: ${colorize('yellow', `Invalid language code '${targetLang}'.`)}`);
		return;
	}

	if (selectedFiles.length === 0) {
		consoleLog(`${getTimestamp()} ${colorize('cyan', 'No lore files matched the criteria.')}`);
		return;
	}

	let hasEntries = false;
	consoleLog(`${getTimestamp()} ${colorize('magenta', 'Lore Listing')}:`);
	for (const file of selectedFiles) {
		const filePath = path.join(loresDir, file);
		if (!fs.existsSync(filePath)) continue;
		const snippets = loadSafeModule(filePath, []);
		if (snippets.length > 0) {
			hasEntries = true;
			consoleLog(`\n--- File: '${file}' ---`);
			snippets.forEach((s, idx) => consoleLog(`	${idx + 1}: ${String(s)}`));
		}
	}

	if (!hasEntries) {
		consoleLog(`${getTimestamp()} ${colorize('yellow', 'Error')}: ${colorize('yellow', 'No lores found.')}`);
	}
}

async function terminalLoreCreate(subCmd, args, { removeDuplicateLoreInFiles, readLoreFileStrict, writeLoreFile, exceedsLoreLimit, getLoreFilePath, getLoreMaxBytes, colorize, consoleLog, getTimestamp }) {
	// Usage: lore-create [GUILD_ID] [LANGUAGE] [LORE_SNIPPET]
	const guildIdArg = args[1];
	const langArg = args[2];
	const snippetText = restAfter(subCmd, 3);

	if (!guildIdArg || !langArg || !snippetText) {
		consoleLog(`${getTimestamp()} ${colorize('yellow', 'Error')}: ${colorize('yellow', 'Usage')} -> lore-create [GUILD_ID] [LANGUAGE] [LORE_SNIPPET]`);
		return;
	}

	if (!fs.existsSync(loresDir)) {
		fs.mkdirSync(loresDir, { recursive: true });
	}

	const filePath = getLoreFilePath(guildIdArg, langArg);
	if (!filePath) {
		consoleLog(`${getTimestamp()} ${colorize('yellow', 'Error')}: ${colorize('yellow', 'Invalid guild ID or language code.')}`);
		return;
	}

	try {
		const existingSnippets = readLoreFileStrict(filePath);
		existingSnippets.push(snippetText);

		if (exceedsLoreLimit(existingSnippets)) {
			consoleLog(`${getTimestamp()} ${colorize('yellow', 'Error')}: ${colorize('yellow', `Lore file would exceed the ${getLoreMaxBytes()} Bytes limit. Snippet not added.`)}`);
			return;
		}

		writeLoreFile(filePath, existingSnippets);
		removeDuplicateLoreInFiles(loresDir, filePath);
		consoleLog(`${getTimestamp()} ${colorize('green', 'Success')}: ${colorize('green', `Added snippet to '${filePath}'`)}`);
	} catch (err) {
		consoleLog(`${getTimestamp()} $colorize('red', 'Error writing lore file')}: `, err);
	}
}

async function terminalLoreRemove(subCmd, args, { removeDuplicateLoreInFiles, readLoreFileStrict, writeLoreFile, getLoreFilePath, colorize, consoleLog, getTimestamp }) {
	// Usage: lore-remove [GUILD_ID] [LANGUAGE] [SNIPPET_NUMBER]
	const removeGuildId = args[1];
	const removeLang = args[2];
	const removeIndex = parseInt(args[3], 10);

	if (!removeGuildId || !removeLang || isNaN(removeIndex)) {
		consoleLog(`${getTimestamp()} ${colorize('yellow', 'Error')}: ${colorize('yellow', 'Usage')} -> lore-remove [GUILD_ID] [LANGUAGE] [SNIPPET_NUMBER]`);
		return;
	}

	if (!fs.existsSync(loresDir)) {
		consoleLog(`${getTimestamp()} ${colorize('yellow', 'Error')}: ${colorize('yellow', `'${loresDir}' directory not found.`)}`);
		return;
	}

	const filePath = getLoreFilePath(removeGuildId, removeLang);
	if (!filePath) {
		consoleLog(`${getTimestamp()} ${colorize('yellow', 'Error')}: ${colorize('yellow', 'Invalid guild ID or language code.')}`);
		return;
	}
	if (!fs.existsSync(filePath)) {
		consoleLog(`${getTimestamp()} ${colorize('yellow', 'Error')}: ${colorize('yellow', `Lore file for guild ID '${removeGuildId}' and language '${removeLang}' not found.`)}`);
		return;
	}

	const snippets = readLoreFileStrict(filePath);

	if (removeIndex > 0 && removeIndex <= snippets.length) {
		snippets.splice(removeIndex - 1, 1);
		writeLoreFile(filePath, snippets);
		removeDuplicateLoreInFiles(loresDir, filePath);

		consoleLog(`${getTimestamp()} ${colorize('green', 'Success')}: ${colorize('green', `Removed snippet #${removeIndex} from '${path.basename(filePath)}' via terminal.`)}`);
	} else {
		consoleLog(`${getTimestamp()} ${colorize('yellow', 'Error')}: ${colorize('yellow', `Snippet number #${removeIndex} not found in '${path.basename(filePath)}'.`)}`);
	}
}

async function terminalVoiceJoin(subCmd, args, context) {
	const { client, voiceConnections, guildPlayers, guildVolumes, saveVoiceState, joinVoice, getCurrentVolume, colorize, consoleLog, getTimestamp } = context;
	// Usage: voice-join [CHANNEL_ID]
	const targetChannelId = args[1];
	if (!targetChannelId) {
		consoleLog(`${getTimestamp()} ${colorize('yellow', 'Error')}: ${colorize('yellow', 'Please provide a voice channel ID.')}`);
		return;
	}
	let targetChannel = null;
	for (const [, guild] of client.guilds.cache) {
		const channel = guild.channels.cache.get(targetChannelId);
		if (channel) { targetChannel = channel; break; }
	}
	if (!targetChannel) {
		consoleLog(`${getTimestamp()} ${colorize('yellow', 'Error')}: ${colorize('yellow', 'Voice channel not found.')}`);
		return;
	}

	if (!targetChannel.isVoiceBased()) {
		consoleLog(`${getTimestamp()} ${colorize('yellow', 'Error')}: ${colorize('yellow', `Channel '${targetChannel.name}' is not a voice channel.`)}`);
		return;
	}

	try {
		await joinVoice(targetChannel, voiceConnections, guildPlayers);
	} catch (err) {
		consoleLog(`${getTimestamp()} ${colorize('yellow', 'Error')}: ${err.message}`);
		return;
	}
	saveVoiceState(voiceConnections, guildPlayers, guildVolumes, getCurrentVolume());

	consoleLog(`${getTimestamp()} ${colorize('green', `Successfully joined voice channel: '${targetChannel.name}'`)}`);
}

async function terminalVoiceLeave(subCmd, args, context) {
	const { voiceConnections, guildPlayers, guildVolumes, saveVoiceState, getCurrentVolume, colorize, consoleLog, getTimestamp } = context;
	const leaveGuildId = args[1];
	const leaveGuild = (gId) => {
		const conn = voiceConnections.get(gId);
		const entry = guildPlayers.get(gId);
		voiceConnections.delete(gId);
		guildPlayers.delete(gId);
		try { entry?.player.stop(true); } catch (err) {}
		try { conn?.destroy(); } catch (err) {}
	};

	if (!leaveGuildId) {
		// Global: voice-leave
		for (const gId of [...voiceConnections.keys()]) {
			leaveGuild(gId);
		}
		saveVoiceState(voiceConnections, guildPlayers, guildVolumes, getCurrentVolume());

		consoleLog(`${getTimestamp()} ${colorize('green', 'Left all voice channels.')}`);
		return;
	}

	// Specific Guild: voice-leave [GUILD_ID]
	if (!voiceConnections.has(leaveGuildId)) {
		consoleLog(`${getTimestamp()} ${colorize('yellow', 'Error')}: ${colorize('yellow', `Bot is not connected to a voice channel in guild ID '${leaveGuildId}'.`)}`);
		return;
	}
	leaveGuild(leaveGuildId);
	saveVoiceState(voiceConnections, guildPlayers, guildVolumes, getCurrentVolume());

	consoleLog(`${getTimestamp()} ${colorize(`Left voice channel for guild ID '${leaveGuildId}'.`)}`);
}

async function terminalSoundboardPlay(subCmd, args, context) {
	const { voiceConnections, guildPlayers, guildVolumes, saveVoiceState, getSoundFilePath, setupPlayerEvents, getCurrentVolume, colorize, consoleLog, getTimestamp } = context;
	let playGuildId = null, rawTargetSound = '';
	if (args[1] && voiceConnections.has(args[1])) {
		// Specific Guild: soundboard-play [GUILD_ID] [SOUND_NAME]
		playGuildId = args[1];
		rawTargetSound = restAfter(subCmd, 2);
	} else {
		// Global: soundboard-play [SOUND_NAME]
		rawTargetSound = restAfter(subCmd, 1);
	}
	fs.mkdirSync(soundsDir, { recursive: true });
	const soundPath = getSoundFilePath(rawTargetSound);
	if (!soundPath || !fs.existsSync(soundPath)) {
		consoleLog(`${getTimestamp()} ${colorize('yellow', 'Error')}: ${colorize('yellow', 'Sound file not found.')}`);
		return;
	}
	const targetSound = path.basename(soundPath, SOUND_EXT);

	const guildsToPlay = playGuildId ? [playGuildId] : Array.from(voiceConnections.keys());
	if (guildsToPlay.length === 0) {
		consoleLog(`${getTimestamp()} ${colorize('yellow', 'Error')}: ${colorize('yellow', 'Bot is not connected to any voice channels.')}`);
		return;
	}

	for (const gId of guildsToPlay) {
		const conn = voiceConnections.get(gId);
		if (!conn) continue;

		const previousEntry = guildPlayers.get(gId);
		guildPlayers.delete(gId);
		try { previousEntry?.player.stop(true); } catch (err) {}

		const player = createAudioPlayer();
		const resource = createAudioResource(soundPath, { inlineVolume: true });
		resource.volume.setVolume(guildVolumes.get(gId) ?? getCurrentVolume());

		guildPlayers.set(gId, {
			player,
			resource,
			soundName: targetSound,
			startTime: Date.now()
		});
		setupPlayerEvents(gId, player, voiceConnections, guildPlayers, guildVolumes, getCurrentVolume);
		
		const startPlayback = () => {
			conn.subscribe(player);
			player.play(resource);
		};
		if (conn.state.status === VoiceConnectionStatus.Ready) {
			startPlayback();
		} else {
			conn.once(VoiceConnectionStatus.Ready, startPlayback);
		}
	}
	saveVoiceState(voiceConnections, guildPlayers, guildVolumes, getCurrentVolume());

	consoleLog(`${getTimestamp()} ${colorize('green', `Played sound '${targetSound}'.`)}`);
}

async function terminalSoundboardStop(subCmd, args, context) {
	const { voiceConnections, guildPlayers, guildVolumes, saveVoiceState, getCurrentVolume, colorize, consoleLog, getTimestamp } = context;
	const stopGuildId = args[1];
	if (stopGuildId) {
		// Specific Guild: soundboard-stop [GUILD_ID]
		const entry = guildPlayers.get(stopGuildId);
		if (entry) {
			entry.player.stop();
			guildPlayers.delete(stopGuildId);
			saveVoiceState(voiceConnections, guildPlayers, guildVolumes, getCurrentVolume());

			consoleLog(`${getTimestamp()} ${colorize('green', `Stopped playback for guild ID '${stopGuildId}'.`)}`);
		} else {
			consoleLog(`${getTimestamp()} ${colorize('yellow', 'Error')}: ${colorize('yellow', `No active playback found for guild ID '${stopGuildId}'.`)}`);
		}
	} else {
		// Global: soundboard-stop
		for (const [, entry] of guildPlayers.entries()) {
			entry?.player?.stop();
		}
		guildPlayers.clear();
		saveVoiceState(voiceConnections, guildPlayers, guildVolumes, getCurrentVolume());

		consoleLog(`${getTimestamp()} ${colorize('green', 'Stopped playback on all guilds.')}`);
	}
}

async function terminalSoundboardVolume(subCmd, args, context) {
	const { voiceConnections, guildPlayers, guildVolumes, saveVoiceState, getCurrentVolume, colorize, consoleLog, getTimestamp } = context;
	if (args.length === 2) {
		// Global: soundboard-volume [VOLUME]
		const volumePercent = parseInt(args[1], 10);
		if (isNaN(volumePercent) || volumePercent < 0 || volumePercent > 100) {
			consoleLog(`${getTimestamp()} ${colorize('yellow', 'Error')}: ${colorize('yellow', 'Invalid volume level (0-100).')}`);
			return;
		}
		const volume = volumePercent / 100;
		context.currentVolume = volume;

		guildVolumes.clear();
		for (const entry of guildPlayers.values()) {
			try { entry?.resource?.volume?.setVolume(volume); } catch (err) {}
		}

		saveVoiceState(voiceConnections, guildPlayers, guildVolumes, getCurrentVolume());

		consoleLog(`${getTimestamp()} ${colorize('green', `Volume set to ${volumePercent}% on all guilds.`)}`);
	} else if (args.length >= 3) {
		// Specific Guild: soundboard-volume [GUILD_ID] [VOLUME]
		const guildId = args[1];
		const volumePercent = parseInt(args[2], 10);
		if (isNaN(volumePercent) || volumePercent < 0 || volumePercent > 100) {
			consoleLog(`${getTimestamp()} ${colorize('yellow', 'Error')}: ${colorize('yellow', 'Invalid volume level (0-100).')}`);
			return;
		}
		const volume = volumePercent / 100;
		guildVolumes.set(guildId, volume);

		const entry = guildPlayers.get(guildId);
		if (entry?.resource?.volume) {
			try { entry.resource.volume.setVolume(volume); } catch (err) {}
		}
		saveVoiceState(voiceConnections, guildPlayers, guildVolumes, getCurrentVolume());

		consoleLog(`${getTimestamp()} ${colorize('green', `Volume set to ${volumePercent}% for guild ID '${guildId}'.`)}`);
	} else {
		consoleLog(`${getTimestamp()} ${colorize('yellow', 'Error')}: ${colorize('yellow', 'Usage')} -> soundboard-volume [VOLUME] or soundboard-volume [GUILD_ID] [VOLUME]`);
	}
}

module.exports = { handleTerminalLine, completeTerminalLine };
