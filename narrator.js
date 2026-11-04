// Dependencies.
require('dotenv').config();
const path = require('path');
const readline = require('readline');
const { Client, GatewayIntentBits, REST, Routes, ActivityType } = require('discord.js');
const packageJson = require('./package.json');

// Import modularized commands and helpers.
const { getCommands, handleDiscordInteraction } = require('./commands/discord.js');
const { handleTerminalLine, completeTerminalLine  } = require('./commands/terminal.js');
const {
	loadSafeModule,	getCmdText: _getCmdText, getLocText: _getLocText, getLocalizedLoreSnippets: _getLocalizedLoreSnippets, removeDuplicateLoreInFiles, setupGlobalMessageSanitizer,
	consoleLog: _consoleLog, getTimestamp, formatUptime, makeLogMessage: _makeLogMessage, safeReply: _safeReply, writeLogToFile, writeCenteredLog, setLogReadline,
	isWhitelist: _isWhitelist, isWhitelistNot: _isWhitelistNot, isAuthorizedTesterNot: _isAuthorizedTesterNot, isAdminManageServer: _isAdminManageServer, isGuildNot: _isGuildNot, isVoiceNot: _isVoiceNot,
	saveVoiceState, restoreVoiceState, loadVolumes, readLoreFileStrict, writeLoreFile,
	getLoreFilePath, getSoundFilePath, joinVoice, setupPlayerEvents,
	shutdown: _shutdown, restart: _restart, loginWithRetry
} = require('./commands/helpers.js');

const localesDir = path.join(__dirname, 'locales');
const languages = ['en', 'uk'];

const locales = {};
for (const lang of languages) {
	const filePath = `${localesDir}/${lang}.js`;
	locales[lang] = loadSafeModule(filePath, {});
}

const defaultLang = 'en';

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
const isGuildNot = (interaction) => _isGuildNot(interaction, locales);
const isVoiceNot = (interaction) => _isVoiceNot(interaction, voiceConnections, locales);
const shutdown = () => _shutdown(client, voiceConnections, guildPlayers, rl, guildVolumes, currentVolume);
const restart = () => _restart(client, voiceConnections, guildPlayers, rl, __filename, guildVolumes, currentVolume);

process.on('unhandledRejection', err => {
	consoleLog(`[${getTimestamp()}] Unhandled promise rejection: `, err);
});

process.on('uncaughtException', err => {
	consoleLog(`[${getTimestamp()}] Uncaught exception: `, err);
	shutdown(1);
});

try { if (process.stdin.isTTY) process.stdin.setRawMode(false); } catch (err) {}
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

function parseIdList(value) {
	return value ? value.split(',').map(id => id.trim()).filter(Boolean) : [];
}

function parseChance(value, fallback) {
	const parsed = parseInt(value, 10);
	return Number.isNaN(parsed) ? fallback : Math.min(100, Math.max(0, parsed));
}

const CONFIG = {
	statusBot: process.env.STATUS,
	statusName: process.env.STATUS_NAME,
	statusType: process.env.STATUS_TYPE,
	statusUrl: process.env.STATUS_URL,
	
	kickChance: parseChance(process.env.KICK_CHANCE, 10),
	whitelist: parseIdList(process.env.WHITELIST),
	authorizedTesters: parseIdList(process.env.AUTHORIZED_TESTERS)
};

const commands = getCommands(CONFIG, getCmdText);

// Shared execution context package passed to command modules.
const executionContext = {
	client, get isBotReady() { return isBotReady; }, CONFIG, locales, defaultLang, packageJson,
	voiceConnections, guildVolumes, guildPlayers, botStartTime, 
	get currentVolume() { return currentVolume; }, set currentVolume(v) { currentVolume = v; },
	getCurrentVolume: () => currentVolume,
	getCmdText, getLocText, getLocalizedLoreSnippets, removeDuplicateLoreInFiles,
	consoleLog, getTimestamp, formatUptime, makeLogMessage, safeReply,
	isWhitelist, isWhitelistNot, isAuthorizedTesterNot, isAdminManageServer, isGuildNot, isVoiceNot,
	saveVoiceState, restoreVoiceState, readLoreFileStrict, writeLoreFile,
	getLoreFilePath, getSoundFilePath, joinVoice, setupPlayerEvents,
	shutdown, restart, rl, loadSafeModule
};

// Run this code after the client is ready.
client.once('clientReady', async () => {
	writeCenteredLog(`Start of the session`);
	
	consoleLog(`\nNarrator | ${packageJson.version}`);
	consoleLog(`Press 'Ctrl+C' to shut down bot.`);
	consoleLog(`Print "help" for commands.\n`);
	consoleLog(`[${getTimestamp()}] Logged in as ${client.user.tag}!`);
	
	// Status.
	try {
		consoleLog(`[${getTimestamp()}] Setting bot status up... `);
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
		consoleLog(`[${getTimestamp()}] Status set successfully!`);
	} catch (err) {
		consoleLog(`[${getTimestamp()}] Failed to set status: `, err);
	}
	
	// Register slash (/).
	const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
	try {
		consoleLog(`[${getTimestamp()}] Refreshing application (/) commands... `);
		await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
	} catch (err) {
		consoleLog(`[${getTimestamp()}] Failed to register commands: `, err);
	}

	try {
		await restoreVoiceState(client, voiceConnections, guildVolumes, guildPlayers, () => currentVolume);
	} catch (err) {
		consoleLog(`[${getTimestamp()}] Failed to restore voice state: `, err);
	}
	saveVoiceState(voiceConnections, guildPlayers, guildVolumes, currentVolume);

	consoleLog(`[${getTimestamp()}] Waiting for commands...\n`);
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
        consoleLog(`[${getTimestamp()}] Interaction handling error: `, err);
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

const restoreTTY = () => { try { if (process.stdin.isTTY) process.stdin.setRawMode(false); } catch (err) {} };
process.on('exit', restoreTTY);
process.on('SIGINT', () => shutdown());
process.on('SIGTERM', () => shutdown());
process.on('SIGUSR2', () => shutdown());

loginWithRetry(client);
