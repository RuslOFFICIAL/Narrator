// Dependencies.
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const util = require('util');
const { MessageFlags, TextChannel, ThreadChannel, PermissionFlagsBits } = require('discord.js');
const { joinVoiceChannel, VoiceConnectionStatus, VoiceConnectionDisconnectReason, AudioPlayerStatus, createAudioPlayer, createAudioResource, StreamType, entersState } = require('@discordjs/voice');
const { spawn, execFile } = require('child_process');
const FFMPEG_PATH = (() => {
	try { return require('ffmpeg-static') || 'ffmpeg'; } catch (err) { return 'ffmpeg'; }
})();

const dataDir = path.join(__dirname, '../data');
const voiceStateFile = path.join(dataDir, 'voice-state.json');
const volumesFile = path.join(dataDir, 'volumes.json');
const rolesFile = path.join(dataDir, 'roles.js');
const logsDir = path.join(__dirname, '../logs');
const loresDir = path.join(__dirname, '../lores');
const soundsDir = path.join(__dirname, '../sounds');

const LORE_EXT = '.js';
const SOUND_EXT = '.mp3';
const FATAL_LOGIN_ERRORS = ['TokenInvalid', 'TokenMissing', 'DisallowedIntents'];
const GUILD_ID_REGEX = /^(\d{5,25}|default)$/;
const LANG_CODE_REGEX = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/;
const LOG_FILE_REGEX = /^(\d{4})-(\d{2})-(\d{2})(?:\.\d+)?\.log$/;
const TIMESTAMP_PREFIX_REGEX = /^\[\s?\d{2}:\d{2}:\d{2} \d{2}\.\d{2}\.\d{4} UTC\s?\]/;
const SNOWFLAKE_REGEX = /^\d{5,25}$/;
const REJOIN_DELAYS_MS = [5000, 10000, 20000, 40000, 60000];
const ROLE_FORBIDDEN_PERMISSIONS = [PermissionFlagsBits.Administrator, PermissionFlagsBits.ManageGuild, PermissionFlagsBits.ManageRoles];

const LOG_MAX_FILE_BYTES = 2 ** 25; // 32 MiB.
const LOG_RETENTION_DAYS = 30;
const LORE_MAX_FILE_BYTES = 2 ** 20; // 1 MiB.
const ROLES_MAX_PER_GUILD = 250;
const ROLES_MAX_FILE_BYTES = 2 ** 20; // 1 MiB.

const ANSI = {
	// Text styles.
	reset: '\x1b[0m',
	bold: '\x1b[1m',
	dim: '\x1b[2m',
	italic: '\x1b[3m',
	underline: '\x1b[4m',
	blink: '\x1b[5m',
	inverse: '\x1b[7m',
	hidden: '\x1b[8m',
	strikethrough: '\x1b[9m',
	
	// Selective off codes (keep other active styles).
	normalIntensity: '\x1b[22m', // Turns off 'bold' and 'dim'.
	noItalic: '\x1b[23m',
	noUnderline: '\x1b[24m',
	noInverse: '\x1b[27m',
	noStrikethrough: '\x1b[29m',
	
	// Standard 8 foreground colors (30-37).
	black: '\x1b[30m',
	red: '\x1b[31m',
	green: '\x1b[32m',
	yellow: '\x1b[33m',
	blue: '\x1b[34m',
	magenta: '\x1b[35m',
	cyan: '\x1b[36m',
	white: '\x1b[37m',
	
	// Bright/high-intensity 8 foreground colors (90-97).
	brightBlack: '\x1b[90m',
	gray: '\x1b[90m', // Alias for 'brightBlack'.
	brightRed: '\x1b[91m',
	brightGreen: '\x1b[92m',
	brightYellow: '\x1b[93m',
	brightBlue: '\x1b[94m',
	brightMagenta: '\x1b[95m',
	brightCyan: '\x1b[96m',
	brightWhite: '\x1b[97m',
	
	// Standard 8 background colors (40–47).
	bgBlack: '\x1b[40m',
	bgRed: '\x1b[41m',
	bgGreen: '\x1b[42m',
	bgYellow: '\x1b[43m',
	bgBlue: '\x1b[44m',
	bgMagenta: '\x1b[45m',
	bgCyan: '\x1b[46m',
	bgWhite: '\x1b[47m',
	
	// Bright/high-intensity 8 background colors (100–107).
	bgBrightBlack: '\x1b[100m',
	bgGray: '\x1b[100m', // Also 'bgBrightBlack'.
	bgBrightRed: '\x1b[101m',
	bgBrightGreen: '\x1b[102m',
	bgBrightYellow: '\x1b[103m',
	bgBrightBlue: '\x1b[104m',
	bgBrightMagenta: '\x1b[105m',
	bgBrightCyan: '\x1b[106m',
	bgBrightWhite: '\x1b[107m',
	
	// 256-colors.
	orange: '\x1b[38;5;208m',
};

const COLOR_EMOJIS = [
	{ emoji: '🔴', rgb: [221, 46, 68] },
	{ emoji: '🟠', rgb: [244, 144, 12] },
	{ emoji: '🟡', rgb: [253, 203, 88] },
	{ emoji: '🟢', rgb: [120, 177, 89] },
	{ emoji: '🔵', rgb: [85, 172, 238] },
	{ emoji: '🟣', rgb: [170, 142, 214] },
	{ emoji: '🟤', rgb: [193, 105, 79] },
	{ emoji: '⚫', rgb: [49, 55, 61] },
	{ emoji: '⚪', rgb: [230, 231, 232] }
];

const isIgnorableInteractionError = (err) => err?.code === 10062 || err?.code === 40060;
const resolveVolume = (v) => (typeof v === 'function' ? v() : v);
const rejoinTimers = new Map();

let rolesWarnedAt = 0;
let isExiting = false;
let defaultRl = null;
let logWriteWarned = false;
let logState = { date: null, part: 0, size: null };
let activeConfig = null;

function setConfig(config) {
	activeConfig = config;
}

const getLogMaxBytes = () => activeConfig?.logMaxFileBytes ?? LOG_MAX_FILE_BYTES;
const getLogRetentionDays = () => activeConfig?.logRetentionDays ?? LOG_RETENTION_DAYS;
const getLoreMaxBytes = () => activeConfig?.loreMaxFileBytes ?? LORE_MAX_FILE_BYTES;
const getRolesMaxPerGuild = () => activeConfig?.rolesMaxPerGuild ?? ROLES_MAX_PER_GUILD;
const getRolesMaxFileBytes = () => activeConfig?.rolesMaxFileBytes ?? ROLES_MAX_FILE_BYTES;

