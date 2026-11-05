// Dependencies.
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const util = require('util');
const { MessageFlags, TextChannel, ThreadChannel, PermissionFlagsBits } = require('discord.js');

const dataDir = path.join(__dirname, '../data');
const voiceStateFile = path.join(dataDir, 'voice-state.json');
const volumesFile = path.join(dataDir, 'volumes.json');
const logsDir = path.join(__dirname, '../logs');
const loresDir = path.join(__dirname, '../lores');
const soundsDir = path.join(__dirname, '../sounds');

const FATAL_LOGIN_ERRORS = ['TokenInvalid', 'TokenMissing', 'DisallowedIntents'];
const GUILD_ID_REGEX = /^(\d{5,25}|default)$/;
const LANG_CODE_REGEX = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/;
const TIMESTAMP_PREFIX_REGEX = /^\[\d{2}:\d{2}:\d{2} \d{2}\.\d{2}\.\d{4} UTC\]/;

const LOG_MAX_FILE_BYTES = parseInt(process.env.LOG_MAX_SIZE_BYTES, 10) || (2 ** 25); // 32 MiB.
const LOG_RETENTION_DAYS = parseInt(process.env.LOG_RETENTION_DAYS, 10) || 30;
const LOG_FILE_REGEX = /^(\d{4})-(\d{2})-(\d{2})(?:\.\d+)?\.log$/;
const LORE_MAX_FILE_BYTES = parseInt(process.env.LORE_MAX_SIZE_BYTES, 10) || (2 ** 20); // 1 MiB.

const resolveVolume = (v) => (typeof v === 'function' ? v() : v);
let isExiting = false;
let defaultRl = null;
let logWriteWarned = false;
let logState = { date: null, part: 0, size: null };

// Functions.
function loadSafeModule(filePath, fallbackValue) {
	try {
		const absolutePath = require.resolve(filePath);
		delete require.cache[absolutePath];
		const mod = require(absolutePath);
		
		if (Array.isArray(mod)) {
			return mod.map(s => String(s));
		}
		return mod;
	} catch (err) {
		return fallbackValue;
	}
	return fallbackValue;
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
	const fullLocale = interaction.locale || 'en';
	const baseLocale = fullLocale.split('-')[0];
	const localeCandidates = [...new Set([fullLocale, baseLocale])].filter(l => LANG_CODE_REGEX.test(l));
	let filePath = localeCandidates
		.map(l => `${loresDir}/${guildId}_${l}.js`)
		.find(p => fs.existsSync(p)) || `${loresDir}/${guildId}_${baseLocale}.js`;
	
	// User's language.
	if (!fs.existsSync(filePath)) {
		// Fallback to English ('en') if user language is missing.
		filePath = `${loresDir}/${guildId}_en.js`;
		
		if (!fs.existsSync(filePath)) {
			// Fallback to a random available language file for this guild.
			try {
				if (fs.existsSync(loresDir)) {
					const files = fs.readdirSync(loresDir);
					const guildFiles = files.filter(file => file.startsWith(`${guildId}_`) && file.endsWith('.js'));
					if (guildFiles.length > 0) {
						const randomFile = guildFiles[Math.floor(Math.random() * guildFiles.length)];
						filePath = `${loresDir}/${randomFile}`;
					}
				}
			} catch (err) {
				consoleLog(`[WARNING] Failed to scan lores directory for fallback: `, err);
			}
		}
	}
	
	const rawSnippets = loadSafeModule(filePath, null);
	if (!rawSnippets || rawSnippets.length === 0) {
		return [getLocText(interaction, 'replyLoreSnippetsUnavailable', {}, locales)];
	}
	return rawSnippets;
}

