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
	if (typeof rl === 'string') {
		args = [rl, ...args];
		rl = null;
	}
	
	readline.clearLine(process.stdout, 0);
	readline.cursorTo(process.stdout, 0);
	console.log(...args);
	
	try {
		if (rl && typeof rl.prompt === 'function') {
			rl.prompt(true);
		}
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

function setupPlayerEvents(guildId, player, voiceConnections, guildPlayers, guildVolumes, currentVolume) {
	const { AudioPlayerStatus } = require('@discordjs/voice');
	player.on(AudioPlayerStatus.Idle, () => {
		guildPlayers.delete(guildId);
		saveVoiceState(voiceConnections, guildPlayers, guildVolumes, currentVolume);
	});
	
	player.on('error', error => {
		guildPlayers.delete(guildId);
		saveVoiceState(voiceConnections, guildPlayers, guildVolumes, currentVolume);
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

function saveVoiceState(voiceConnections, guildPlayers, guildVolumes, currentVolume = 1.0) {
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
					positionMs: playerEntry ? Date.now() - playerEntry.startTime : 0,
					volume: vol
				};
			}
		}
		
		const fileContent = `${JSON.stringify(activeChannels, null, '\t')}\n`;
		fs.writeFileSync(voiceStateFile, fileContent, 'utf8');
		
		if (Object.keys(activeChannels).length > 0) {
			consoleLog(`[${getTimestamp()}] [Voice] Voice state saved successfully (${Object.keys(activeChannels).length} active connection(s)).`);
		}
	} catch (error) {
		// Ignore or log error.
	}
}

async function restoreVoiceState(client, voiceConnections, guildVolumes, guildPlayers, currentVolume) {
	try {
		if (!fs.existsSync(voiceStateFile)) return;
		const data = JSON.parse(fs.readFileSync(voiceStateFile, 'utf8'));
		fs.unlinkSync(voiceStateFile);
		
		consoleLog(`[${getTimestamp()}] [Voice] Restoring previous voice states...`);

		const { joinVoiceChannel, VoiceConnectionStatus, createAudioPlayer, createAudioResource, StreamType } = require('@discordjs/voice');

		for (const [guildId, stateData] of Object.entries(data)) {
			try {
				const guild = client.guilds.cache.get(guildId);
				if (!guild) continue;
				
				// Support both old string format and new object format.
				const channelId = typeof stateData === 'string' ? stateData : stateData.channelId;
				const channel = guild.channels.cache.get(channelId);
				if (!channel) continue;
				
				if (typeof stateData === 'object' && stateData.volume !== null && stateData.volume !== undefined) {
					guildVolumes.get ? guildVolumes.set(guild.id, stateData.volume) : null;
				}

				const connection = joinVoiceChannel({
					channelId: channel.id,
					guildId: guild.id,
					adapterCreator: guild.voiceAdapterCreator,
				});

				voiceConnections.set(guild.id, connection);
				consoleLog(`[${getTimestamp()}] [Voice] Rejoined voice channel '${channel.name}' in guild ID '${guildId}'.`);
				
				connection.on('stateChange', (oldState, newState) => {
					if (newState.status === VoiceConnectionStatus.Disconnected) {
						voiceConnections.delete(guild.id);
						guildPlayers.delete(guild.id);
					}
				});
				
				// Restore playing sound if available.
				if (typeof stateData === 'object' && stateData.playingSound) {
					const soundPath = path.join(__dirname, `../sounds/${stateData.playingSound}.mp3`);
					if (fs.existsSync(soundPath)) {
						const player = createAudioPlayer();
						const seekSeconds = Math.max(0, Math.floor((stateData.positionMs || 0) / 1000));
						
						const { spawn } = require('child_process');
						const ffmpegArgs = [];
						
						if (seekSeconds > 0) {
							ffmpegArgs.push('-ss', String(seekSeconds), '-accurate_seek');
						}
						
						ffmpegArgs.push('-i', soundPath, '-analyzeduration', '0', '-loglevel', '0', '-f', 's16le', '-ar', '48000', '-ac', '2', 'pipe:1');
						const ffmpegProcess = spawn('ffmpeg', ffmpegArgs);
						
						// Explicitly specify StreamType.Raw so Discord parses the PCM stream correctly
						const resource = createAudioResource(ffmpegProcess.stdout, { 
							inlineVolume: true,
							inputType: StreamType.Raw,
							metadata: { title: stateData.playingSound }
						});

						const volume = guildVolumes.get(guild.id) ?? currentVolume;
						guildVolumes.set(guild.id, volume);
						resource.volume.setVolume(volume);
						
						guildPlayers.set(guild.id, { 
							player, 
							resource, 
							soundName: stateData.playingSound, 
							startTime: Date.now() - (stateData.positionMs || 0) 
						});
						
						player.on('error', err => {
							// Ignore ended resource errors on cleanup
						});

						if (connection.state.status === VoiceConnectionStatus.Ready) {
							connection.subscribe(player);
							try { player.play(resource); } catch (e) {}
						} else {
							connection.on(VoiceConnectionStatus.Ready, () => {
								connection.subscribe(player);
								try { player.play(resource); } catch (e) {}
							});
						}
						consoleLog(`[${getTimestamp()}] [Voice] Resumed audio playback for '${stateData.playingSound}'.`);
					}
				}
			} catch (e) {
				consoleLog(`[${getTimestamp()}] [Voice] Failed to restore voice state for guild ID '${guildId}': `, e.message);
			}
		}
	} catch (error) {
		// Ignore.
	}
}

async function shutdown(client, voiceConnections, guildPlayers, rl, guildVolumes, currentVolume = 1.0) {
	consoleLog(`\n[${getTimestamp()}] Shutting down the bot safely...`);
	
	try {
		rl.close();
		
		if (voiceConnections.size > 0 || guildPlayers.size > 0) {
			try {
				if (fs.existsSync(voiceStateFile)) {
					try { fs.unlinkSync(voiceStateFile); } catch (e) {}
				}

				saveVoiceState(voiceConnections, guildPlayers, guildVolumes, currentVolume);
				consoleLog(`[${getTimestamp()}] Leaving voice channels...`);
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
		consoleLog(error);
	} finally {
		consoleLog("Press 'Ctrl+C' or close the window to end process.");
		process.exit(0);
	}
}

async function restart(client, voiceConnections, guildPlayers, rl, scriptFilename, guildVolumes, currentVolume = 1.0) {
	consoleLog(`\n[${getTimestamp()}] Restarting the bot safely...`);
	
	try {
		rl.close();
		
		if (voiceConnections.size > 0 || guildPlayers.size > 0) {
			try {
				if (fs.existsSync(voiceStateFile)) {
					try { fs.unlinkSync(voiceStateFile); } catch (e) {}
				}

				saveVoiceState(voiceConnections, guildPlayers, guildVolumes, currentVolume);
				consoleLog(`[${getTimestamp()}] Leaving voice channels...`);
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
		consoleLog(error);
	} finally {
		consoleLog(`[${getTimestamp()}] Triggering restart...`);
		
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
	loadSafeModule, getCmdText, getLocText,	getLocalizedLoreSnippets, setupGlobalMessageSanitizer,
	consoleLog, getTimestamp, formatUptime, makeLogMessage, safeReply,
	isWhitelist, isWhitelistNot, isAuthorizedTester, isGuildNot, isVoiceNot,
	saveVoiceState, restoreVoiceState,
	shutdown, restart, loginWithRetry
};
