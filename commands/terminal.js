// Dependencies.
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, VoiceConnectionStatus } = require('@discordjs/voice');

// Variables.
const loresDir = path.join(__dirname, '../lores');

async function handleTerminalLine(line, context) {
	const { 
		client, isBotReady, CONFIG, locales, defaultLang, packageJson,
		rawSnippetsEn, rawSnippetsUk, voiceConnections, 
		guildVolumes, guildPlayers, currentVolume, 
		consoleLog, getTimestamp, shutdown, restart, rl , loadSafeModule
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
			// Bot.
			case 'help':
				consoleLog(`[${getTimestamp()}] Commands:\nBOT:\n- help: Show terminal commands.\n- exit/stop/shutdown: Shut down the bot.\n- restart/reboot: Restart the bot.\n- status: Status of the bot.\n- ping: Check bot latency.\n- clear: Clear the terminal screen.\n\n
SERVER:\n- echo: Send a message to a specific channel by ID or edit a message by ID.\n- lore: Print a random lore snippet.\n- lore-create: Create lore file for a guild.\n- info: Show bot info and links.\n- voice-join: Connect bot to specified voice channel by ID.\n- voice-leave: Disconnect bot from voice channel.\n- soundboard-play: Play the specified soundboard audio.\n- soundboard-stop: Stop playing the soundboard audio.\n- soundboard-volume: Set playback volume (0-100).\n\n
Check command formats in file 'formats.md'.`);
				break;
			
			case 'exit':
			case 'stop':
			case 'shutdown':
				consoleLog(`[${getTimestamp()}] Stopping bot via terminal command...`);
				shutdown();
				return;
			
			case 'restart':
			case 'reboot':
				consoleLog(`[${getTimestamp()}] Restarting bot via terminal command...`);
				restart(); 
				break;
			
			case 'status':
				consoleLog(`[${getTimestamp()}] Status:\n- Bot is ready: ${isBotReady}\n- Logged in as: ${client.user ? client.user.tag : 'Not yet'}\n- Server count: ${client.guilds.cache.size}`);
				break;
			
			case 'ping':
				consoleLog(`[${getTimestamp()}] Pinging...`);
				exec('ping -n 1 8.8.8.8', (error, stdout) => {
					if (error) {
						consoleLog(`[${getTimestamp()}] Failed to execute ping.`);
					} else {
						const match = stdout.match(/time[=<](\d+ms)/i) || stdout.match(/рисует.*?(\d+ms)/i);
						const time = match ? match[1] : 'unknown';
						consoleLog(`[${getTimestamp()}] Pong! Network latency: ${time}`);
					}
					rl.prompt(true);
				});
				break;
			
			case 'clear':
				console.clear();
				break;
			
			// Server.
			case 'echo':
				if (args[1] === '-e') {
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
			
			case 'lore':
				if (!fs.existsSync(loresDir)) {
					consoleLog(`[${getTimestamp()}] Error: '${loresDir}' directory not found.`);
					break;
				}
				
				const allLoreFiles = fs.readdirSync(loresDir).filter(file => file.endsWith('.js'));
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
						// Format: lore [GUILD_ID] or lore [GUILD_ID] [LANG]
						requestedGuildId = args[1];
						if (args[2]) {
							requestedLang = args[2];
						}
					} else {
						// Format: lore [LANG]
						requestedLang = args[1];
					}
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
				const selectedSnippet = rawSnippets[randomSnippetIndex];
				
				// Determine template language with fallback.
				const templateLang = requestedLang || defaultLang;
				const loreTemplate = locales[templateLang]?.replyLore || locales[defaultLang]?.replyLore || locales['uk']?.replyLore || 'Lore: {loreSnippet}';
				
				consoleLog(`[${getTimestamp()}] [File: ${targetFile}] ${loreTemplate.replace(/\{loreSnippet\}/g, selectedSnippet)}`);
				break;
			
			case 'lore-create':
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
				const fileContent = `module.exports = [\n` + 
					existingSnippets.map(s => `\t\`${s.replace(/`/g, '\\`')}\``).join(',\n') + 
					`\n];\n`;

				try {
					fs.writeFileSync(filePath, fileContent, 'utf8');
					try {
						delete require.cache[require.resolve(filePath)];
					} catch (e) {}
					consoleLog(`[${getTimestamp()}] Success: Added snippet to '${filePath}'`);
				} catch (err) {
					consoleLog(`[${getTimestamp()}] Error writing lore file:`, err.message);
				}
				break;
			
			case 'info':
				const infoText = locales[defaultLang]?.infoText || locales['uk']?.infoText || 'Info text unavailable';
				consoleLog(`[${getTimestamp()}] Bot Info:\nNarrator | ${packageJson.version}\n\n${infoText}`);
				break;
			
			case 'voice-join':
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
				voiceConnections.set(targetChannel.guild.id, connection);
				consoleLog(`[${getTimestamp()}] Successfully joined voice channel: '${targetChannel.name}'`);
				break;

			case 'voice-leave':
				const leaveGuildId = args[1];
				if (!leaveGuildId) {
					for (const [gId, conn] of voiceConnections.entries()) conn.destroy();
					voiceConnections.clear();
					consoleLog(`[${getTimestamp()}] Left all voice channels.\n`);
					break;
				}
				const connToLeave = voiceConnections.get(leaveGuildId);
				if (connToLeave) {
					connToLeave.destroy();
					voiceConnections.delete(leaveGuildId);
					consoleLog(`[${getTimestamp()}] Left voice channel for guild ID '${leaveGuildId}'.`);
				}
				break;

			case 'soundboard-play':
				let playGuildId = null, rawTargetSound = '';
				if (args[1] && voiceConnections.has(args[1])) {
					playGuildId = args[1];
					rawTargetSound = args.slice(2).join(' ');
				} else {
					rawTargetSound = args.slice(1).join(' ');
				}
				const targetSound = rawTargetSound.replace('.mp3', '');
				const soundPath = `./sounds/${targetSound}.mp3`;
				if (!fs.existsSync(soundPath)) {
					consoleLog(`[${getTimestamp()}] Error: Sound file not found.`);
					break;
				}
				const guildsToPlay = playGuildId ? [playGuildId] : Array.from(voiceConnections.keys());
				for (const gId of guildsToPlay) {
					const conn = voiceConnections.get(gId);
					if (!conn) continue;
					const player = createAudioPlayer();
					const resource = createAudioResource(soundPath, { inlineVolume: true });
					resource.volume.setVolume(guildVolumes.get(gId) ?? currentVolume);
					guildPlayers.set(gId, { player, resource });
					conn.subscribe(player);
					player.play(resource);
				}
				consoleLog(`[${getTimestamp()}] Played sound '${targetSound}'.`);
				break;

			case 'soundboard-stop':
				for (const [gId, entry] of guildPlayers.entries()) entry?.player?.stop();
				guildPlayers.clear();
				consoleLog(`[${getTimestamp()}] Stopped playback.`);
				break;

			case 'soundboard-volume':
				const volumePercent = parseInt(args[args.length - 1], 10);
				if (isNaN(volumePercent) || volumePercent < 0 || volumePercent > 100) {
					consoleLog(`[${getTimestamp()}] Error: Invalid volume level (0-100).`);
					break;
				}
				const volume = volumePercent / 100;
				if (args.length >= 3) {
					guildVolumes.set(args[1], volume);
					guildPlayers.get(args[1])?.resource?.volume?.setVolume(volume);
				} else {
					currentVolume = volume;
				}
				consoleLog(`[${getTimestamp()}] Volume set to ${volumePercent}%.`);
				break;
			
			default:
				consoleLog(`[${getTimestamp()}] Unknown terminal command: "${command}".`);
				break;
		}
	}
	
	consoleLog();
	rl.prompt();
}

module.exports = { handleTerminalLine };