function removeDuplicateLoreInFiles(loresDir) {
	if (!fs.existsSync(loresDir)) {
		consoleLog(`[${getTimestamp()}] Lores directory not found: '${loresDir}'`);
		return { success: false, modifiedFilesCount: 0 };
	}
	
	const files = fs.readdirSync(loresDir).filter(file => file.endsWith('.js'));
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
				consoleLog(`[${getTimestamp()}] [Lore Cleanup] Removed ${snippets.length - uniqueSnippets.length} duplicate(s) from file '${file}'.`);
			}
		} catch (err) {
			consoleLog(`[${getTimestamp()}] Failed to process lore file '${file}':`, err);
		}
	}
	
	if (modifiedFilesCount > 0) {
		consoleLog(`[${getTimestamp()}] [Lore Cleanup] Successfully cleaned duplicates across ${modifiedFilesCount} file(s).`);
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
	if (typeof args[0] === 'string' && args.length > 1) {
		args[0] = args[0].replace(/%/g, '%%');
	}
	
	if (!rl || typeof rl.prompt !== 'function') {
		if (rl !== undefined) args = [rl, ...args];
		rl = defaultRl;
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

function getFormattedDate() {
	const now = new Date();
	const day = String(now.getUTCDate()).padStart(2, '0');
	const month = String(now.getUTCMonth() + 1).padStart(2, '0');
	const year = now.getUTCFullYear();
	return `${year}-${month}-${day}`; // Format for sorting: "YYYY-MM-DD".
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
	const logMessage = `[${getTimestamp()}] [Command Used] '/${interaction.commandName}' was executed by @${interaction.user.tag} (${interaction.user.id})`;
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
		
		let cleanMessage = normalized
			.replace(/\n{3,}/g, '\n\n')
			.trim();
		
		if (!cleanMessage) return;
		
		const trailingBreaks = (normalized.match(/\s*$/)[0].match(/\n/g) || []).length;
		
		if (!TIMESTAMP_PREFIX_REGEX.test(cleanMessage)) {
			cleanMessage = `[${getTimestamp()}] ${cleanMessage}`;
		}
		
		cleanMessage += '\n'.repeat(Math.min(trailingBreaks, 2));
		
		appendToLog(cleanMessage);
	} catch (err) {
		if (!logWriteWarned) {
			logWriteWarned = true;
			try { consoleLog(`[LOGGER] Failed to write to log file: ${err.message}`); } catch (e) {}
		}
	}
}

function cleanOldLogs() {
	try {
		if (!fs.existsSync(logsDir)) return;
		const cutoff = Date.now() - LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000;
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
			consoleLog(`[${getTimestamp()}] [Logger] Removed ${removed} log file(s) older than ${LOG_RETENTION_DAYS} days.`);
		}
	} catch (err) {
		consoleLog(`[${getTimestamp()}] [Logger] Failed to clean old logs: `, err.message);
	}
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

		if (logState.size > 0 && logState.size + bytes > LOG_MAX_FILE_BYTES) {
			logState.part++;
			logState.size = null;
			continue;
		}

		fs.appendFileSync(filePath, data, 'utf8');
		logState.size += bytes;
		return;
	}
}

function writeCenteredLog(title, width = 40) {
	const padding = Math.max(0, Math.floor((width - title.length) / 2));
	const line = '-'.repeat(width);

	writeLogToFile(line, { raw: true });
	writeLogToFile(`${' '.repeat(padding)}${title}`, { raw: true });
	writeLogToFile(line, { raw: true });
}

function readLoreFileStrict(filePath) {
	if (!fs.existsSync(filePath)) return [];
	const absolutePath = require.resolve(filePath);
	delete require.cache[absolutePath];
	const mod = require(absolutePath);
	if (!Array.isArray(mod)) {
		throw new Error(`Lore file '${path.basename(filePath)}' does not export an array.`);
	}
	return mod.map(s => String(s));
}

function serializeLore(snippets) {
	return `module.exports = ${JSON.stringify(snippets, null, '\t')};\n`;
}

function exceedsLoreLimit(snippets) {
	return Buffer.byteLength(serializeLore(snippets), 'utf8') > LORE_MAX_FILE_BYTES;
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

function setupPlayerEvents(guildId, player, voiceConnections, guildPlayers, guildVolumes, currentVolume) {
	const { AudioPlayerStatus } = require('@discordjs/voice');
	const isCurrent = () => guildPlayers.get(guildId)?.player === player;

	player.on(AudioPlayerStatus.Idle, () => {
		if (!isCurrent()) return;
		guildPlayers.delete(guildId);
		saveVoiceState(voiceConnections, guildPlayers, guildVolumes, resolveVolume(currentVolume));
	});

	player.on('error', err => {
		consoleLog(`[${getTimestamp()}] Audio player error in guild '${guildId}': `, err.message);
		if (!isCurrent()) return;
		guildPlayers.delete(guildId);
		saveVoiceState(voiceConnections, guildPlayers, guildVolumes, resolveVolume(currentVolume));
	});
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
				const vol = guildVolumes.has(guildId) ? guildVolumes.get(guildId) : currentVolume;
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
		consoleLog(`[${getTimestamp()}] [Voice] Failed to save voice state: `, err.message);
	}
}

