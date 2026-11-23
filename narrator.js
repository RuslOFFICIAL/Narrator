// Import functions.
const {
	loadSafeModule, getCmdText: _getCmdText, getLocText: _getLocText, getLocalizedLoreSnippets: _getLocalizedLoreSnippets, removeDuplicateLoreInFiles, setupGlobalMessageSanitizer,
	consoleLog: _consoleLog, getTimestamp, formatUptime, makeLogMessage: _makeLogMessage, safeReply: _safeReply, writeLogToFile, writeCenteredLog, setLogReadline, setConfig,
	isWhitelist: _isWhitelist, isWhitelistNot: _isWhitelistNot, isAuthorizedTesterNot: _isAuthorizedTesterNot, isAdminManageServer: _isAdminManageServer, isRoleManagerNot: _isRoleManagerNot, isSelectedRoleNot: _isSelectedRoleNot, isGuildNot: _isGuildNot, isVoiceNot: _isVoiceNot,
	saveVoiceState, restoreVoiceState, loadVolumes,
	readLoreFileStrict, writeLoreFile, exceedsLoreLimit,
	getAllGuildRoles, getGuildRoles, addGuildRole, removeGuildRole, validateRoleSelection, createSelectedRole, giveGuildRole, takeGuildRole, colorize, roleColorEmoji,
	getRolesMaxPerGuild, getRolesMaxFileBytes,
	getLoreMaxBytes, getLoreFilePath, getSoundFilePath, joinVoice, setupPlayerEvents,
	shutdown: _shutdown, restart: _restart, loginWithRetry
} = require('./commands/helpers.js');

// Wrapper functions to keep context clean for "executionContext".
const consoleLog = (...args) => _consoleLog(undefined, ...args);
const getCmdText = (key) => _getCmdText(key, locales, defaultLang);
const getLocText = (interaction, key, vars) => _getLocText(interaction, key, vars, locales);
const getLocalizedLoreSnippets = (interaction) => _getLocalizedLoreSnippets(interaction, locales, defaultLang);
const makeLogMessage = (interaction) => _makeLogMessage(interaction, rl);
const safeReply = (interaction, replyOptions) => _safeReply(interaction, replyOptions);
const isWhitelist = (interaction) => _isWhitelist(interaction, CONFIG, locales);
const isWhitelistNot = (interaction) => _isWhitelistNot(interaction, CONFIG, locales);
const isAuthorizedTesterNot = (interaction) => _isAuthorizedTesterNot(interaction, CONFIG, locales);
const isAdminManageServer = (interaction) => _isAdminManageServer(interaction, locales);
const isRoleManagerNot = (interaction) => _isRoleManagerNot(interaction, CONFIG, locales);
const isSelectedRoleNot = (interaction) => _isSelectedRoleNot(interaction, locales);
const isGuildNot = (interaction) => _isGuildNot(interaction, locales);
const isVoiceNot = (interaction) => _isVoiceNot(interaction, voiceConnections, locales);
const shutdown = (exitCode = 0) => _shutdown(client, voiceConnections, guildPlayers, rl, guildVolumes, currentVolume, exitCode);
const restart = (exitCode = 42) => _restart(client, voiceConnections, guildPlayers, rl, __filename, guildVolumes, currentVolume, exitCode);

// Dependencies.
const fs = require('fs');
const path = require('path');
const envPath = path.join(__dirname, '.env');
let envFileMissing = false;
if (fs.existsSync(envPath)) {
	const result = require('dotenv').config({ path: envPath, quiet: true });
	if (result.error) {
		consoleLog(`${colorize('gray', '[Config]')} ${colorize('yellow', `Failed to parse "${path.basename(envPath)}" file (${result.error.message}). Using defaults.`)}`);
	}
} else {
	envFileMissing = true;
}

const readline = require('readline');
const { Client, GatewayIntentBits, REST, Routes, ActivityType } = require('discord.js');
const packageJson = require('./package.json');

// Import modularized commands and helpers.
const { getCommands, handleDiscordInteraction } = require('./commands/discord.js');
const { handleTerminalLine, completeTerminalLine } = require('./commands/terminal.js');

const localesDir = path.join(__dirname, 'locales');
const languages = ['en', 'uk'];

const locales = {};
for (const lang of languages) {
	const filePath = `${localesDir}/${lang}.js`;
	locales[lang] = loadSafeModule(filePath, {});
}

const defaultLang = 'en';

