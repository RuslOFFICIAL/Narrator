// Dependencies.
require('dotenv').config();
const fs = require('fs');
const readline = require('readline');
const { spawn, exec } = require('child_process');
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, ActivityType, InteractionContextType, ApplicationIntegrationType, MessageFlags, ChannelType } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, StreamType, VoiceConnectionStatus } = require('@discordjs/voice');
const packageJson = require('./package.json');

// Import modularized commands
const { getCommands, handleDiscordInteraction } = require('./commands/discord.js');
const { handleTerminalLine } = require('./commands/terminal.js');

// Localization.
function loadSafeModule(filePath, fallbackValue) {
    try {
        if (fs.existsSync(filePath)) {
            return require(filePath);
        }
    } catch (error) {
        console.log(`[Warning] Could not load file at ${filePath}:`, error.message);
    }
    return fallbackValue;
}

const locales = {
    en: loadSafeModule('./locales/en.js', {}),
    uk: loadSafeModule('./locales/uk.js', {})
};

const defaultLang = 'en'; 

function getCmdText(key) {
    return locales[defaultLang]?.[key] || locales['uk'][key] || key;
}

function getLocText(interaction, key, variables = {}) {
    const langCode = interaction.locale?.startsWith('en') ? 'en' : 'uk';
    let text = locales[langCode]?.[key] || locales['uk'][key] || key;
	
    for (const [varName, value] of Object.entries(variables)) {
        text = text.replace(new RegExp(`\\{${varName}\\}`, 'g'), value);
    }
    return text;
}

const rawSnippetsUk = loadSafeModule('./locales/uk-lore.js', []);
const rawSnippetsEn = loadSafeModule('./locales/en-lore.js', []);

function getLocalizedLoreSnippets(interaction) {
    const langCode = interaction.locale?.startsWith('en') ? 'en' : 'uk';
    const snippets = langCode === 'en' ? rawSnippetsEn : rawSnippetsUk;
    
    return snippets.map(snippet => 
        snippet
			// Variables for lore snippets.
            .replace('$loreLink$', CONFIG.loreLink)
            .replace('$loreLinkKey$', CONFIG.loreLinkKey)
    );
}

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
	]
});

// Variables.
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
	authorizedTesters: process.env.AUTHORIZED_TESTERS ? process.env.AUTHORIZED_TESTERS.split(',') : [],
	
	loreLink: process.env.LORE_LINK,
	loreLinkKey: process.env.LORE_LINK_KEY
}

const commands = getCommands(CONFIG, getCmdText);

// Functions.
function consoleLog(...args) {
	readline.clearLine(process.stdout, 0);
	readline.cursorTo(process.stdout, 0);
	console.log(...args);
	
	try {
		rl.prompt(true);
	} catch (err) {
		// Readline is closed, ignore or handle silently.
	}
}

function getTimestamp() {
	const now = new Date();
	
	const hours = String(now.getUTCHours()).padStart(2, '0');
	const minutes = String(now.getUTCMinutes()).padStart(2, '0');
	const seconds = String(now.getUTCSeconds()).padStart(2, '0');
	const timeStr = `${hours}:${minutes}:${seconds}`;
	
	const dateStr = String(now.getUTCDate()).padStart(2, '0') + '.' + 
		String(now.getUTCMonth() + 1).padStart(2, '0') + '.' + 
		now.getUTCFullYear();
	
	return `${timeStr} ${dateStr} UTC`;
}

function makeLogMessage(interaction) {
	const logMessage = `[${getTimestamp()}] [Command Used] '/${interaction.commandName}' was executed by @${interaction.user.tag} (${interaction.user.id})`;
	consoleLog(logMessage);
}

// Add "if (await isWhiteListIn(interaction)) return;", if is in whitelist, and "if (await isWhiteListNot(interaction)) return;", if is not in whitelist, at the beggining of command to make it for Authorized Testers. Comment it with "//" to disable the tester check.
async function isWhiteListIn(interaction) {
	if(CONFIG.whitelist.includes(interaction.user.id)) {
		const logMessage = `[${getTimestamp()}] [Whitelist Command Used] '/${interaction.commandName}' was executed by a whitelist user: @${interaction.user.tag} (${interaction.user.id})`;
		consoleLog(logMessage);

		await interaction.reply({
			content: getLocText(interaction, 'replyWhitelistYes'),
			flags: [MessageFlags.Ephemeral]
		});
		return true;
	}
	return false;
}

async function isWhiteListNot(interaction) {
	if(!CONFIG.whitelist.includes(interaction.user.id)) {
		const logMessage = `[${getTimestamp()}] [Whitelist Command Failed] '/${interaction.commandName}' was executed by not a whitelist user: @${interaction.user.tag} (${interaction.user.id})`;
		consoleLog(logMessage);

		await interaction.reply({
			content: getLocText(interaction, 'replyWhitelistNo'),
			flags: [MessageFlags.Ephemeral]
		});
		return true;
	}
	return false;
}

// Add "if (!(await isAuthorizedTester(interaction))) return;" at the beggining of command to make it for Authorized Testers. Comment it with "//" to disable the tester check.
async function isAuthorizedTester(interaction) {
	if(!CONFIG.authorizedTesters.includes(interaction.user.id)) {
		const logMessage = `[${getTimestamp()}] [Testing Command Used] '/${interaction.commandName}' was executed by not a tester: @${interaction.user.tag} (${interaction.user.id})`;
		consoleLog(logMessage);

		await interaction.reply({
			content: getLocText(interaction, 'replyAuthorizedTester'),
			flags: [MessageFlags.Ephemeral]
		});
		return false;
	}
	return true;
}

async function shutdown() {
	console.log(`\n[${getTimestamp()}] Shutting down the bot safely...`);
	
	try {
		rl.close();

		if (voiceConnections.size > 0) {
			try {
				console.log(`[${getTimestamp()}] Leaving voice channels...`);
				for (const [guildId, connection] of voiceConnections.entries()) {
					connection.destroy();
				}
				voiceConnections.clear();
				consoleLog(`[${getTimestamp()}] Successfully left all voice channels.`);
				
				await new Promise(resolve => setTimeout(resolve, 1000));
			} catch (error) {
				consoleLog(`[${getTimestamp()}] Failed to leave voice channels:`, error);
			}
		}
		
		if (client.ws) {
			client.ws.destroy();
		}
		
		await client.destroy();
	} catch (error) {
		console.log(error);
	} finally {
		console.log("Press 'Ctrl+C' or close the window to end process, or make changes in '.js' file.");
		process.exit(0);
	}
}

// Shared execution context package passed to command modules.
const executionContext = {
    client, get isBotReady() { return isBotReady; }, CONFIG, locales, defaultLang,
    rawSnippetsEn, rawSnippetsUk, voiceConnections, guildVolumes, guildPlayers, 
    get currentVolume() { return currentVolume; }, set currentVolume(v) { currentVolume = v; },
    getCmdText, getLocText, getLocalizedLoreSnippets, consoleLog, getTimestamp, 
    makeLogMessage, isWhiteListIn, isWhiteListNot, shutdown, rl
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
		rl.prompt();
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

// Login.
client.login(process.env.DISCORD_TOKEN);