async function restoreVoiceState(client, voiceConnections, guildVolumes, guildPlayers, currentVolume) {
	try {
		if (!fs.existsSync(voiceStateFile)) return;
		const data = JSON.parse(fs.readFileSync(voiceStateFile, 'utf8'));
		fs.unlinkSync(voiceStateFile);

		consoleLog(`[${getTimestamp()}] [Voice] Restoring previous voice states...`);

		const { joinVoiceChannel, VoiceConnectionStatus, AudioPlayerStatus, createAudioPlayer, createAudioResource, StreamType } = require('@discordjs/voice');
		const { spawn } = require('child_process');

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
				attachConnectionHandlers(connection, guild.id, voiceConnections, guildPlayers);
				voiceConnections.set(guild.id, connection);
				consoleLog(`[${getTimestamp()}] [Voice] Rejoined voice channel '${channel.name}' in guild ID '${guildId}'.`);

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

					const ffmpegProcess = spawn('ffmpeg', ffmpegArgs, { stdio: ['ignore', 'pipe', 'ignore'] });
					const killFfmpeg = () => { try { ffmpegProcess.kill('SIGKILL'); } catch (e) {} };
					ffmpegProcess.on('error', (err) => {
						consoleLog(`[${getTimestamp()}] [Voice] Could not run ffmpeg to resume '${stateData.playingSound}': `, err.message);
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
					consoleLog(`[${getTimestamp()}] [Voice] Resumed audio playback for '${stateData.playingSound}'.`);
				}
			} catch (err) {
				consoleLog(`[${getTimestamp()}] [Voice] Failed to restore voice state for guild ID '${guildId}': `, err.message);
			}
		}
	} catch (err) {
		consoleLog(`[${getTimestamp()}] [Voice] Failed to restore voice state: `, err.message);
	}
}