process.on('unhandledRejection', err => {
	consoleLog(`${getTimestamp()} ${colorize('red', 'Unhandled promise rejection')}: `, err);
});

process.on('uncaughtException', err => {
	consoleLog(`${getTimestamp()} ${colorize('red', 'Uncaught exception')}: `, err);
	try {
		shutdown(1);
	} catch (e) {
		process.exit(1);
	}
});

try { if (process.stdin.isTTY) process.stdin.setRawMode(false); } catch (err) { }
process.stdin.resume();

// Create a new client instance with necessary intents.
const client = new Client({
	intents: [
		GatewayIntentBits.Guilds,
		GatewayIntentBits.GuildVoiceStates
	],
	allowedMentions: {
		parse: [],
		repliedUser: false
	}
});

setupGlobalMessageSanitizer();

// Variables.
const botStartTime = Date.now();
let isBotReady = false;
let currentVolume = 1.0;

const voiceConnections = new Map();
const guildVolumes = new Map();
const guildPlayers = new Map();

const savedGlobalVolume = loadVolumes(guildVolumes);
if (savedGlobalVolume !== null) currentVolume = savedGlobalVolume;

const rl = readline.createInterface({
	input: process.stdin,
	output: process.stdout,
	terminal: true,
	completer: (line) => completeTerminalLine(line, executionContext)
});

setLogReadline(rl);

// ".env" file.
const parseEnv = (key, fallback, transform) => {
	const raw = process.env[key];
	if (raw === undefined || String(raw).trim() === '') return fallback;
	try {
		return transform ? transform(String(raw).trim()) : String(raw).trim();
	} catch {
		return fallback;
	}
};

const parseList = (v) => v.split(',').map(s => s.trim()).filter(Boolean);
const parseIntRange = (min, max) => (v) => {
	const n = parseInt(v, 10);
	if (Number.isNaN(n)) throw new Error('NaN');
	return Math.min(max, Math.max(min, n));
};

const CONFIG = {
	envFileMissing,
	discordToken: parseEnv('DISCORD_TOKEN', ''),

	statusBot: parseEnv('STATUS', 'online'),
	statusName: parseEnv('STATUS_NAME', 'Narrator'),
	statusType: parseEnv('STATUS_TYPE', 'Playing'),
	statusUrl: parseEnv('STATUS_URL', ''),

	kickChance: parseEnv('KICK_CHANCE', 10, parseIntRange(0, 100)),
	whitelist: parseEnv('WHITELIST', [], parseList),
	authorizedTesters: parseEnv('AUTHORIZED_TESTERS', [], parseList),

	logMaxFileBytes: parseEnv('LOG_MAX_SIZE_BYTES', 2 ** 25, parseIntRange(1024, 2 ** 30)),
	logRetentionDays: parseEnv('LOG_RETENTION_DAYS', 30, parseIntRange(1, 3650)),
	loreMaxFileBytes: parseEnv('LORE_MAX_SIZE_BYTES', 2 ** 20, parseIntRange(1024, 2 ** 28)),
	
	rolesMaxPerGuild: parseEnv('ROLES_MAX_PER_GUILD', 250, parseIntRange(1, 1000)),
	rolesMaxFileBytes: parseEnv('ROLES_MAX_FILE_BYTES', 2 ** 20, parseIntRange(1024, 2 ** 28))
};
setConfig(CONFIG);

const commands = getCommands(CONFIG, getCmdText);

// Shared execution context package passed to command modules.
const executionContext = {
	client, get isBotReady() { return isBotReady; }, CONFIG, locales, defaultLang, packageJson,
	voiceConnections, guildVolumes, guildPlayers, botStartTime,
	get currentVolume() { return currentVolume; }, set currentVolume(v) { currentVolume = v; },
	getCurrentVolume: () => currentVolume,
	getCmdText, getLocText, getLocalizedLoreSnippets, removeDuplicateLoreInFiles,
	consoleLog, getTimestamp, formatUptime, makeLogMessage, safeReply,
	isWhitelist, isWhitelistNot, isAuthorizedTesterNot, isAdminManageServer, isRoleManagerNot, isSelectedRoleNot, isGuildNot, isVoiceNot,
	saveVoiceState, restoreVoiceState,
	readLoreFileStrict, writeLoreFile, exceedsLoreLimit,
	getAllGuildRoles, getGuildRoles, addGuildRole, removeGuildRole, validateRoleSelection, createSelectedRole, giveGuildRole, takeGuildRole, colorize, roleColorEmoji,
	getRolesMaxPerGuild, getRolesMaxFileBytes,
	getLoreMaxBytes: () => CONFIG.loreMaxFileBytes, getLoreFilePath, getSoundFilePath, joinVoice, setupPlayerEvents,
	shutdown, restart, rl, loadSafeModule
};