// Functions.
function loadSafeModule(filePath, fallbackValue) {
	if (!fs.existsSync(filePath)) return fallbackValue;
	try {
		const absolutePath = require.resolve(filePath);
		delete require.cache[absolutePath];
		const mod = require(absolutePath);
		return Array.isArray(mod) ? mod.map(s => String(s)) : mod;
	} catch (err) {
		consoleLog(`${getTimestamp()} ${colorize('gray', '[loadSafeModule]')} ${colorize('red', `Failed to load ${filePath}`)}: `, err);
		return fallbackValue;
	}
}

function getCmdText(key, locales, defaultLang = 'en') {
	return locales[defaultLang]?.[key] || locales['uk'][key] || key;
}

function getLocText(interaction, key, variables = {}, locales) {
	const langCode = interaction.locale?.startsWith('en') ? 'en' : 'uk';
	let text = locales[langCode]?.[key] || locales['uk'][key] || key;
	
	for (const [varName, value] of Object.entries(variables)) {
		text = text.replace(new RegExp(`\\{${varName}\\}`, 'g'), () => String(value));
	}
	return text;
}

function getLocalizedLoreSnippets(interaction, locales, defaultLang) {
	const guildId = interaction.guildId;
	const fullLocale = interaction.locale || defaultLang;
	const baseLocale = fullLocale.split('-')[0];
	const langs = [...new Set([fullLocale, baseLocale, defaultLang])].filter(l => LANG_CODE_REGEX.test(l));
	const candidates = langs.map(l => path.join(loresDir, `${guildId}_${l}${LORE_EXT}`));

	try {
		const others = fs.readdirSync(loresDir)
			.filter(f => f.startsWith(`${guildId}_`) && f.endsWith('.js'))
			.map(f => path.join(loresDir, f))
			.filter(p => !candidates.includes(p))
			.sort(() => Math.random() - 0.5);
		candidates.push(...others);
	} catch (err) {}

	for (const filePath of candidates) {
		const snippets = loadSafeModule(filePath, null);
		if (Array.isArray(snippets) && snippets.length > 0) return snippets;
	}
	return [getLocText(interaction, 'replyLoreSnippetsUnavailable', {}, locales)];
}

function removeDuplicateLoreInFiles(loresDir, onlyFilePath = null) {
	if (!fs.existsSync(loresDir)) {
		consoleLog(`${getTimestamp()} ${colorize('red', `Lores directory not found: '${loresDir}'`)}`);
		return { success: false, modifiedFilesCount: 0 };
	}
	
	const files = onlyFilePath
		? [path.basename(onlyFilePath)]
		: fs.readdirSync(loresDir).filter(file => file.endsWith(LORE_EXT));
	let modifiedFilesCount = 0;
	
	for (const file of files) {
		const filePath = path.join(loresDir, file);
		try {
			const snippets = loadSafeModule(filePath, []);
			if (!Array.isArray(snippets) || snippets.length === 0) continue;
			
			const uniqueSnippets = [...new Set(snippets)];
			
			if (uniqueSnippets.length !== snippets.length) {
				writeLoreFile(filePath, uniqueSnippets);				
				modifiedFilesCount++;
				consoleLog(`${getTimestamp()} ${colorize('gray', '[Lore Cleanup]')} Removed ${snippets.length - uniqueSnippets.length} duplicate(s) from file '${file}'.`);
			}
		} catch (err) {
			consoleLog(`${getTimestamp()} ${colorize('red', `Failed to process lore file '${file}'`)}: `, err);
		}
	}
	
	if (modifiedFilesCount > 0) {
		consoleLog(`${getTimestamp()} ${colorize('gray', '[Lore Cleanup]')} ${colorize('green', `Successfully cleaned duplicates across ${modifiedFilesCount} file(s).`)}`);
	}
	
	return { success: true, modifiedFilesCount };
}

function sanitizeMentions(options) {
	if (typeof options === 'string') {
		return options.replace(/@everyone/g, '@\u200beveryone').replace(/@here/g, '@\u200bhere');
	}
	if (options && typeof options === 'object') {
		if (typeof options.content === 'string') {
			options.content = options.content
				.replace(/@everyone/g, '@\u200beveryone')
				.replace(/@here/g, '@\u200bhere');
		}
		if (!options.allowedMentions) {
			options.allowedMentions = { parse: [] };
		} else if (options.allowedMentions.parse) {
			options.allowedMentions.parse = [];
		}
	}
	return options;
}

// Global prototype patch for text-based channels and threads.
function setupGlobalMessageSanitizer() {
	[TextChannel, ThreadChannel].forEach(channelClass => {
		const originalSend = channelClass.prototype.send;
		channelClass.prototype.send = async function (options) {
			return originalSend.call(this, sanitizeMentions(options));
		};
	});
}

async function safeReply(interaction, replyOptions) {
	try {
		if (interaction.replied || interaction.deferred) {
			await interaction.followUp(replyOptions);
		} else {
			await interaction.reply(replyOptions);
		}
	} catch (err) {
		// Ignore "Unknown interaction" (10062) or "Interaction has already been acknowledged" (40060).
		if (err.code === 10062 || err.code === 40060) {
			return;
		}
		throw err;
	}
}

function consoleLog(rl, ...args) {
	if (!rl || typeof rl.prompt !== 'function') {
		if (rl !== undefined) args = [rl, ...args];
		rl = defaultRl;
	}
	
	if (typeof args[0] === 'string' && args.length > 1) {
		args[0] = args[0].replace(/%/g, '%%');
	}
	
	if (process.stdout.isTTY) {
		readline.clearLine(process.stdout, 0);
		readline.cursorTo(process.stdout, 0);
	}
	const logString = util.format(...args);
	console.log(...args);
	writeLogToFile(logString, { raw: logString === '' });
	
	try {
		if (rl && typeof rl.prompt === 'function' && !rl.closed) {
			rl.prompt(true);
		}
	} catch (err) {
		// Readline is closed.
	}
}

function setLogReadline(rl) {
	defaultRl = rl;
}