function saveVolumes(guildVolumes, currentVolume = 1.0) {
	try {
		const data = { global: currentVolume, guilds: Object.fromEntries(guildVolumes) };
		fs.mkdirSync(dataDir, { recursive: true });
		fs.writeFileSync(volumesFile, `${JSON.stringify(data, null, '\t')}\n`, 'utf8');
	} catch (err) {
		consoleLog(`[${getTimestamp()}] [Voice] Failed to save volumes: `, err.message);
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
		consoleLog(`[${getTimestamp()}] [Voice] Failed to load volumes: `, err.message);
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
	const soundName = String(name ?? '').replace(/\.mp3$/i, '');
	if (!soundName || /[\\/\0]/.test(soundName)) return null;
	const resolvedDir = path.resolve(soundsDir);
	const filePath = path.resolve(resolvedDir, `${soundName}.mp3`);
	return path.dirname(filePath) === resolvedDir ? filePath : null;
}

function attachConnectionHandlers(connection, guildId, voiceConnections, guildPlayers) {
	const { VoiceConnectionStatus, entersState } = require('@discordjs/voice');

	connection.on('error', (err) => {
		consoleLog(`[${getTimestamp()}] Voice connection error: `, err.message);
		try { connection.destroy(); } catch (e) {}
	});

	connection.on(VoiceConnectionStatus.Disconnected, async () => {
		try {
			await Promise.race([
				entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
				entersState(connection, VoiceConnectionStatus.Connecting, 5_000)
			]);
		} catch (err) {
			if (connection.state.status !== VoiceConnectionStatus.Destroyed) {
				try { connection.destroy(); } catch (e) {}
			}
		}
	});

	connection.on(VoiceConnectionStatus.Destroyed, () => {
		if (voiceConnections.get(guildId) === connection) {
			voiceConnections.delete(guildId);
			guildPlayers.delete(guildId);
		}
	});
}

async function joinVoice(channel, voiceConnections, guildPlayers) {
	const { joinVoiceChannel, VoiceConnectionStatus, entersState } = require('@discordjs/voice');
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
	attachConnectionHandlers(connection, guildId, voiceConnections, guildPlayers);

	try {
		await entersState(connection, VoiceConnectionStatus.Ready, 15_000);
	} catch (err) {
		const lastStatus = connection.state.status;
		if (lastStatus !== VoiceConnectionStatus.Destroyed) {
			try { connection.destroy(); } catch (e) {}
		}
		throw new Error(`Could not join '${channel.name}' (stuck at '${lastStatus}'). Check the bot's View/Connect permissions.`);
	}

	voiceConnections.set(guildId, connection);
	return connection;
}

async function shutdown(client, voiceConnections, guildPlayers, rl, guildVolumes, currentVolume = 1.0, exitCode = 0) {
	if (isExiting) return;
	isExiting = true;
	
	consoleLog(`\n[${getTimestamp()}] Shutting down the bot safely...`);
	
	try {
		rl.close();
		
		if (voiceConnections.size > 0 || guildPlayers.size > 0) {
			try {
				if (fs.existsSync(voiceStateFile)) {
					try { fs.unlinkSync(voiceStateFile); } catch (err) {}
				}

				saveVoiceState(voiceConnections, guildPlayers, guildVolumes, currentVolume);
				consoleLog(`[${getTimestamp()}] Leaving voice channels...`);
				for (const [guildId, connection] of voiceConnections.entries()) {
					try {
						connection.destroy();
					} catch (err) {}
				}
				voiceConnections.clear();
				consoleLog(`[${getTimestamp()}] Successfully left all voice channels.`);
				
				await new Promise(resolve => setTimeout(resolve, 1000));
			} catch (err) {
				consoleLog(`[${getTimestamp()}] Failed to leave voice channels: `, err);
			}
		}
		
		if (client.ws) client.ws.destroy();
		await client.destroy();
	} catch (err) {
		consoleLog(err);
	} finally {
		writeCenteredLog(`End of the session`);
		try { if (process.stdin.isTTY) process.stdin.setRawMode(false); } catch (err) {}
		process.exit(exitCode);
	}
}

async function restart(client, voiceConnections, guildPlayers, rl, scriptFilename, guildVolumes, currentVolume = 1.0, exitCode = 0) {
	if (isExiting) return;
	isExiting = true;

	consoleLog(`\n[${getTimestamp()}] Restarting the bot safely...`);
	
	try {
		rl.close();
		
		if (voiceConnections.size > 0 || guildPlayers.size > 0) {
			try {
				if (fs.existsSync(voiceStateFile)) {
					try { fs.unlinkSync(voiceStateFile); } catch (err) {}
				}

				saveVoiceState(voiceConnections, guildPlayers, guildVolumes, currentVolume);
				consoleLog(`[${getTimestamp()}] Leaving voice channels...`);
				for (const [guildId, connection] of voiceConnections.entries()) {
					try {
						connection.destroy();
					} catch (err) {}
				}
				voiceConnections.clear();
				consoleLog(`[${getTimestamp()}] Successfully left all voice channels.`);
				
				await new Promise(resolve => setTimeout(resolve, 1000));
			} catch (err) {
				consoleLog(`[${getTimestamp()}] Failed to leave voice channels: `, err);
			}
		}
		
		if (client.ws) client.ws.destroy();
		await client.destroy();
	} catch (err) {
		consoleLog(err);
	} finally {
		consoleLog(`[${getTimestamp()}] Triggering restart...`);
		
		// Touch the main script file so nodemon detects a "file change" and restarts cleanly.
		try {
			const time = new Date();
			fs.utimesSync(scriptFilename || __filename, time, time);
		} catch (err) {
			// Fallback if touching fails.
		}
		
		writeCenteredLog(`End of the session`);
		try { if (process.stdin.isTTY) process.stdin.setRawMode(false); } catch (err) {}
		process.exit(exitCode);
	}
}

async function loginWithRetry(client, attempt = 1) {
	try {
		await client.login(process.env.DISCORD_TOKEN);
	} catch (err) {
		consoleLog(`[${getTimestamp()}] Login failed (attempt ${attempt}): ${err.message}`);
		if (FATAL_LOGIN_ERRORS.includes(err.code) || attempt >= 10) {
			consoleLog(`[${getTimestamp()}] Giving up after ${attempt} attempt(s).`);
			writeCenteredLog("End of the session");
			process.exit(1);
			return;
		}
		
		const delayMs = Math.min(60000, 5000 * attempt);
		consoleLog(`[${getTimestamp()}] Retrying login in ${delayMs / 1000}s...`);
		setTimeout(() => loginWithRetry(client, attempt + 1), delayMs);
	}
}

module.exports = {
	loadSafeModule, getCmdText, getLocText, getLocalizedLoreSnippets, removeDuplicateLoreInFiles, setupGlobalMessageSanitizer,
	consoleLog, getTimestamp, formatUptime, makeLogMessage, safeReply, getFormattedDate, writeLogToFile, writeCenteredLog, setLogReadline,
	isWhitelist, isWhitelistNot, isAuthorizedTesterNot, isAdminManageServer, isGuildNot, isVoiceNot,
	saveVoiceState, restoreVoiceState, loadVolumes,
	readLoreFileStrict, writeLoreFile, exceedsLoreLimit, LORE_MAX_FILE_BYTES,
	getLoreFilePath, getSoundFilePath, joinVoice, setupPlayerEvents,
	shutdown, restart, loginWithRetry
};
