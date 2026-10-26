// Dependencies.
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { exec } = require('child_process');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, VoiceConnectionStatus, entersState } = require('@discordjs/voice');

// Variables.
const HELP_TEXT = `Commands:\n
BOT:
- help: Show terminal commands.
- exit/stop/shutdown: Shut down the bot.
- restart/reboot: Restart the bot.
- status: Status of the bot.
- ping: Check bot latency.
- clear: Clear the terminal screen.
\nSERVER:
- echo: Send a message to a specific channel by ID or edit a message by ID.
- info: Show bot info and links.
- lore: Print a random lore snippet.
- lore-list: Lists lore snippets.
- lore-create: Create lore file for a guild.
- lore-remove: Remove a specific lore snippet.
- voice-join: Connect bot to specified voice channel by ID.
- voice-leave: Disconnect bot from voice channel.
- soundboard-play: Play the specified soundboard audio.
- soundboard-stop: Stop playing the soundboard audio.
- soundboard-volume: Set playback volume (0-100).
\nCheck command formats in file 'formats.md'.`;

const loresDir = path.join(__dirname, '../lores');
const allLoreFiles = fs.readdirSync(loresDir).filter(file => file.endsWith('.js'));

async function handleTerminalLine(line, context) {
	const { 
		client, isBotReady, CONFIG, locales, defaultLang, packageJson,
		rawSnippetsEn, rawSnippetsUk, voiceConnections, 
		guildVolumes, guildPlayers, currentVolume, botStartTime, 
		consoleLog, getTimestamp, shutdown, restart, rl , loadSafeModule,
		formatUptime, saveVoiceState, removeDuplicateLoreInFiles
	} = context;

	const trimmedLine = line.trim();
	if (!trimmedLine) {
		rl.prompt();
		return;
	}
	
	const subCommands = trimmedLine.split('&').map(cmd => cmd.trim()).filter(Boolean);
	
	for (const subCmd of subCommands) {
		const args = subCmd.split(' ');
		const command = args[0].toLowerCase();
		
		// Terminal commands.
		switch (command) {
			default: {
				consoleLog(`[${getTimestamp()}] Unknown terminal command: "${command}".`);
				break;
			}
			
			// Bot.
			case 'help': {
				consoleLog(`[${getTimestamp()}] ${HELP_TEXT}`);
				break;
			}
			
			case 'status': {
				const uptimeMs = Date.now() - botStartTime;
				const uptimeFormatted = formatUptime(uptimeMs);
				consoleLog(`[${getTimestamp()}] Status:\n- Bot is ready: ${isBotReady}\n- Logged in as: ${client.user ? client.user.tag : 'Not yet'}\n- Uptime: ${uptimeFormatted}\n- Server count: ${client.guilds.cache.size}`);
				break;
			}
			
			case 'ping': {
				consoleLog(`[${getTimestamp()}] Pinging...`);
				const pingCmd = process.platform === 'win32' ? 'ping -n 1 8.8.8.8' : 'ping -c 1 -W 3 8.8.8.8';
				exec(pingCmd, (error, stdout) => {
					if (error) {
						consoleLog(`[${getTimestamp()}] Failed to execute ping.`);
					} else {
						const match = stdout.match(/time[=<]\s*([\d.]+)\s*ms/i);
						const time = match ? `${match[1]}ms` : 'unknown';
						consoleLog(`[${getTimestamp()}] Pong! Network latency: ${time}`);
					}
					rl.prompt(true);
				});
				break;
			}
			
			case 'clear': {
				console.clear();
				break;
			}
			
			case 'exit':
			case 'stop':
			case 'shutdown': {
				consoleLog(`[${getTimestamp()}] Stopping bot via terminal command...`);
				shutdown(client, voiceConnections, guildPlayers, rl, currentVolume);
				return;
			}
			
			case 'restart':
			case 'reboot': {
				consoleLog(`[${getTimestamp()}] Restarting bot via terminal command...`);
				restart(client, voiceConnections, guildPlayers, rl, __filename, currentVolume); 
				break;
			}
			
			// Server.
			case 'echo': {
				if (args[1] === '-e') {
					// Edit Message: echo -e [CHANNEL_ID] [EDITED_TEXT]
					const messageId = args[2];
					const newText = args.slice(3).join(' ').replace(/\\n/g, '\n');
					if (!messageId || !newText) {
						consoleLog(`[${getTimestamp()}] Error: Please provide a message ID and new text.`);
						break;
					}
					let targetMessage = null, targetChannel = null;
					for (const [guildId, guild] of client.guilds.cache) {
						for (const [channelId, channel] of guild.channels.cache) {
							if (channel.isTextBased()) {
								try {
									const fetchedMsg = await channel.messages.fetch(messageId);
									if (fetchedMsg) { targetMessage = fetchedMsg; targetChannel = channel; break; }
								} catch (e) {}
							}
						}
						if (targetMessage) break;
					}
					if (!targetMessage) {
						consoleLog(`[${getTimestamp()}] Error: Could not find message with ID '${messageId}'.`);
						break;
					}
					await targetMessage.edit(newText);
					consoleLog(`[${getTimestamp()}] Message successfully edited in channel #${targetChannel.name}.`);
				} else {
					// Send Message: echo [CHANNEL_ID] [MESSAGE]
					const channelId = args[1];
					const messageText = args.slice(2).join(' ').replace(/\\n/g, '\n');
					if (!channelId || !messageText) {
						consoleLog(`[${getTimestamp()}] Error: Please provide a channel ID and a message.`);
						break;
					}
					let targetEchoChannel = null;
					for (const [guildId, guild] of client.guilds.cache) {
						const channel = guild.channels.cache.get(channelId);
						if (channel) { targetEchoChannel = channel; break; }
					}
					if (!targetEchoChannel || !targetEchoChannel.isTextBased()) {
						consoleLog(`[${getTimestamp()}] Error: Could not find text channel with ID '${channelId}'.`);
						break;
					}
					await targetEchoChannel.send(messageText);
					consoleLog(`[${getTimestamp()}] Message successfully sent to channel #${targetEchoChannel.name}.`);
				}
				break;
			}
			
			case 'info': {
				const infoText = locales[defaultLang]?.infoText || locales['uk']?.infoText || 'Info text unavailable';
				consoleLog(`[${getTimestamp()}] Bot Info:\nNarrator | ${packageJson.version}\n\n${infoText}`);
				break;
			}
			
			case 'lore': {
				if (!fs.existsSync(loresDir)) {
					consoleLog(`[${getTimestamp()}] Error: '${loresDir}' directory not found.`);
					break;
				}
				
				removeDuplicateLoreInFiles(loresDir);
				
				if (allLoreFiles.length === 0) {
					consoleLog(`[${getTimestamp()}] No guild lore files found in '${loresDir}'.`);
					break;
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
						consoleLog(`[${getTimestamp()}] Error: No non-empty lore files found for guild ID '${requestedGuildId}'.`);
						break;
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
						consoleLog(`[${getTimestamp()}] Error: All lore files across all guilds in './lores' are empty.`);
						break;
					}
				}

				// Pick a random snippet from the chosen file.
				const randomSnippetIndex = Math.floor(Math.random() * rawSnippets.length);
				const selectedSnippet = String(rawSnippets[randomSnippetIndex]);
				
				// Determine template language with fallback.
				const templateLang = requestedLang || defaultLang;
				const loreTemplate = locales[templateLang]?.replyLore || locales[defaultLang]?.replyLore || locales['uk']?.replyLore || 'Lore: {loreSnippet}';
				
				consoleLog(`[${getTimestamp()}] [File: '${targetFile}'] ${loreTemplate.replace(/\{loreSnippet\}/g, () => selectedSnippet)}`);
				break;
			}
			
			case 'lore-list': {
				if (!fs.existsSync(loresDir)) {
					consoleLog(`[${getTimestamp()}] Error: '${loresDir}' directory not found.`);
					break;
				}
				
				removeDuplicateLoreInFiles(loresDir);
				
				if (allLoreFiles.length === 0) {
					consoleLog(`[${getTimestamp()}] No lore files found.`);
					break;
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
					} else {
						if (targetLang) {
							// Specific guild and language: lore-list [GUILD_ID] [LANGUAGE]
							selectedFiles = [`${targetGuildId}_${targetLang}.js`];
						} else {
							// Specific guild: lore-list [GUILD_ID]
							selectedFiles = allLoreFiles.filter(f => f.startsWith(`${targetGuildId}_`));
						}
					}
				}

				if (selectedFiles.length === 0) {
					consoleLog(`[${getTimestamp()}] No lore files matched the criteria.`);
					break;
				}
				
				let hasEntries = false;
				consoleLog(`[${getTimestamp()}] Lore Listing:`);
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
					consoleLog(`[${getTimestamp()}] Error: No lores found.`);
				}
				
				break;
			}
			
			case 'lore-create': {
				// Usage: lore-create [GUILD_ID] [LANGUAGE] [LORE_SNIPPET]
				const guildIdArg = args[1];
				const langArg = args[2];
				const snippetText = args.slice(3).join(' ');

				if (!guildIdArg || !langArg || !snippetText) {
					consoleLog(`[${getTimestamp()}] Error: Usage -> lore-create [GUILD_ID] [LANGUAGE] [LORE_SNIPPET]`);
					break;
				}

				if (!fs.existsSync(loresDir)) {
					fs.mkdirSync(loresDir, { recursive: true });
				}

				const filePath = path.join(loresDir, `${guildIdArg}_${langArg}.js`);
				let existingSnippets = [];

				if (fs.existsSync(filePath)) {
					try {
						delete require.cache[require.resolve(filePath)];
					} catch (e) {}
					existingSnippets = loadSafeModule(filePath, []);
				}
				
				existingSnippets.push(snippetText);
				const fileContent = `module.exports = ${JSON.stringify(existingSnippets, null, '\t')};\n`;

				try {
					fs.writeFileSync(filePath, fileContent, 'utf8');
					try {
						delete require.cache[require.resolve(filePath)];
					} catch (e) {}
					removeDuplicateLoreInFiles(loresDir);
					
					consoleLog(`[${getTimestamp()}] Success: Added snippet to '${filePath}'`);
				} catch (err) {
					consoleLog(`[${getTimestamp()}] Error writing lore file:`, err.message);
				}
				break;
			}
			
			case 'lore-remove': {
				// Usage: lore-remove [GUILD_ID] [LANGUAGE] [SNIPPET_NUMBER]
				const removeGuildId = args[1];
				const removeLang = args[2];
				const removeIndex = parseInt(args[3], 10);

				if (!removeGuildId || !removeLang || isNaN(removeIndex)) {
					consoleLog(`[${getTimestamp()}] Error: Usage -> lore-remove [GUILD_ID] [LANGUAGE] [SNIPPET_NUMBER]`);
					break;
				}

				if (!fs.existsSync(loresDir)) {
					consoleLog(`[${getTimestamp()}] Error: '${loresDir}' directory not found.`);
					break;
				}

				const filePath = path.join(loresDir, `${removeGuildId}_${removeLang}.js`);
				if (!fs.existsSync(filePath)) {
					consoleLog(`[${getTimestamp()}] Error: Lore file for guild ID '${removeGuildId}' and language '${removeLang}' not found.`);
					break;
				}

				let snippets = loadSafeModule(filePath, []);
				
				if (removeIndex > 0 && removeIndex <= snippets.length) {
					snippets.splice(removeIndex - 1, 1);

					if (snippets.length === 0) {
						fs.unlinkSync(filePath);
					} else {
						const fileContent = `module.exports = ${JSON.stringify(snippets, null, '\t')};\n`;
						fs.writeFileSync(filePath, fileContent, 'utf8');
					}

					try { delete require.cache[require.resolve(filePath)]; } catch (e) {}
					removeDuplicateLoreInFiles(loresDir);

					consoleLog(`[${getTimestamp()}] Success: Removed snippet #${removeIndex} from '${removeGuildId}_${removeLang}.js' via terminal.`);
				} else {
					consoleLog(`[${getTimestamp()}] Error: Snippet number #${removeIndex} not found in '${removeGuildId}_${removeLang}.js'.`);
				}
				break;
			}
			
			case 'voice-join': {
				// Usage: voice-join [CHANNEL_ID]
				const targetChannelId = args[1];
				if (!targetChannelId) {
					consoleLog(`[${getTimestamp()}] Error: Please provide a voice channel ID.`);
					break;
				}
				let targetChannel = null;
				for (const [guildId, guild] of client.guilds.cache) {
					const channel = guild.channels.cache.get(targetChannelId);
					if (channel) { targetChannel = channel; break; }
				}
				if (!targetChannel) {
					consoleLog(`[${getTimestamp()}] Error: Voice channel not found.`);
					break;
				}
				
				const connection = joinVoiceChannel({
					channelId: targetChannel.id,
					guildId: targetChannel.guild.id,
					adapterCreator: targetChannel.guild.voiceAdapterCreator,
				});
				connection.on('error', (error) => {
					consoleLog(`[${getTimestamp()}] Voice connection error: `, error.message);
					try {
						connection.destroy();
					} catch (e) {}
				});
				
				try {
					await entersState(connection, VoiceConnectionStatus.Ready, 15_000);
				} catch (err) {
					const lastStatus = connection.state.status;
					if (lastStatus !== VoiceConnectionStatus.Destroyed) connection.destroy();
					voiceConnections.delete(targetChannel.guild.id);
					saveVoiceState(voiceConnections, guildPlayers, guildVolumes, currentVolume);
					consoleLog(`[${getTimestamp()}] Error: Could not join '${targetChannel.name}' (stuck at '${lastStatus}'). Check the bot's View/Connect permissions.`);
					break;
				}
				voiceConnections.set(targetChannel.guild.id, connection);
				saveVoiceState(voiceConnections, guildPlayers, guildVolumes, currentVolume);
				
				consoleLog(`[${getTimestamp()}] Successfully joined voice channel: '${targetChannel.name}'`);
				break;
			}

			case 'voice-leave': {
				const leaveGuildId = args[1];
				if (!leaveGuildId) {
					// Global: voice-leave
					for (const [gId, conn] of voiceConnections.entries()) {
						try {
							conn.destroy();
						} catch (e) {}
					}
					voiceConnections.clear();
					saveVoiceState(voiceConnections, guildPlayers, guildVolumes, currentVolume);
					
					consoleLog(`[${getTimestamp()}] Left all voice channels.\n`);
					break;
				}
				
				const connToLeave = voiceConnections.get(leaveGuildId);
				if (connToLeave) {
					// Specific Guild: voice-leave [GUILD_ID]
					try {
						connToLeave.destroy();
					} catch (e) {}
					voiceConnections.delete(leaveGuildId);
					saveVoiceState(voiceConnections, guildPlayers, guildVolumes, currentVolume);
					
					consoleLog(`[${getTimestamp()}] Left voice channel for guild ID '${leaveGuildId}'.`);
				}
				break;
			}

			case 'soundboard-play': {
				let playGuildId = null, rawTargetSound = '';
				if (args[1] && voiceConnections.has(args[1])) {
					// Global: soundboard-play [SOUND_NAME]
					playGuildId = args[1];
					rawTargetSound = args.slice(2).join(' ');
				} else {
					// Specific Guild: soundboard-play [GUILD_ID] [SOUND_NAME]
					rawTargetSound = args.slice(1).join(' ');
				}
				const targetSound = rawTargetSound.replace('.mp3', '');
				const soundPath = `./sounds/${targetSound}.mp3`;
				if (!fs.existsSync(soundPath)) {
					consoleLog(`[${getTimestamp()}] Error: Sound file not found.`);
					break;
				}
				
				const guildsToPlay = playGuildId ? [playGuildId] : Array.from(voiceConnections.keys());
				if (guildsToPlay.length === 0) {
					consoleLog(`[${getTimestamp()}] Error: Bot is not connected to any voice channels.`);
					break;
				}
								
				for (const gId of guildsToPlay) {
					const conn = voiceConnections.get(gId);
					if (!conn) continue;
					const player = createAudioPlayer();
					const resource = createAudioResource(soundPath, { inlineVolume: true });
					resource.volume.setVolume(guildVolumes.get(gId) ?? currentVolume);
					
					guildPlayers.set(gId, { 
						player, 
						resource, 
						soundName: targetSound, 
						startTime: Date.now() 
					});
					
					player.on(AudioPlayerStatus.Idle, () => {
						guildPlayers.delete(gId);
						saveVoiceState(voiceConnections, guildPlayers, guildVolumes, currentVolume);
					});

					player.on('error', error => {
						guildPlayers.delete(gId);
						saveVoiceState(voiceConnections, guildPlayers, guildVolumes, currentVolume);
					});
					
					if (conn.state.status === VoiceConnectionStatus.Ready) {
						conn.subscribe(player);
						player.play(resource);
					} else {
						conn.on(VoiceConnectionStatus.Ready, () => {
							conn.subscribe(player);
							player.play(resource);
						});
					}
					
					player.on('error', error => {
						consoleLog(`[${getTimestamp()}] Audio player error in guild ${gId}:`, error.message);
					});
				}
				saveVoiceState(voiceConnections, guildPlayers, guildVolumes, currentVolume);
				
				consoleLog(`[${getTimestamp()}] Played sound '${targetSound}'.`);
				break;
			}

			case 'soundboard-stop': {
				const stopGuildId = args[1];
				if (stopGuildId) {
					// Specific Guild: soundboard-stop [GUILD_ID]
					const entry = guildPlayers.get(stopGuildId);
					if (entry) {
						entry.player.stop();
						guildPlayers.delete(stopGuildId);
						saveVoiceState(voiceConnections, guildPlayers, guildVolumes, currentVolume);
						
						consoleLog(`[${getTimestamp()}] Stopped playback for guild ID '${stopGuildId}'.`);
					} else {
						consoleLog(`[${getTimestamp()}] Error: No active playback found for guild ID '${stopGuildId}'.`);
					}
				} else {
					// Global: soundboard-stop
					for (const [gId, entry] of guildPlayers.entries()) {
						entry?.player?.stop();
					}
					guildPlayers.clear();
					saveVoiceState(voiceConnections, guildPlayers, guildVolumes, currentVolume);
					
					consoleLog(`[${getTimestamp()}] Stopped playback on all guilds.`);
				}
				break;
			}

			case 'soundboard-volume': {
				if (args.length === 2) {
					// Global: soundboard-volume [VOLUME]
					const volumePercent = parseInt(args[1], 10);
					if (isNaN(volumePercent) || volumePercent < 0 || volumePercent > 100) {
						consoleLog(`[${getTimestamp()}] Error: Invalid volume level (0-100).`);
						break;
					}
					const volume = volumePercent / 100;
					context.currentVolume = volume;
					
					for (const [gId, entry] of guildPlayers.entries()) {
						guildVolumes.set(gId, volume);
						if (entry?.resource?.volume) {
							try { entry.resource.volume.setVolume(volume); } catch (e) {}
						}
					}
					for (const gId of voiceConnections.keys()) {
						guildVolumes.set(gId, volume);
					}
					saveVoiceState(voiceConnections, guildPlayers, guildVolumes, currentVolume);
					
					consoleLog(`[${getTimestamp()}] Volume set to ${volumePercent}% on all guilds.`);
				} else if (args.length >= 3) {
					// Specific Guild: soundboard-volume [GUILD_ID] [VOLUME]
					const guildId = args[1];
					const volumePercent = parseInt(args[2], 10);
					if (isNaN(volumePercent) || volumePercent < 0 || volumePercent > 100) {
						consoleLog(`[${getTimestamp()}] Error: Invalid volume level (0-100).`);
						break;
					}
					const volume = volumePercent / 100;
					guildVolumes.set(guildId, volume);
					
					const entry = guildPlayers.get(guildId);
					if (entry?.resource?.volume) {
						try { entry.resource.volume.setVolume(volume); } catch (e) {}
					}
					saveVoiceState(voiceConnections, guildPlayers, guildVolumes, currentVolume);
					
					consoleLog(`[${getTimestamp()}] Volume set to ${volumePercent}% for guild ID '${guildId}'.`);
				} else {
					consoleLog(`[${getTimestamp()}] Error: Usage -> soundboard-volume [VOLUME] or soundboard-volume [GUILD_ID] [VOLUME]`);
				}
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

// Tab completion.
const TERMINAL_COMMANDS = [
	'help', 'status', 'ping', 'clear',
	'exit', 'stop', 'shutdown', 'restart', 'reboot',
	'echo', 'info',
	'lore', 'lore-list', 'lore-create', 'lore-remove',
	'voice-join', 'voice-leave',
	'soundboard-play', 'soundboard-stop', 'soundboard-volume'
];
 
function completeTerminalLine(line, { client, locales, voiceConnections, guildPlayers, loadSafeModule }) {
	const [cmd, ...args] = line.slice(line.lastIndexOf('&') + 1).trimStart().split(' ');
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
	const sounds = () => names(path.join(__dirname, '../sounds'), '.mp3');
 
	const slots = (...fns) => (a) => fns[a.length - 1]?.(a) ?? [];
 
	const completers = {
		__proto__: null,
		'echo': slots(() => ['-e', ...channels(c => c.isTextBased())]),
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
				const filePath = path.join(loresDir, `${guild}_${lang}.js`);
				const snippets = loadSafeModule(filePath, []);
				return Array.from({ length: snippets.length }, (_, i) => String(i + 1));
			}
		),
		'voice-join': slots(() => channels(c => c.isVoiceBased() && c.joinable)), // Only channels the bot can actually join.
		'voice-leave': slots(() => keys(voiceConnections)),
		'soundboard-stop': slots(() => keys(guildPlayers)),
		'soundboard-volume': slots(guilds, ([g]) => client.guilds.cache.has(g) ? ['0', '25', '50', '75', '100'] : []),
		'soundboard-play': (a) => {
			partial = a.slice(a.length > 1 && voiceConnections.has(a[0]) ? 1 : 0).join(' ');
			return a.length === 1 ? [...keys(voiceConnections), ...sounds()] : sounds();
		},
	};
 
	const candidates = args.length ? completers[cmd.toLowerCase()]?.(args) ?? [] : TERMINAL_COMMANDS.map(c => `${c} `); // Trailing space ready for arguments.
	const needle = partial.toLowerCase();
	return [[...new Set(candidates)].filter(c => c.toLowerCase().startsWith(needle)), partial];
}

module.exports = { handleTerminalLine, completeTerminalLine };