async function handleCommandError(interaction, err, context) {
	if (isIgnorableInteractionError(err)) return;
	consoleLog(`${getTimestamp()} ${colorize('red', `Failed to execute command [/${interaction.commandName}]`)} : `, err);
	await safeReply(interaction, { content: context.getLocText(interaction, 'replyCommandError', { commandName: `/${interaction.commandName}` }), flags: [MessageFlags.Ephemeral] });
}

function getFormattedDate() {
	const now = new Date();
	const day = String(now.getUTCDate()).padStart(2, '0');
	const month = String(now.getUTCMonth() + 1).padStart(2, '0');
	const year = now.getUTCFullYear();
	return `${year}-${month}-${day}`; // Format for sorting: "YYYY-MM-DD".
}

function getTimestamp(color = true) {
	const now = new Date();
	const hours = String(now.getUTCHours()).padStart(2, '0');
	const minutes = String(now.getUTCMinutes()).padStart(2, '0');
	const seconds = String(now.getUTCSeconds()).padStart(2, '0');
	const timeStr = `${hours}:${minutes}:${seconds}`;
	const dateStr = String(now.getUTCDate()).padStart(2, '0') + '.' + 
		String(now.getUTCMonth() + 1).padStart(2, '0') + '.' + 
		now.getUTCFullYear();
		
	const text = `[ ${timeStr} ${dateStr} UTC ]`;
	return color ? colorize('gray', text) : text;
}

function formatUptime(ms) {
	const seconds = Math.floor((ms / 1000) % 60);
	const minutes = Math.floor((ms / (1000 * 60)) % 60);
	const hours = Math.floor((ms / (1000 * 60 * 60)) % 24);
	const days = Math.floor(ms / (1000 * 60 * 60 * 24));

	const parts = [];
	if (days > 0) parts.push(`${days}d`);
	if (hours > 0 || days > 0) parts.push(`${hours}h`);
	if (minutes > 0 || hours > 0 || days > 0) parts.push(`${minutes}m`);
	parts.push(`${seconds}s`);

	return parts.join(' ');
}

function makeLogMessage(interaction, rl) {
	const logMessage = `${getTimestamp()} ${colorize('gray', '[Command Used]')} '/${interaction.commandName}' was executed by @${interaction.user.tag} (${interaction.user.id})`;
	consoleLog(rl, logMessage);
}

