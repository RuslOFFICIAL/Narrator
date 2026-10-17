// Dependencies.
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { MessageFlags, TextChannel, DMChannel, ThreadChannel } = require('discord.js');
const voiceStateFile = path.join(__dirname, '../voice-state.json');

// Functions.
function loadSafeModule(filePath, fallbackValue) {
	try {
		const absolutePath = require.resolve(filePath);
		delete require.cache[absolutePath];
		return require(absolutePath);
	} catch (e) {
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
		text = text.replace(new RegExp(`\\{${varName}\\}`, 'g'), value);
	}
	return text;
}

function getLocalizedLoreSnippets(interaction, locales, defaultLang) {
	const guildId = interaction.guildId || 'default';
	const loresDir = path.join(__dirname, '../lores');
	
	// Get the user's language code from Discord (e.g.: 'uk', 'en-US', etc.)
	const userLocale = interaction.locale ? interaction.locale.split('-')[0] : 'en';
	let filePath = `${loresDir}/${guildId}_${userLocale}.js`;
	
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
		const payload = typeof replyOptions === 'string' ? { content: replyOptions } : replyOptions;
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp(replyOptions);
        } else {
            await interaction.reply(replyOptions);
        }
    } catch (error) {
        // Ignore "Unknown interaction" (10062) or "Interaction has already been acknowledged" (40060).
        if (error.code === 10062 || error.code === 40060) {
            return;
        }
        throw error;
    }
}

function consoleLog(rl, ...args) {
	readline.clearLine(process.stdout, 0);
	readline.cursorTo(process.stdout, 0);
	console.log(...args);
	
	try {
		rl.prompt(true);
	} catch (err) {
		// Readline is closed.
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

async function isAuthorizedTester(interaction, CONFIG, locales) {
	if (!CONFIG.authorizedTesters.includes(interaction.user.id)) {
		await safeReply(interaction, {
			content: getLocText(interaction, 'replyAuthorizedTester', {}, locales),
			flags: [MessageFlags.Ephemeral]
		});
		return false;
	}
	return true;
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

function saveVoiceState(voiceConnections) {
	try {
		const activeChannels = {};
		for (const [guildId, connection] of voiceConnections.entries()) {
			// Get the channel ID from the connection payload.
			const channelId = connection.joinConfig.channelId;
			if (channelId) {
				activeChannels[guildId] = channelId;
			}
		}
		
		const fileContent = `${JSON.stringify(activeChannels, null, 2)}\n`;
		fs.writeFileSync(voiceStateFile, fileContent, 'utf8');
	} catch (error) {
		// Ignore or log error.
	}
}

async function restoreVoiceState(client, voiceConnections) {
	try {
		if (!fs.existsSync(voiceStateFile)) return;
		const data = JSON.parse(fs.readFileSync(voiceStateFile, 'utf8'));
		fs.unlinkSync(voiceStateFile);

		const { joinVoiceChannel, VoiceConnectionStatus } = require('@discordjs/voice');

		for (const [guildId, channelId] of Object.entries(data)) {
			try {
				const guild = client.guilds.cache.get(guildId);
				if (!guild) continue;
				const channel = guild.channels.cache.get(channelId);
				if (!channel) continue;

				const connection = joinVoiceChannel({
					channelId: channel.id,
					guildId: guild.id,
					adapterCreator: guild.voiceAdapterCreator,
				});

				voiceConnections.set(guild.id, connection);
				connection.on('stateChange', (oldState, newState) => {
					if (newState.status === VoiceConnectionStatus.Disconnected) {
						voiceConnections.delete(guild.id);
					}
				});
			} catch (e) {
				// Skip if unable to rejoin a specific guild/channel.
			}
		}
	} catch (error) {
		// Ignore.
	}
}

async function shutdown(client, voiceConnections, rl) {
	console.log(`\n[${getTimestamp()}] Shutting down the bot safely...`);
	
	try {
		rl.close();
		
		if (voiceConnections.size > 0) {
			try {
				saveVoiceState(voiceConnections);
				console.log(`[${getTimestamp()}] Leaving voice channels...`);
				for (const [guildId, connection] of voiceConnections.entries()) {
					connection.destroy();
				}
				voiceConnections.clear();
				consoleLog(`[${getTimestamp()}] Successfully left all voice channels.`);
				
				await new Promise(resolve => setTimeout(resolve, 1000));
			} catch (error) {
				consoleLog(`[${getTimestamp()}] Failed to leave voice channels: `, error);
			}
		}
		
		if (client.ws) client.ws.destroy();
		await client.destroy();
	} catch (error) {
		console.log(error);
	} finally {
		console.log("Press 'Ctrl+C' or close the window to end process.");
		process.exit(0);
	}
}

async function restart(client, voiceConnections, rl, scriptFilename) {
	console.log(`\n[${getTimestamp()}] Restarting the bot safely...`);
	
	try {
		rl.close();
		
		if (voiceConnections.size > 0) {
			try {
				saveVoiceState(voiceConnections);
				console.log(`[${getTimestamp()}] Leaving voice channels...`);
				for (const [guildId, connection] of voiceConnections.entries()) {
					connection.destroy();
				}
				voiceConnections.clear();
				consoleLog(`[${getTimestamp()}] Successfully left all voice channels.`);
				
				await new Promise(resolve => setTimeout(resolve, 1000));
			} catch (error) {
				consoleLog(`[${getTimestamp()}] Failed to leave voice channels: `, error);
			}
		}
		
		if (client.ws) client.ws.destroy();
		await client.destroy();
	} catch (error) {
		console.log(error);
	} finally {
		console.log(`[${getTimestamp()}] Triggering restart...`);
		
		// Touch the current script file so nodemon detects a "file change" and restarts cleanly.
		try {
			const time = new Date();
			fs.utimesSync(__filename, time, time);
		} catch (err) {
			// Fallback if touching fails.
		}
		process.exit(0);
	}
}

async function loginWithRetry(client, attempt = 1) {
	try {
		await client.login(process.env.DISCORD_TOKEN);
	} catch (error) {
		consoleLog(`[${getTimestamp()}] Login failed (attempt ${attempt}): ${error.message}`);
		if (attempt >= 10) {
			consoleLog(`[${getTimestamp()}] Giving up after ${attempt} attempts.`);
			return;
		}
		
		const delayMs = Math.min(60000, 5000 * attempt);
		consoleLog(`[${getTimestamp()}] Retrying login in ${delayMs / 1000}s...`);
		setTimeout(() => loginWithRetry(attempt + 1), delayMs);
	}
}

module.exports = {
	loadSafeModule, getCmdText, getLocText,	getLocalizedLoreSnippets,
	consoleLog, getTimestamp, formatUptime, makeLogMessage, safeReply,
	isWhitelist, isWhitelistNot, isAuthorizedTester, isGuildNot, isVoiceNot, restoreVoiceState,
	shutdown, restart, loginWithRetry, setupGlobalMessageSanitizer
};
