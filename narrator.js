// Dependencies.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { Client, GatewayIntentBits, REST, Routes, ActivityType, MessageFlags, TextChannel, DMChannel, ThreadChannel } = require('discord.js');
const packageJson = require('./package.json');

// Import modularized commands and helpers.
const { getCommands, handleDiscordInteraction } = require('./commands/discord.js');
const { handleTerminalLine } = require('./commands/terminal.js');
const {
	loadSafeModule,	getCmdText: _getCmdText, getLocText: _getLocText, getLocalizedLoreSnippets: _getLocalizedLoreSnippets,
	consoleLog: _consoleLog, getTimestamp, makeLogMessage: _makeLogMessage,
	isWhitelist: _isWhitelist, isWhitelistNot: _isWhitelistNot, isAuthorizedTester: _isAuthorizedTester, isGuildNot: _isGuildNot, isVoiceNot: _isVoiceNot,
	shutdown: _shutdown, restart: _restart, loginWithRetry, setupGlobalMessageSanitizer
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
const consoleLog = (...args) => _consoleLog(rl, ...args);
const getCmdText = (key) => _getCmdText(key, locales, defaultLang);
const getLocText = (interaction, key, vars) => _getLocText(interaction, key, vars, locales);
const getLocalizedLoreSnippets = (interaction) => _getLocalizedLoreSnippets(interaction, locales, defaultLang);
const makeLogMessage = (interaction) => _makeLogMessage(interaction, rl);
const isWhitelist = (interaction) => _isWhitelist(interaction, CONFIG, locales);
const isWhitelistNot = (interaction) => _isWhitelistNot(interaction, CONFIG, locales);
const isAuthorizedTester = (interaction) => _isAuthorizedTester(interaction, CONFIG, locales);
const isGuildNot = (interaction) => _isGuildNot(interaction, locales);
const isVoiceNot = (interaction) => _isVoiceNot(interaction, voiceConnections, locales);
const shutdown = () => _shutdown(client, voiceConnections, rl);
const restart = () => _restart(client, voiceConnections, rl, __filename);

process.on('unhandledRejection', error => {
	consoleLog(`[${getTimestamp()}] Unhandled promise rejection: `, error);
});

// Create a new client instance with necessary intents.
const client = new Client({
	intents: [
		GatewayIntentBits.Guilds,
		GatewayIntentBits.GuildMessages,
		GatewayIntentBits.MessageContent,
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
let currentAudioResource = null;
let currentVolume = 1.0;

const voiceConnections = new Map();
const guildVolumes = new Map();
const guildPlayers = new Map();

const rl = readline.createInterface({
	input: process.stdin,
	output: process.stdout,
	prompt: '> '
});

const CONFIG = {
	statusBot: process.env.STATUS,
	statusName: process.env.STATUS_NAME,
	statusType: process.env.STATUS_TYPE,
	statusUrl: process.env.STATUS_URL,
	
	kickChance: parseInt(process.env.KICK_CHANCE, 10) || 10,
	whitelist: process.env.WHITELIST ? process.env.WHITELIST.split(',') : [],
	authorizedTesters: process.env.AUTHORIZED_TESTERS ? process.env.AUTHORIZED_TESTERS.split(',') : []
}

const commands = getCommands(CONFIG, getCmdText);

// Shared execution context package passed to command modules.
const executionContext = {
	client, get isBotReady() { return isBotReady; }, CONFIG, locales, defaultLang, packageJson,
	voiceConnections, guildVolumes, guildPlayers, botStartTime, 
	get currentVolume() { return currentVolume; }, set currentVolume(v) { currentVolume = v; },
	getCmdText, getLocText, getLocalizedLoreSnippets, consoleLog, getTimestamp, 
	makeLogMessage, isWhitelist, isWhitelistNot, isGuildNot, isVoiceNot, shutdown, restart, rl, loadSafeModule
};

// Run this code after the client is ready.
client.once('clientReady', async () => {
	consoleLog(`\nNarrator | ${packageJson.version}`);
	consoleLog(`Press Ctrl+C to shut down bot.\nPrint "help" for commands.\n`);
	consoleLog(`[${getTimestamp()}] Logged in as ${client.user.tag}!`);
	
	// Status.
	try {
		consoleLog(`[${getTimestamp()}] Setting bot status up... `);
		const statusText = `${CONFIG.statusName} | ${packageJson.version}`;
		client.user.setPresence({
			activities: [{ name: statusText, type: ActivityType[CONFIG.statusType], url: CONFIG.statusUrl }],
			status: CONFIG.statusBot,
		});
	} catch (error) {
		consoleLog(error);
	}
	
	// Register slash (/).
	const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
	try {
		consoleLog(`[${getTimestamp()}] Refreshing application (/) commands... `);
		await rest.put(
			Routes.applicationCommands(client.user.id),
			{ body: commands },
		);
		consoleLog(`[${getTimestamp()}] Waiting for commands...\n`);
		isBotReady = true;
		if (!rl.closed) {
			rl.prompt();
		}
	} catch (error) {
		consoleLog(error);
	}
});

client.on('interactionCreate', async interaction => {
	await handleDiscordInteraction(interaction, executionContext);
});

// Terminal.
rl.on('line', async (line) => {
	await handleTerminalLine(line, executionContext);
});

// Shut down the bot.
if (process.stdin.isTTY) {
	process.stdin.setRawMode(true);
}
process.stdin.resume();
process.stdin.on('data', (key) => {
	// Ctrl+C.
	if (key.length === 1 && key[0] === 3) {
		process.emit('SIGINT');
	}
});

process.once('SIGINT', () => shutdown());
process.once('SIGTERM', () => shutdown());

loginWithRetry(client);