function writeLogToFile(message, { raw = false } = {}) {
	try {
		const normalized = String(message)
			.replace(/\u001b\[[0-9;?]*[A-Za-z]/g, '')
			.replace(/\r\n/g, '\n');
		
		if (raw) {
			appendToLog(normalized);
			logWriteWarned = false;
			return;
		}
		
		// Preserve up to 2 leading newlines.
		const leadingBreaks = (normalized.match(/^\n+/)?.[0] || '').slice(0, 2);
		const trailingBreaks = (normalized.match(/\s*$/)[0].match(/\n/g) || []).length;
		
		let cleanMessage = normalized
			.replace(/\n{3,}/g, '\n\n')
			.trim();
		
		if (!cleanMessage) return;
		
		if (!TIMESTAMP_PREFIX_REGEX.test(cleanMessage)) {
			cleanMessage = `${getTimestamp(false)} ${cleanMessage}`;
		}
		
		cleanMessage = leadingBreaks + cleanMessage + '\n'.repeat(Math.min(trailingBreaks, 2));
		
		appendToLog(cleanMessage);
		logWriteWarned = false;
	} catch (err) {
		if (!logWriteWarned) {
			logWriteWarned = true;
			try { consoleLog(`${colorize('gray', '[LOGGER]')} ${colorize('red', 'Failed to write to log file')}: ${err.message}`); } catch (e) {}
		}
	}
}

function cleanOldLogs() {
	try {
		if (!fs.existsSync(logsDir)) return;
		const cutoff = Date.now() - getLogRetentionDays() * 24 * 60 * 60 * 1000;
		let removed = 0;

		for (const file of fs.readdirSync(logsDir)) {
			const match = file.match(LOG_FILE_REGEX);
			if (!match) continue;

			const fileDate = Date.UTC(+match[1], +match[2] - 1, +match[3]);
			if (fileDate < cutoff) {
				try {
					fs.unlinkSync(path.join(logsDir, file));
					removed++;
				} catch (err) {}
			}
		}

		if (removed > 0) {
			consoleLog(`${getTimestamp()} ${colorize('gray', '[Logger]')} Removed ${removed} log file(s) older than ${getLogRetentionDays()} days.`);
		}
	} catch (err) {
		consoleLog(`${getTimestamp()} ${colorize('gray', '[Logger]')} ${colorize('red', 'Failed to clean old logs')}: `, err.message);
	}
}

function lockLogFile(filePath) {
	if (process.platform !== 'linux') return;
	const isRoot = process.getuid && process.getuid() === 0;
	const [cmd, args] = isRoot
		? ['chattr', ['+a', filePath]]
		: ['sudo', ['-n', 'chattr', '+a', filePath]];
	execFile(cmd, args, () => {});
}

function appendToLog(text) {
	fs.mkdirSync(logsDir, { recursive: true });

	const data = `${text}\n`;
	const bytes = Buffer.byteLength(data, 'utf8');
	const date = getFormattedDate();
	
	if (logState.date !== date) {
		logState = { date, part: 0, size: null };
		setImmediate(cleanOldLogs);
	}

	while (true) {
		const fileName = logState.part === 0 ? `${date}.log` : `${date}.${logState.part}.log`;
		const filePath = path.join(logsDir, fileName);

		if (logState.size === null) {
			try { logState.size = fs.statSync(filePath).size; } catch (err) { logState.size = 0; }
		}

		if (logState.size > 0 && logState.size + bytes > getLogMaxBytes()) {
			logState.part++;
			logState.size = null;
			continue;
		}

		const isNewFile = logState.size === 0;
		fs.appendFileSync(filePath, data, { encoding: 'utf8', flag: 'a' });
		logState.size += bytes;
		if (isNewFile) lockLogFile(filePath);
		return;
	}
}

function writeCenteredLog(title, width = 40) {
	const padding = Math.max(0, Math.floor((width - title.length) / 2));
	const line = '-'.repeat(width);

	writeLogToFile(`\n${line}`, { raw: true });
	writeLogToFile(`${' '.repeat(padding)}${title}`, { raw: true });
	writeLogToFile(`${line}\n`, { raw: true });
}

function readLoreFileStrict(filePath) {
	if (!fs.existsSync(filePath)) return [];
	const absolutePath = require.resolve(filePath);
	delete require.cache[absolutePath];
	const mod = require(absolutePath);
	if (!Array.isArray(mod)) {
		throw new Error(colorize('red', `Lore file '${path.basename(filePath)}' does not export an array.`));
	}
	return mod.map(s => String(s));
}

function serializeLore(snippets) {
	return `module.exports = ${JSON.stringify(snippets, null, '\t')};\n`;
}

function exceedsLoreLimit(snippets) {
	return Buffer.byteLength(serializeLore(snippets), 'utf8') > getLoreMaxBytes();
}

function writeLoreFile(filePath, snippets) {
	if (fs.existsSync(filePath)) {
		try { fs.copyFileSync(filePath, `${filePath}.bak`); } catch (err) {}
	}
	if (snippets.length === 0) {
		fs.rmSync(filePath, { force: true });
	} else {
		const tmpPath = `${filePath}.tmp`;
		fs.writeFileSync(tmpPath, serializeLore(snippets), 'utf8');
		fs.renameSync(tmpPath, filePath);
	}
	try { delete require.cache[require.resolve(filePath)]; } catch (err) {}
}

function assertSnowflake(...ids) {
	for (const id of ids) {
		if (!SNOWFLAKE_REGEX.test(String(id))) throw new Error(colorize('red', 'Invalid guild or role ID.'));
	}
}

function loadRolesModule(file) {
	const absolutePath = require.resolve(file);
	delete require.cache[absolutePath];
	return require(absolutePath);
}

function getAllGuildRoles({ strict = false } = {}) {
	if (!fs.existsSync(rolesFile)) return Object.create(null);
	
	let mod;
	try {
		mod = loadRolesModule(rolesFile);
	} catch (err) {
		const bakFile = `${rolesFile}.bak`;
		if (strict || !fs.existsSync(bakFile)) throw err;
		if (Date.now() - rolesWarnedAt > 60_000) {
			rolesWarnedAt = Date.now();
			consoleLog(`${getTimestamp()} ${colorize('gray', '[Roles]')} ${colorize('red', `Failed to load "${path.basename(rolesFile)}", using "${path.basename(bakFile)}" (read-only) until it is fixed`)}: `, err);
		}
		mod = loadRolesModule(bakFile);
	}
	
	if (!mod || typeof mod !== 'object' || Array.isArray(mod)) {
		throw new Error(colorize('red', `"${path.basename(rolesFile)}" does not export an object.`));
	}
	const data = Object.create(null);
	for (const [guildId, roleIds] of Object.entries(mod)) {
		if (!SNOWFLAKE_REGEX.test(guildId) || !Array.isArray(roleIds)) {
			continue;
		}
		const validRoleIds = roleIds.filter(id => typeof id === 'string' && SNOWFLAKE_REGEX.test(id));
		if (validRoleIds.length > 0) {
			data[guildId] = [...new Set(validRoleIds)];
		}
	}
	return data;
}

function writeAllGuildRoles(data) {
	const maxBytes = getRolesMaxFileBytes();
	const clean = {};
	for (const [guildId, ids] of Object.entries(data)) {
		if (ids.length > 0) clean[guildId] = ids;
	}
	// Only validated digit strings are serialized.
	const content = `module.exports = ${JSON.stringify(clean, null, '\t')};\n`;
	if (Buffer.byteLength(content, 'utf8') > maxBytes) {
		throw new Error(colorize('red', `"${path.basename(rolesFile)}" would exceed ${maxBytes} bytes.`));
	}
	fs.mkdirSync(dataDir, { recursive: true });
	if (fs.existsSync(rolesFile)) {
		try { fs.copyFileSync(rolesFile, `${rolesFile}.bak`); } catch (err) {}
	}
	const tmpPath = `${rolesFile}.tmp`;
	fs.writeFileSync(tmpPath, content, 'utf8');
	fs.renameSync(tmpPath, rolesFile);
	try { delete require.cache[require.resolve(rolesFile)]; } catch (err) {}
}

function getGuildRoles(guildId) {
	assertSnowflake(guildId);
	return [...(getAllGuildRoles()[guildId] ?? [])];
}

function addGuildRole(guildId, roleId) {
	assertSnowflake(guildId, roleId);
	const data = getAllGuildRoles({ strict: true });
	const list = data[guildId] ?? [];
	if (list.includes(roleId)) return 'exists';
	if (list.length >= getRolesMaxPerGuild()) return 'limit';
	data[guildId] = [...list, roleId];
	writeAllGuildRoles(data);
	return 'added';
}

function removeGuildRole(guildId, roleId) {
	assertSnowflake(guildId, roleId);
	const data = getAllGuildRoles({ strict: true });
	const list = data[guildId] ?? [];
	if (!list.includes(roleId)) return 'missing';
	data[guildId] = list.filter(id => id !== roleId);
	writeAllGuildRoles(data);
	return 'removed';
}

function validateRoleSelection(guild, role, actorMember = null) {
	if (!role) return 'notFound';
	if (role.id === guild.id) return 'everyone';
	if (role.managed) return 'managed';
	if (ROLE_FORBIDDEN_PERMISSIONS.some(perm => role.permissions.has(perm))) return 'dangerous';

	const me = guild.members.me;
	if (!me?.permissions.has(PermissionFlagsBits.ManageRoles)) return 'botPermission';
	if (me.roles.highest.comparePositionTo(role) <= 0) return 'botHierarchy';

	if (actorMember && actorMember.id !== guild.ownerId) {
		const actorHighest = actorMember.roles?.highest;
		if (!actorHighest || actorHighest.comparePositionTo(role) <= 0) return 'userHierarchy';
	}
	return null;
}

async function createSelectedRole(guild, { name, color = null, hoist = false, mentionable = false, reason = null } = {}) {
	if (!guild) return { status: 'notFound' };

	const existing = getAllGuildRoles({ strict: true })[guild.id] ?? [];
	if (existing.length >= getRolesMaxPerGuild()) return { status: 'limit' };

	const me = guild.members.me;
	if (!me?.permissions.has(PermissionFlagsBits.ManageRoles)) return { status: 'botPermission' };

	const cleanName = String(name ?? '').trim().slice(0, 100);
	if (!cleanName) return { status: 'invalidName' };

	const role = await guild.roles.create({
		name: cleanName,
		permissions: [],
		color: color ?? undefined,
		hoist: Boolean(hoist),
		mentionable: Boolean(mentionable),
		reason: reason || 'Created as a bot selected role.'
	});

	let addStatus;
	try {
		addStatus = addGuildRole(guild.id, role.id);
	} catch (err) {
		try { await role.delete('Rollback: failed to register selected role'); } catch (e) {}
		throw err;
	}

	if (addStatus !== 'added') {
		try { await role.delete('Rollback: failed to register selected role'); } catch (err) {}
		return { status: addStatus };
	}

	return { status: 'created', role };
}

async function giveGuildRole(guild, targetMember, role, actorMember = null, reason = null) {
	if (!guild) return 'notFound';
	if (!targetMember || targetMember.guild?.id !== guild.id) return 'memberNotFound';
	if (!role) return 'notFound';

	if (!getGuildRoles(guild.id).includes(role.id)) return 'notSelected';

	const problem = validateRoleSelection(guild, role, actorMember);
	if (problem) return problem;

	if (actorMember && actorMember.id !== guild.ownerId && targetMember.id !== actorMember.id) {
		if (targetMember.id === guild.ownerId || actorMember.roles.highest.comparePositionTo(targetMember.roles.highest) <= 0) {
			return 'targetHierarchy';
		}
	}

	if (targetMember.roles.cache.has(role.id)) return 'already';

	await targetMember.roles.add(role, String(reason ?? 'Role given via bot.').slice(0, 512));
	return 'given';
}

async function takeGuildRole(guild, targetMember, role, actorMember = null, reason = null) {
	if (!guild) return 'notFound';
	if (!targetMember || targetMember.guild?.id !== guild.id) return 'memberNotFound';
	if (!role) return 'notFound';

	if (!getGuildRoles(guild.id).includes(role.id)) return 'notSelected';

	const problem = validateRoleSelection(guild, role, actorMember);
	if (problem) return problem;

	if (actorMember && actorMember.id !== guild.ownerId && targetMember.id !== actorMember.id) {
		if (targetMember.id === guild.ownerId || actorMember.roles.highest.comparePositionTo(targetMember.roles.highest) <= 0) {
			return 'targetHierarchy';
		}
	}

	if (!targetMember.roles.cache.has(role.id)) return 'missing';

	await targetMember.roles.remove(role, String(reason ?? 'Role taken via bot.').slice(0, 512));
	return 'taken';
}

function colorize(color, text) {
	if (!process.stdout.isTTY || !ANSI[color]) return String(text);
	return `${ANSI[color]}${text}${ANSI.reset}`;
}

function roleColorEmoji(role) {
	if (!role.color) return '⚪';
	const rgb = [(role.color >> 16) & 255, (role.color >> 8) & 255, role.color & 255];
	let best = COLOR_EMOJIS[0];
	let bestDist = Infinity;
	for (const candidate of COLOR_EMOJIS) {
		const dist = candidate.rgb.reduce((sum, v, i) => sum + (v - rgb[i]) ** 2, 0);
		if (dist < bestDist) { bestDist = dist; best = candidate; }
	}
	return best.emoji;
}

function setupPlayerEvents(guildId, player, voiceConnections, guildPlayers, guildVolumes, currentVolume) {
	const isCurrent = () => guildPlayers.get(guildId)?.player === player;

	player.on(AudioPlayerStatus.Idle, () => {
		if (!isCurrent()) return;
		guildPlayers.delete(guildId);
		saveVoiceState(voiceConnections, guildPlayers, guildVolumes, resolveVolume(currentVolume));
	});

	player.on('error', err => {
		consoleLog(`${getTimestamp()} ${colorize('red', `Audio player error in guild '${guildId}'`)}: `, err.message);
		if (!isCurrent()) return;
		guildPlayers.delete(guildId);
		saveVoiceState(voiceConnections, guildPlayers, guildVolumes, resolveVolume(currentVolume));
	});
}

async function hasSelectedRole(interaction) {
	if (!interaction?.inGuild() || !interaction.guildId) return false;

	const selectedRoleIds = getGuildRoles(interaction.guildId);
	if (selectedRoleIds.length === 0) return false;

	let member = interaction.member ?? interaction.guild?.members.cache.get(interaction.user.id);
	if (!member && interaction.guild) {
		member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
	}
	const roles = member?.roles;
	if (!roles) return false;

	if (roles.cache) {
		return selectedRoleIds.some(roleId => roles.cache.has(roleId));
	}
	if (Array.isArray(roles)) {
		return selectedRoleIds.some(roleId => roles.includes(roleId));
	}
	return false;
}

async function isWhitelist(interaction, CONFIG, locales) {
	if (CONFIG.whitelist.includes(interaction.user.id)) {
		await safeReply(interaction, {
			content: getLocText(interaction, 'replyWhitelistYes', {}, locales),
			flags: [MessageFlags.Ephemeral]
		});
		return true;
	}
	return false;
}

async function isWhitelistNot(interaction, CONFIG, locales) {
	if (!CONFIG.whitelist.includes(interaction.user.id)) {
		await safeReply(interaction, {
			content: getLocText(interaction, 'replyWhitelistNo', {}, locales),
			flags: [MessageFlags.Ephemeral]
		});
		return true;
	}
	return false;
}

async function isAuthorizedTesterNot(interaction, CONFIG, locales) {
	if (!CONFIG.authorizedTesters.includes(interaction.user.id)) {
		await safeReply(interaction, {
			content: getLocText(interaction, 'replyAuthorizedTesterNot', {}, locales),
			flags: [MessageFlags.Ephemeral]
		});
		return true;
	}
	return false;
}

async function isAdminManageServer(interaction, locales) {
	if (!interaction.member?.permissions.has(PermissionFlagsBits.ManageGuild)) {
		await safeReply(interaction, {
			content: getLocText(interaction, 'replyNoPermissionAdminManageServer', {}, locales),
			flags: [MessageFlags.Ephemeral]
		});
		return true;
	}
	return false;
}

async function isRoleManagerNot(interaction, CONFIG, locales) {
	if (CONFIG.whitelist.includes(interaction.user.id)) return false;
	const perms = interaction.memberPermissions;
	if (perms && (perms.has(PermissionFlagsBits.Administrator) || perms.has(PermissionFlagsBits.ManageGuild))) return false;

	await safeReply(interaction, {
		content: getLocText(interaction, 'replyNoPermissionRoleManage', {}, locales),
		flags: [MessageFlags.Ephemeral]
	});
	return true;
}

async function isSelectedRoleNot(interaction, locales) {
	if (!(await hasSelectedRole(interaction))) {
		await safeReply(interaction, {
			content: getLocText(interaction, 'replyNoSelectedRole', {}, locales),
			flags: [MessageFlags.Ephemeral]
		});
		return true;
	}
	return false;
}

async function isGuildNot(interaction, locales) {
	if (!interaction.inGuild()) {
		await safeReply(interaction, { content: getLocText(interaction, 'replyGuild', {}, locales), flags: [MessageFlags.Ephemeral] });
		return true;
	}
	return false;
}

async function isVoiceNot(interaction, voiceConnections, locales) {
	const connection = voiceConnections.get(interaction.guildId);
	if (!connection) {
		await safeReply(interaction, { content: getLocText(interaction, 'replyNotInVoice', {}, locales), flags: [MessageFlags.Ephemeral] });
		return true;
	}
	return false;
}

function saveVoiceState(voiceConnections, guildPlayers, guildVolumes, currentVolume = 1.0) {
	saveVolumes(guildVolumes, currentVolume);
	
	try {
		const activeChannels = {};
		for (const [guildId, connection] of voiceConnections.entries()) {
			const channelId = connection.joinConfig.channelId;
			if (channelId) {
				const playerEntry = guildPlayers.get(guildId);
				activeChannels[guildId] = {
					channelId,
					playingSound: playerEntry?.soundName || null,
					positionMs: playerEntry ? Date.now() - playerEntry.startTime : 0
				};
			}
		}
		
		const fileContent = `${JSON.stringify(activeChannels, null, '\t')}\n`;
		fs.mkdirSync(dataDir, { recursive: true });
		fs.writeFileSync(voiceStateFile, fileContent, 'utf8');
	} catch (err) {
		consoleLog(`${getTimestamp()} ${colorize('gray', '[Voice]')} ${colorize('red', 'Failed to save voice state')}: `, err.message);
	}
}

async function restoreVoiceState(client, voiceConnections, guildVolumes, guildPlayers, currentVolume) {
	try {
		if (!fs.existsSync(voiceStateFile)) return;
		const data = JSON.parse(fs.readFileSync(voiceStateFile, 'utf8'));
		fs.unlinkSync(voiceStateFile);

		consoleLog(`${getTimestamp()} ${colorize('gray', '[Voice]')} ${colorize('cyan', 'Restoring previous voice states...')}`);

		for (const [guildId, stateData] of Object.entries(data)) {
			try {
				const guild = client.guilds.cache.get(guildId);
				if (!guild) continue;

				// Support both old string format and new object format.
				const channelId = typeof stateData === 'string' ? stateData : stateData.channelId;
				const channel = guild.channels.cache.get(channelId);
				if (!channel) continue;
				
				const connection = joinVoiceChannel({
					channelId: channel.id,
					guildId: guild.id,
					adapterCreator: guild.voiceAdapterCreator,
				});
				attachConnectionHandlers(connection, guild.id, voiceConnections, guildPlayers, guild);
				voiceConnections.set(guild.id, connection);
				consoleLog(`${getTimestamp()} ${colorize('gray', '[Voice]')} ${colorize('green', `Rejoined voice channel '${channel.name}' in guild ID '${guildId}'.`)}`);

				// Restore playing sound if available.
				const soundPath = (typeof stateData === 'object' && stateData.playingSound) ? getSoundFilePath(stateData.playingSound) : null;
				if (soundPath && fs.existsSync(soundPath)) {
					const player = createAudioPlayer();
					const seekSeconds = Math.max(0, Math.floor((stateData.positionMs || 0) / 1000));

					const ffmpegArgs = ['-nostdin'];
					if (seekSeconds > 0) {
						ffmpegArgs.push('-ss', String(seekSeconds), '-accurate_seek');
					}
					ffmpegArgs.push('-i', soundPath, '-loglevel', '0', '-f', 's16le', '-ar', '48000', '-ac', '2', 'pipe:1');

					const ffmpegProcess = spawn(FFMPEG_PATH, ffmpegArgs, { stdio: ['ignore', 'pipe', 'ignore'] });
					const killFfmpeg = () => { try { ffmpegProcess.kill('SIGKILL'); } catch (e) {} };
					ffmpegProcess.on('error', (err) => {
						consoleLog(`${getTimestamp()} ${colorize('gray', '[Voice]')} ${colorize('red', `Could not run ffmpeg to resume '${stateData.playingSound}'`)}: `, err.message);
						try { player.stop(true); } catch (e) {}
						if (guildPlayers.get(guild.id)?.player === player) {
							guildPlayers.delete(guild.id);
						}
					});

					// Explicitly specify StreamType.Raw so Discord parses the PCM stream correctly.
					const resource = createAudioResource(ffmpegProcess.stdout, {
						inlineVolume: true,
						inputType: StreamType.Raw,
						metadata: { title: stateData.playingSound }
					});
					
					resource.volume?.setVolume(guildVolumes.get(guild.id) ?? resolveVolume(currentVolume));
					
					guildPlayers.set(guild.id, {
						player,
						resource,
						soundName: stateData.playingSound,
						startTime: Date.now() - (stateData.positionMs || 0)
					});

					setupPlayerEvents(guild.id, player, voiceConnections, guildPlayers, guildVolumes, currentVolume);
					player.once(AudioPlayerStatus.Idle, killFfmpeg);
					player.once('error', killFfmpeg);

					const startPlayback = () => {
						connection.subscribe(player);
						try { player.play(resource); } catch (e) {}
					};
					if (connection.state.status === VoiceConnectionStatus.Ready) {
						startPlayback();
					} else {
						connection.once(VoiceConnectionStatus.Ready, startPlayback);
					}
					consoleLog(`${getTimestamp()} ${colorize('gray', '[Voice]')} ${colorize('green', `Resumed audio playback for '${stateData.playingSound}'.`)}`);
				}
			} catch (err) {
				consoleLog(`${getTimestamp()} ${colorize('gray', '[Voice]')} ${colorize('red', `Failed to restore voice state for guild ID '${guildId}'`)}: `, err.message);
			}
		}
	} catch (err) {
		consoleLog(`${getTimestamp()} ${colorize('gray', '[Voice]')} ${colorize('red', 'Failed to restore voice state')}: `, err.message);
	}
}

function saveVolumes(guildVolumes, currentVolume = 1.0) {
	try {
		const data = { global: currentVolume, guilds: Object.fromEntries(guildVolumes) };
		fs.mkdirSync(dataDir, { recursive: true });
		fs.writeFileSync(volumesFile, `${JSON.stringify(data, null, '\t')}\n`, 'utf8');
	} catch (err) {
		consoleLog(`${getTimestamp()} ${colorize('gray', '[Voice]')} ${colorize('red', 'Failed to save volumes')}: `, err.message);
	}
}

function loadVolumes(guildVolumes) {
	try {
		if (!fs.existsSync(volumesFile)) return null;
		const data = JSON.parse(fs.readFileSync(volumesFile, 'utf8'));
		const valid = (v) => typeof v === 'number' && v >= 0 && v <= 1;
		for (const [guildId, vol] of Object.entries(data.guilds || {})) {
			if (valid(vol)) guildVolumes.set(guildId, vol);
		}
		return valid(data.global) ? data.global : null;
	} catch (err) {
		consoleLog(`${getTimestamp()} ${colorize('gray', '[Voice]')} ${colorize('red', 'Failed to load volumes')}: `, err.message);
		return null;
	}
}

function getLoreFilePath(guildId, lang) {
	if (!GUILD_ID_REGEX.test(String(guildId)) || !LANG_CODE_REGEX.test(String(lang))) return null;
	const resolvedDir = path.resolve(loresDir);
	const filePath = path.resolve(resolvedDir, `${guildId}_${lang}.js`);
	return path.dirname(filePath) === resolvedDir ? filePath : null;
}

function getSoundFilePath(name) {
	const extRegex = new RegExp(`${SOUND_EXT.replace('.', '\\.')}$`, 'i');
	const soundName = String(name ?? '').replace(extRegex, '');
	if (!soundName || /[\\/\0]/.test(soundName)) return null;
	fs.mkdirSync(soundsDir, { recursive: true });
	const resolvedDir = path.resolve(soundsDir);
	const filePath = path.resolve(resolvedDir, `${soundName}${SOUND_EXT}`);
	return path.dirname(filePath) === resolvedDir ? filePath : null;
}

function cancelRejoin(guildId) {
	const timer = rejoinTimers.get(guildId);
	if (timer) {
		clearTimeout(timer);
		rejoinTimers.delete(guildId);
	}
}

function scheduleRejoin(guild, channelId, voiceConnections, guildPlayers, attempt = 0) {
	const guildId = guild.id;
	cancelRejoin(guildId);
	if (isExiting || !channelId) return;

	if (attempt >= REJOIN_DELAYS_MS.length) {
		consoleLog(`${getTimestamp()} ${colorize('gray', '[Voice]')} ${colorize('yellow', `Giving up rejoining in guild ID '${guildId}' after ${attempt} attempt(s). Use 'voice-join' or '/voice-join' to reconnect.`)}`);
		return;
	}

	const delay = REJOIN_DELAYS_MS[attempt];
	consoleLog(`${getTimestamp()} ${colorize('gray', '[Voice]')} ${colorize('yellow', `Connection lost in guild ID '${guildId}'. Rejoin attempt ${attempt + 1}/${REJOIN_DELAYS_MS.length} in ${delay / 1000}s...`)}`);

	const timer = setTimeout(async () => {
		rejoinTimers.delete(guildId);
		if (isExiting) return;
		
		// Already reconnected manually.
		if (voiceConnections.has(guildId)) return;

		const channel = guild.channels.cache.get(channelId);
		if (!channel || !channel.isVoiceBased()) {
			consoleLog(`${getTimestamp()} ${colorize('gray', '[Voice]')} ${colorize('yellow', `Rejoin cancelled: channel ID '${channelId}' no longer exists.`)}`);
			return;
		}

		try {
			await joinVoice(channel, voiceConnections, guildPlayers);
			consoleLog(`${getTimestamp()} ${colorize('gray', '[Voice]')} ${colorize('green', `Rejoined voice channel '${channel.name}' in guild ID '${guildId}'.`)}`);
		} catch (err) {
			consoleLog(`${getTimestamp()} ${colorize('gray', '[Voice]')} ${colorize('red', 'Rejoin attempt failed')}: `, err.message);
			scheduleRejoin(guild, channelId, voiceConnections, guildPlayers, attempt + 1);
		}
	}, delay);

	rejoinTimers.set(guildId, timer);
}

function attachConnectionHandlers(connection, guildId, voiceConnections, guildPlayers, guild) {
	let wasKicked = false;

	connection.on('error', (err) => {
		consoleLog(`${getTimestamp()} ${colorize('red', 'Voice connection error')}: `, err.message);
		try { connection.destroy(); } catch (e) {}
	});

	connection.on(VoiceConnectionStatus.Disconnected, async (oldState, newState) => {
		try {
			await Promise.race([
				entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
				entersState(connection, VoiceConnectionStatus.Connecting, 5_000)
			]);
		} catch (err) {
			// 4014 = bot was disconnected/kicked from the channel by a moderator.
			if (newState.reason === VoiceConnectionDisconnectReason.WebSocketClose && newState.closeCode === 4014) {
				wasKicked = true;
			}
			if (connection.state.status !== VoiceConnectionStatus.Destroyed) {
				try { connection.destroy(); } catch (e) {}
			}
		}
	});

	connection.on(VoiceConnectionStatus.Destroyed, () => {
		if (voiceConnections.get(guildId) === connection) {
			const channelId = connection.joinConfig?.channelId;
			voiceConnections.delete(guildId);
			guildPlayers.delete(guildId);
			
			if (guild && !wasKicked && !isExiting) {
				scheduleRejoin(guild, channelId, voiceConnections, guildPlayers);
			}
		}
	});
}

async function joinVoice(channel, voiceConnections, guildPlayers) {
	const guildId = channel.guild.id;

	const existing = voiceConnections.get(guildId);
	if (existing) {
		voiceConnections.delete(guildId);
		const previous = guildPlayers.get(guildId);
		guildPlayers.delete(guildId);
		try { previous?.player.stop(true); } catch (e) {}
		try { existing.destroy(); } catch (e) {}
	}

	const connection = joinVoiceChannel({
		channelId: channel.id,
		guildId,
		adapterCreator: channel.guild.voiceAdapterCreator,
	});
	attachConnectionHandlers(connection, guildId, voiceConnections, guildPlayers, channel.guild);

	try {
		await entersState(connection, VoiceConnectionStatus.Ready, 15_000);
	} catch (err) {
		const lastStatus = connection.state.status;
		if (lastStatus !== VoiceConnectionStatus.Destroyed) {
			try { connection.destroy(); } catch (e) {}
		}
		throw new Error(colorize('red', `Could not join '${channel.name}' (stuck at '${lastStatus}'). Check the bot's View/Connect permissions.`));
	}

	voiceConnections.set(guildId, connection);
	return connection;
}

async function clearPresence(client) {
	try {
		if (!client?.user || !client.ws || client.ws.status !== 0) return; // 0 = Ready.
		client.user.setPresence({ activities: [], status: 'invisible' });
		await new Promise(resolve => setTimeout(resolve, 500));
	} catch (err) {
		consoleLog(`${getTimestamp()} ${colorize('red', 'Failed to clear status')}: `, err);
	}
}

async function shutdown(client, voiceConnections, guildPlayers, rl, guildVolumes, currentVolume = 1.0, exitCode = 0) {
	if (isExiting) return;
	isExiting = true;
	
	consoleLog(`\n${getTimestamp()} ${colorize('cyan', 'Shutting down the bot safely...')}`);
	
	try {
		rl.close();
		
		if (voiceConnections.size > 0 || guildPlayers.size > 0) {
			try {
				if (fs.existsSync(voiceStateFile)) {
					try { fs.unlinkSync(voiceStateFile); } catch (err) {}
				}

				saveVoiceState(voiceConnections, guildPlayers, guildVolumes, currentVolume);
				consoleLog(`${getTimestamp()} ${colorize('cyan', 'Leaving voice channels...')}`);
				for (const [guildId, connection] of voiceConnections.entries()) {
					try {
						connection.destroy();
					} catch (err) {}
				}
				voiceConnections.clear();
				consoleLog(`${getTimestamp()} ${colorize('green', 'Successfully left all voice channels.')}`);
				
				await new Promise(resolve => setTimeout(resolve, 1000));
			} catch (err) {
				consoleLog(`${getTimestamp()} ${colorize('red', 'Failed to leave voice channels')}: `, err);
			}
		}
		
		await clearPresence(client);
		if (client.ws) client.ws.destroy();
		await client.destroy();
	} catch (err) {
		consoleLog(err);
	} finally {
		writeCenteredLog(`End of the session (Status ${exitCode})`);
		try { if (process.stdin.isTTY) process.stdin.setRawMode(false); } catch (err) {}
		process.exit(exitCode);
	}
}

async function restart(client, voiceConnections, guildPlayers, rl, scriptFilename, guildVolumes, currentVolume = 1.0, exitCode = 42) {
	if (isExiting) return;
	isExiting = true;

	consoleLog(`\n${getTimestamp()} ${colorize('cyan', 'Restarting the bot safely...')}`);
	
	try {
		rl.close();
		
		if (voiceConnections.size > 0 || guildPlayers.size > 0) {
			try {
				if (fs.existsSync(voiceStateFile)) {
					try { fs.unlinkSync(voiceStateFile); } catch (err) {}
				}

				saveVoiceState(voiceConnections, guildPlayers, guildVolumes, currentVolume);
				consoleLog(`${getTimestamp()} ${colorize('cyan', 'Leaving voice channels...')}`);
				for (const [guildId, connection] of voiceConnections.entries()) {
					try {
						connection.destroy();
					} catch (err) {}
				}
				voiceConnections.clear();
				consoleLog(`${getTimestamp()} ${colorize('green', 'Successfully left all voice channels.')}`);
				
				await new Promise(resolve => setTimeout(resolve, 1000));
			} catch (err) {
				consoleLog(`${getTimestamp()} ${colorize('red', 'Failed to leave voice channels')}: `, err);
			}
		}
		
		await clearPresence(client);
		if (client.ws) client.ws.destroy();
		await client.destroy();
	} catch (err) {
		consoleLog(err);
	} finally {	
		writeCenteredLog(`End of the session (Status ${exitCode})`);
		try { if (process.stdin.isTTY) process.stdin.setRawMode(false); } catch (err) {}
		process.exit(exitCode);
	}
}

async function loginWithRetry(client, attempt = 1, token = activeConfig?.discordToken || process.env.DISCORD_TOKEN) {
	try {
		await client.login(token);
	} catch (err) {
		consoleLog(`${getTimestamp()} ${colorize('yellow', `Login failed (attempt ${attempt})`)}: ${err.message}`);
		if (FATAL_LOGIN_ERRORS.includes(err.code) || attempt >= 10) {
			consoleLog(`${getTimestamp()} ${colorize('red', `Giving up after ${attempt} attempt(s).`)}`);
			
			const exitCode = 1;
			writeCenteredLog(`End of the session (Status ${exitCode})`);
			process.exit(exitCode);
		}
		
		const delayMs = Math.min(60000, 5000 * attempt);
		consoleLog(`${getTimestamp()} ${colorize('cyan', `Retrying login in ${delayMs / 1000}s...`)}`);
		setTimeout(() => loginWithRetry(client, attempt + 1, token), delayMs);
	}
}

module.exports = {
	isIgnorableInteractionError,
	loadSafeModule, getCmdText, getLocText, getLocalizedLoreSnippets, removeDuplicateLoreInFiles, setupGlobalMessageSanitizer,
	consoleLog, getTimestamp, formatUptime, makeLogMessage, safeReply, getFormattedDate, writeLogToFile, writeCenteredLog, setLogReadline, setConfig, handleCommandError,
	isWhitelist, isWhitelistNot, isAuthorizedTesterNot, isAdminManageServer, isRoleManagerNot, isSelectedRoleNot, isGuildNot, isVoiceNot,
	saveVoiceState, restoreVoiceState, loadVolumes,
	readLoreFileStrict, writeLoreFile, exceedsLoreLimit,
	getAllGuildRoles, getGuildRoles, addGuildRole, removeGuildRole, validateRoleSelection, createSelectedRole, giveGuildRole, takeGuildRole, colorize, roleColorEmoji,
	getRolesMaxPerGuild, getRolesMaxFileBytes,
	getLoreMaxBytes, getLoreFilePath, getSoundFilePath, joinVoice, setupPlayerEvents,
	shutdown, restart, loginWithRetry
};