// Run this code after the client is ready.
client.once('clientReady', async () => {
	writeCenteredLog('Start of the session');

	consoleLog(`\nNarrator | ${packageJson.version}`);
	consoleLog("Press 'Ctrl+C' to shut down bot.");
	consoleLog('Print "help" for commands.\n');
	
	consoleLog(`${getTimestamp()} ${colorize('green', `Logged in as ${client.user.tag}!`)}`);

	// Status.
	try {
		consoleLog(`${getTimestamp()} ${colorize('cyan', 'Setting bot status up...')}`);
		const statusText = `${CONFIG.statusName || 'Narrator'} | ${packageJson.version}`;

		const activityConfig = {
			name: statusText,
			type: ActivityType[CONFIG.statusType] ?? ActivityType.Playing
		};

		if (CONFIG.statusType === 'Streaming' && CONFIG.statusUrl && CONFIG.statusUrl.trim() !== '') {
			activityConfig.url = CONFIG.statusUrl;
		}

		await client.user.setPresence({
			activities: [activityConfig],
			status: CONFIG.statusBot,
		});
		consoleLog(`${getTimestamp()} ${colorize('green', 'Status set successfully!')}`);
	} catch (err) {
		consoleLog(`${getTimestamp()} ${colorize('red', 'Failed to set status')}: `, err);
	}

	// Register slash (/).
	const rest = new REST({ version: '10' }).setToken(CONFIG.discordToken);
	try {
		consoleLog(`${getTimestamp()} ${colorize('cyan', 'Refreshing application (/) commands...')}`);
		await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
	} catch (err) {
		consoleLog(`${getTimestamp()} ${colorize('red', 'Failed to register commands')}: `, err);
	}
	
	consoleLog();

	try {
		await restoreVoiceState(client, voiceConnections, guildVolumes, guildPlayers, () => currentVolume);
	} catch (err) {
		consoleLog(`${getTimestamp()} ${colorize('red', 'Failed to restore voice state')}: `, err);
	}
	saveVoiceState(voiceConnections, guildPlayers, guildVolumes, currentVolume);

	consoleLog(`\n${getTimestamp()} Waiting for commands...\n`);
	isBotReady = true;
	if (!rl.closed) {
		rl.prompt();
	}
});

client.on('interactionCreate', async interaction => {
	try {
		await handleDiscordInteraction(interaction, executionContext);
	} catch (err) {
		// Ignore "Unknown interaction" (10062) or "Interaction has already been acknowledged" (40060).
		if (err.code === 10062 || err.code === 40060) {
			return;
		}
		consoleLog(`${getTimestamp()} ${colorize('red', 'Interaction handling error')}: `, err);
	}
});

// Terminal.
rl.on('line', async (line) => {
	const trimmedLine = line.trim();
	if (trimmedLine) {
		writeLogToFile(`[User Input] ${trimmedLine}`);
		if (!rl.closed) {
			rl.prompt();
		}
	}

	await handleTerminalLine(line, executionContext);
});

// Shut down the bot.
process.stdin.on('data', (key) => {
	if (key.length === 1 && key[0] === 3) {
		process.emit('SIGINT');
	}
});

const restoreTTY = () => { try { if (process.stdin.isTTY) process.stdin.setRawMode(false); } catch (err) { } };
process.on('exit', restoreTTY);
process.on('SIGINT', () => shutdown());
process.on('SIGTERM', () => shutdown());
process.on('SIGUSR2', () => shutdown());

if (CONFIG.envFileMissing) {
	consoleLog(`${getTimestamp()} ${colorize('gray', `[Config]`)} ${colorize('yellow', `No "${path.basename(envPath)}" file found at '${envPath}'. Falling back to process environment and defaults.`)}`);
}

if (CONFIG.discordToken) {
	loginWithRetry(client, 1, CONFIG.discordToken);
} else {
	consoleLog(`${getTimestamp()} ${colorize('yellow', "No 'DISCORD_TOKEN' found. Skipping Discord login.")}`);
	if (!rl.closed) {
		rl.prompt();
	}
}
