// Dependencies.
const { SlashCommandBuilder, InteractionContextType, ApplicationIntegrationType, ChannelType, MessageFlags, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');

// Variables.
const loresDir = path.join(__dirname, '../lores');

function getCommands(CONFIG, getCmdText) {
	return [
		// setContexts: 0 (Guild), 1 (Bot DM), 2 (Group DMs and Friend DMs).
		// setIntegrationTypes: 0 (Guild Install), 1 (User Install).
		
		new SlashCommandBuilder().setName('help').setDescription(getCmdText('descHelp'))
			.setContexts([0, 1, 2]).setIntegrationTypes([0, 1]),
		
		new SlashCommandBuilder().setName('info').setDescription(getCmdText('descInfo'))
			.setContexts([0, 1, 2]).setIntegrationTypes([0, 1]),
		
		new SlashCommandBuilder().setName('lore').setDescription(getCmdText('descLore'))
			.setContexts([0]).setIntegrationTypes([0]),
		
		new SlashCommandBuilder().setName('lore-list').setDescription(getCmdText('descLoreList'))
			.setContexts([0]).setIntegrationTypes([0])
			.addStringOption(option => option.setName('language_code').setDescription(getCmdText('optionLanguageCode')).setRequired(false)),
		
		new SlashCommandBuilder().setName('lore-create').setDescription(getCmdText('descLoreCreate'))
			.setContexts([0]).setIntegrationTypes([0])
			.addStringOption(option => option.setName('language_code').setDescription(getCmdText('optionLanguageCode')).setRequired(true))
			.addStringOption(option => option.setName('snippet').setDescription(getCmdText('optionSnippet')).setRequired(true)),
		
		new SlashCommandBuilder().setName('lore-remove').setDescription(getCmdText('descLoreRemove'))
			.setContexts([0]).setIntegrationTypes([0])
			.addStringOption(option => option.setName('language_code').setDescription(getCmdText('optionLanguageCode')).setRequired(true))
			.addIntegerOption(option => option.setName('snippet_number').setDescription(getCmdText('optionSnippetNumber')).setRequired(true)),
		
		new SlashCommandBuilder().setName('lottery-kick').setDescription(getCmdText('descLotteryKick').replace('{kickChance}', CONFIG.kickChance))
			.setContexts([0]).setIntegrationTypes([0]),
		
		new SlashCommandBuilder().setName('voice-join').setDescription(getCmdText('descVoiceJoin'))
			.setContexts([0]).setIntegrationTypes([0])
			.addChannelOption(option => option.setName('channel').setDescription(getCmdText('optionChannel')).addChannelTypes(ChannelType.GuildVoice).setRequired(true)),
		
		new SlashCommandBuilder().setName('voice-leave').setDescription(getCmdText('descVoiceLeave'))
			.setContexts([0]).setIntegrationTypes([0]),
		
		new SlashCommandBuilder().setName('soundboard-play').setDescription(getCmdText('descSoundboardPlay'))
			.setContexts([0]).setIntegrationTypes([0])
			.addStringOption(option => option.setName('sound').setDescription(getCmdText('optionSound')).setRequired(true).setAutocomplete(true)),
		
		new SlashCommandBuilder().setName('soundboard-stop').setDescription(getCmdText('descSoundboardStop'))
			.setContexts([0]).setIntegrationTypes([0]),
		
		new SlashCommandBuilder().setName('soundboard-volume').setDescription(getCmdText('descSoundboardVolume'))
			.setContexts([0]).setIntegrationTypes([0])
			.addIntegerOption(option => option.setName('level').setDescription(getCmdText('optionVolumeLevel')).setMinValue(0).setMaxValue(100).setRequired(true))
	].map(command => command.toJSON());
}

async function handleDiscordInteraction(interaction, context) {
	const { 
		isBotReady, CONFIG, getLocText, getLocalizedLoreSnippets, packageJson,
		consoleLog, getTimestamp, makeLogMessage, safeReply,
		voiceConnections, guildVolumes, guildPlayers, currentVolume,
		isWhitelist, isWhitelistNot, isAuthorizedTester, isGuildNot, isVoiceNot
	} = context;

	if (!isBotReady) {
		if (interaction.isChatInputCommand()) {
			await safeReply(interaction, {
				content: getLocText(interaction, 'replyBotLoading'),
				flags: [MessageFlags.Ephemeral]
			});
		}
		return;
	}
	
	if (interaction.isAutocomplete()) {
		if (interaction.commandName === 'soundboard-play') {
			try {
				if (!fs.existsSync('./sounds')) {
					return;
				}
				const files = fs.readdirSync('./sounds');
				const choices = files
					.filter(file => file.endsWith('.mp3'))
					.map(file => file.replace('.mp3', ''));
				
				const focusedValue = interaction.options.getFocused();
				const filtered = choices.filter(choice => choice.toLowerCase().includes(focusedValue.toLowerCase()));
				
				if (!interaction.responded) {
					await interaction.respond(
						filtered.slice(0, 25).map(choice => ({ name: choice, value: choice }))
					);
				}
			} catch (error) {
				if (error.code !== 10062 && error.code !== 40060) {
					consoleLog(`Error handling soundboard autocomplete: `, error);
				}
			}
		}
		return;
	}
	
	if (!interaction.isChatInputCommand()) return;
	
	try {
		switch (interaction.commandName) {
			case 'help': {
				await commandHelp(interaction, context);
				break;
			}
			
			case 'info': {
				await commandInfo(interaction, context);
				break;
			}
			
			case 'lore': {
				await commandLore(interaction, context);
				break;
			}
			
			case 'lore-list': {
				await commandLoreList(interaction, context);
				break;
			}
			
			case 'lore-create': {
				await commandLoreCreate(interaction, context);
				break;
			}
			
			case 'lore-remove': {
				await commandLoreRemove(interaction, context);
				break;
			}
			
			case 'lottery-kick': {
				await commandLotteryKick(interaction, context);
				break;
			}
			
			case 'voice-join': {
				await commandVoiceJoin(interaction, context);
				break;
			}
			
			case 'voice-leave': {
				await commandVoiceLeave(interaction, context);
				break;
			}
			
			case 'soundboard-play': {
				await commandSoundboardPlay(interaction, context);
				break;
			}
			
			case 'soundboard-stop': {
				await commandSoundboardStop(interaction, context);
				break;
			}
			
			case 'soundboard-volume': {
				await commandSoundboardVolume(interaction, context);
				break;
			}
			
		}
	} catch (error) {
		consoleLog(`[${getTimestamp()}] Interaction handling error: `, error);
	}
}

// Discord commands.
async function commandHelp(interaction, { CONFIG, getLocText, makeLogMessage, safeReply, consoleLog, getTimestamp }) {
	try {
		makeLogMessage(interaction);
		
		const HELP_TEXT = getLocText(interaction, 'helpText', { kickChance: CONFIG.kickChance });
		await safeReply(interaction, HELP_TEXT);
	} catch (error) {
		consoleLog(`[${getTimestamp()}] Failed to execute command [/${interaction.commandName}] :`, error);
		await safeReply(interaction, { content: getLocText(interaction, 'replyCommandError', { commandName: `/${interaction.commandName}` }), flags: [MessageFlags.Ephemeral] });
	}
}

async function commandInfo(interaction, { CONFIG, getLocText, removeDuplicateLoreInFiles, makeLogMessage, safeReply, consoleLog, getTimestamp, packageJson }) {
	try {
		makeLogMessage(interaction);
		
		const INFO_TEXT = getLocText(interaction, 'infoText');
		await safeReply(interaction, { content: `Narrator | ${packageJson.version}\n\n${INFO_TEXT}`, flags: [MessageFlags.Ephemeral] });
	} catch (error) {
		consoleLog(`[${getTimestamp()}] Failed to execute command [/${interaction.commandName}] : `, error);
		await safeReply(interaction, { content: getLocText(interaction, 'replyCommandError', { commandName: `/${interaction.commandName}` }), flags: [MessageFlags.Ephemeral] });
	}
}

async function commandLore(interaction, { getLocalizedLoreSnippets, getLocText, removeDuplicateLoreInFiles, makeLogMessage, safeReply, consoleLog, getTimestamp, isGuildNot }) {
	try {
		if (await isGuildNot(interaction)) return;

		makeLogMessage(interaction);
		
		removeDuplicateLoreInFiles(loresDir);
		const loreSnippets = getLocalizedLoreSnippets(interaction);
		
		// Check if snippets are unavailable.
		const unavailableKey = getLocText(interaction, 'replyLoreSnippetsUnavailable');
		if (loreSnippets.length === 1 && loreSnippets[0] === unavailableKey) {
			await safeReply(interaction, { content: unavailableKey, flags: [MessageFlags.Ephemeral] });
			return;
		}
		
		const randomIndex = Math.floor(Math.random() * loreSnippets.length);
		const safeSnippet = String(loreSnippets[randomIndex]);
		
		const replyText = getLocText(interaction, 'replyLore', { loreSnippet: safeSnippet });
		await safeReply(interaction, replyText);
	} catch (error) {
		consoleLog(`[${getTimestamp()}] Failed to execute command [/${interaction.commandName}] : `, error);		
		await safeReply(interaction, { content: getLocText(interaction, 'replyCommandError', { commandName: `/${interaction.commandName}` }), flags: [MessageFlags.Ephemeral] });
	}
}

async function commandLoreList(interaction, { getLocText, removeDuplicateLoreInFiles, makeLogMessage, safeReply, consoleLog, getTimestamp, loadSafeModule, isGuildNot, isAdminManageServer }) {
	try {
		if (await isGuildNot(interaction)) return;
		if (await isAdminManageServer(interaction)) return;
		makeLogMessage(interaction);
		
		removeDuplicateLoreInFiles(loresDir);
		const guildId = interaction.guildId;
		const langArg = interaction.options.getString('language_code');
		
		if (!fs.existsSync(loresDir)) {
			await safeReply(interaction, { content: getLocText(interaction, 'replyLoreSnippetsUnavailable'), flags: [MessageFlags.Ephemeral] });
			return;
		}
		
		const files = fs.readdirSync(loresDir).filter(file => file.endsWith('.js'));
		let matchingFiles = files.filter(file => file.startsWith(`${guildId}_`));
		
		if (langArg) {
			matchingFiles = matchingFiles.filter(file => file === `${guildId}_${langArg}.js`);
		}
		
		if (matchingFiles.length === 0) {
			await safeReply(interaction, { content: getLocText(interaction, 'replyLoreSnippetsUnavailable'), flags: [MessageFlags.Ephemeral] });
			return;
		}
		
		let outputLines = [];
		for (const file of matchingFiles) {
			const lang = file.replace(`${guildId}_`, '').replace('.js', '');
			const snippets = loadSafeModule(path.join(loresDir, file), []);
			if (snippets.length > 0) {
				outputLines.push(getLocText(interaction, 'replyLoreListLanguage', { lang }));
				snippets.forEach((s, idx) => outputLines.push(`> ${idx + 1}. ${String(s)}`));
			}
		}
		
		const responseText = outputLines.length > 0 ? outputLines.join('\n') : getLocText(interaction, 'replyLoreSnippetsUnavailable');
		await safeReply(interaction, { content: responseText, flags: [MessageFlags.Ephemeral] });
	} catch (error) {
		consoleLog(`[${getTimestamp()}] Failed to execute command [/${interaction.commandName}] : `, error);
		await safeReply(interaction, { content: getLocText(interaction, 'replyCommandError', { commandName: `/${interaction.commandName}` }), flags: [MessageFlags.Ephemeral] });
	}
}

async function commandLoreCreate(interaction, { getLocText, removeDuplicateLoreInFiles, makeLogMessage, safeReply, consoleLog, getTimestamp, loadSafeModule, isGuildNot, isAdminManageServer }) {
	try {
		if (await isGuildNot(interaction)) return;
		if (await isAdminManageServer(interaction)) return;
		
		makeLogMessage(interaction);
		
		const guildIdArg = interaction.guildId || 'default';
		const langArg = interaction.options.getString('language_code');
		const snippetText = interaction.options.getString('snippet');
		
		if (!fs.existsSync(loresDir)) {
			fs.mkdirSync(loresDir, { recursive: true });
		}

		const filePath = path.join(loresDir, `${guildIdArg}_${langArg}.js`);
		let existingSnippets = [];
		
		if (fs.existsSync(filePath)) {
			try {
				const fileData = fs.readFileSync(filePath, 'utf8');
				// Extract array portion from "module.exports = [...]"
				const match = fileData.match(/\[([\s\S]*)\]/);
				if (match) {
					// Evaluate or parse safely
					existingSnippets = eval(`[${match[1]}]`);
				}
			} catch (e) {
				existingSnippets = [];
			}
		}
		
		existingSnippets.push(snippetText);
		const fileContent = `module.exports = ${JSON.stringify(existingSnippets, null, '\t')};\n`;

		fs.writeFileSync(filePath, fileContent, 'utf8');
		try {
			delete require.cache[require.resolve(filePath)];
		} catch (e) {}
		removeDuplicateLoreInFiles(loresDir);
		
		consoleLog(`[${getTimestamp()}] Success: Added snippet via Discord to '${filePath}'`);
		await safeReply(interaction, { content: getLocText(interaction, 'replyLoreCreateSuccess', { guildId: guildIdArg, lang: langArg }), flags: [MessageFlags.Ephemeral] });
	} catch (error) {
		consoleLog(`[${getTimestamp()}] Failed to execute command [/${interaction.commandName}] : `, error);
		await safeReply(interaction, { content: getLocText(interaction, 'replyCommandError', { commandName: `/${interaction.commandName}` }), flags: [MessageFlags.Ephemeral] });
	}
}

async function commandLoreRemove(interaction, { getLocText, removeDuplicateLoreInFiles, makeLogMessage, safeReply, consoleLog, getTimestamp, loadSafeModule, isGuildNot, isAdminManageServer }) {
	try {
		if (await isGuildNot(interaction)) return;
		if (await isAdminManageServer(interaction)) return;
		makeLogMessage(interaction);
		
		const guildId = interaction.guildId;
		const langArg = interaction.options.getString('language_code');
		const snippetNumber = interaction.options.getInteger('snippet_number');
		
		const filePath = path.join(loresDir, `${guildId}_${langArg}.js`);
		if (!fs.existsSync(filePath)) {
			await safeReply(interaction, { content: getLocText(interaction, 'replyLoreSnippetsUnavailable'), flags: [MessageFlags.Ephemeral] });
			return;
		}
		
		let snippets = loadSafeModule(filePath, []);
		
		if (snippetNumber > 0 && snippetNumber <= snippets.length) {
			snippets.splice(snippetNumber - 1, 1);
			
			if (snippets.length === 0) {
				fs.unlinkSync(filePath);
			} else {
				const fileContent = `module.exports = ${JSON.stringify(snippets, null, '\t')};\n`;
				fs.writeFileSync(filePath, fileContent, 'utf8');
			}
			
			try { delete require.cache[require.resolve(filePath)]; } catch (e) {}
			removeDuplicateLoreInFiles(loresDir);
			
			consoleLog(`[${getTimestamp()}] Success: Removed snippet #${snippetNumber} from '${guildId}_${langArg}.js' via Discord`);
			await safeReply(interaction, { content: getLocText(interaction, 'replyLoreRemoveSuccess', { number: snippetNumber }), flags: [MessageFlags.Ephemeral] });
		} else {
			await safeReply(interaction, { content: getLocText(interaction, 'replyLoreRemoveNotFound', { number: snippetNumber }), flags: [MessageFlags.Ephemeral] });
		}
	} catch (error) {
		consoleLog(`[${getTimestamp()}] Failed to execute command [/${interaction.commandName}] : `, error);
		await safeReply(interaction, { content: getLocText(interaction, 'replyCommandError', { commandName: `/${interaction.commandName}` }), flags: [MessageFlags.Ephemeral] });
	}
}

async function commandLotteryKick(interaction, { CONFIG, getLocText, makeLogMessage, safeReply, consoleLog, getTimestamp, isWhitelist, isGuildNot }) {
	try {
		if (await isWhitelist(interaction)) return;
		if (await isGuildNot(interaction)) return;
		makeLogMessage(interaction);
		
		const roll = Math.floor(Math.random() * 100) + 1;
		if (roll <= CONFIG.kickChance) {
			const kickMsg = getLocText(interaction, 'replyLotteryKickYes', { userId: interaction.user.id });
			await safeReply(interaction, kickMsg);
			await new Promise(resolve => setTimeout(resolve, 30000));
			try {
				const invite = await interaction.channel.createInvite({ maxAge: 86400, maxUses: 1, unique: true });
				const dmMsg = getLocText(interaction, 'replyLotteryKickDm', { inviteCode: invite.code });
				await interaction.user.send(dmMsg);
				const reasonMsg = getLocText(interaction, 'replyLotteryKickReason');
				await interaction.member.kick(reasonMsg);
			} catch (err) {
				consoleLog(`[${getTimestamp()}] ERROR: Couldn't kick user @${interaction.user.tag} or send DM.`);
				const errorKick = getLocText(interaction, 'replyLotteryKickError', { userId: interaction.user.id });
				await interaction.followUp({ content: errorKick, flags: [MessageFlags.Ephemeral] });
			}
		} else {
			const noKickMsg = getLocText(interaction, 'replyLotteryKickNo', { userId: interaction.user.id });
			await safeReply(interaction, noKickMsg);
		}
	} catch (error) {
		consoleLog(`[${getTimestamp()}] Failed to execute command [/${interaction.commandName}] : `, error);
		await safeReply(interaction, { content: getLocText(interaction, 'replyCommandError', { commandName: `/${interaction.commandName}` }), flags: [MessageFlags.Ephemeral] });
	}
}

async function commandVoiceJoin(interaction, { getLocText, makeLogMessage, safeReply, consoleLog, getTimestamp, isWhitelistNot, isGuildNot, voiceConnections, guildPlayers, guildVolumes, currentVolume }) {
	try {
		if (await isWhitelistNot(interaction)) return;
		if (await isGuildNot(interaction)) return;
		makeLogMessage(interaction);
		
		const optionChannel = interaction.options.getChannel('channel');
		if (!optionChannel) {
			await safeReply(interaction, { content: getLocText(interaction, 'replyVoiceNotFound', { channelId: 'unknown' }), flags: [MessageFlags.Ephemeral] });
			return;
		}
		const { joinVoiceChannel, VoiceConnectionStatus } = require('@discordjs/voice');
		
		const connection = joinVoiceChannel({
			channelId: optionChannel.id,
			guildId: optionChannel.guild.id,
			adapterCreator: optionChannel.guild.voiceAdapterCreator,
		});
		connection.on('error', (error) => {
			consoleLog(`[${getTimestamp()}] Voice connection error: `, error.message);
			try {
				connection.destroy();
			} catch (e) {}
		});
		
		voiceConnections.set(optionChannel.guild.id, connection);
		connection.on('stateChange', (oldState, newState) => {
			if (newState.status === VoiceConnectionStatus.Disconnected) {
				voiceConnections.delete(optionChannel.guild.id);
			}
		});
		saveVoiceState(voiceConnections, guildPlayers, guildVolumes, currentVolume);
		
		consoleLog(`[${getTimestamp()}] Successfully joined the voice channel '${optionChannel.name}' (${optionChannel.id}) by @${interaction.user.tag} (${interaction.user.id})`);
		await safeReply(interaction, { content: getLocText(interaction, 'replyVoiceJoinSuccess', { channelName: optionChannel.name }), flags: [MessageFlags.Ephemeral] });
	} catch (error) {
		consoleLog(`[${getTimestamp()}] Failed to execute command [/${interaction.commandName}] : `, error);
		await safeReply(interaction, { content: getLocText(interaction, 'replyCommandError', { commandName: `/${interaction.commandName}` }), flags: [MessageFlags.Ephemeral] });
	}
}

async function commandVoiceLeave(interaction, { getLocText, makeLogMessage, safeReply, consoleLog, getTimestamp, isWhitelistNot, isGuildNot, isVoiceNot, voiceConnections, guildPlayers, guildVolumes, currentVolume }) {
	try {
		if (await isWhitelistNot(interaction)) return;
		if (await isGuildNot(interaction)) return;
		if (await isVoiceNot(interaction)) return;
		makeLogMessage(interaction);
		
		const connection = voiceConnections.get(interaction.guildId);
		if (connection) {
			connection.destroy();
		}
		voiceConnections.delete(interaction.guildId);
		guildPlayers.delete(interaction.guildId);
		saveVoiceState(voiceConnections, guildPlayers, guildVolumes, currentVolume);
		
		consoleLog(`[${getTimestamp()}] Successfully left voice channel for guild ID '${interaction.guildId}' by @${interaction.user.tag} (${interaction.user.id})`);
		await safeReply(interaction, { content: getLocText(interaction, 'replyVoiceLeaveSuccess'), flags: [MessageFlags.Ephemeral] });
	} catch (error) {
		consoleLog(`[${getTimestamp()}] Failed to execute command [/${interaction.commandName}] : `, error);
		await safeReply(interaction, { content: getLocText(interaction, 'replyCommandError', { commandName: `/${interaction.commandName}` }), flags: [MessageFlags.Ephemeral] });
	}
}

async function commandSoundboardPlay(interaction, { getLocText, makeLogMessage, safeReply, consoleLog, getTimestamp, isWhitelistNot, isGuildNot, isVoiceNot, voiceConnections, guildVolumes, guildPlayers, currentVolume }) {
	try {
		if (await isWhitelistNot(interaction)) return;
		if (await isGuildNot(interaction)) return;
		if (await isVoiceNot(interaction)) return;
		makeLogMessage(interaction);
		
		const soundChoice = interaction.options.getString('sound');
		const soundPath = `./sounds/${soundChoice}.mp3`;
		if (!fs.existsSync(soundPath)) {
			await safeReply(interaction, { content: getLocText(interaction, 'replySoundboardPlayNotFound'), flags: [MessageFlags.Ephemeral] });
			return;
		}
		
		const connection = voiceConnections.get(interaction.guildId);
		if (!connection) {
			await safeReply(interaction, { content: getLocText(interaction, 'replyNotInVoice'), flags: [MessageFlags.Ephemeral] });
			return;
		}
		
		const { createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');
		consoleLog(`[${getTimestamp()}] Played sound '${soundChoice}' for guild ID '${interaction.guildId}'.`);
		await safeReply(interaction, { content: getLocText(interaction, 'replySoundboardPlayPlaying', { soundChoice }), flags: [MessageFlags.Ephemeral] });
		const player = createAudioPlayer();
		const resource = createAudioResource(soundPath, { inlineVolume: true });
		const volume = guildVolumes.get(interaction.guildId) ?? currentVolume;
		resource.volume.setVolume(volume);
		
		guildPlayers.set(interaction.guildId, {
			player,
			resource,
			soundName: soundChoice, 
			startTime: Date.now()
		});
		
		player.on(AudioPlayerStatus.Idle, () => {
			guildPlayers.delete(interaction.guildId);
			saveVoiceState(voiceConnections, guildPlayers, guildVolumes, currentVolume);
		});
		
		player.on('error', (error) => {
			consoleLog(`[${getTimestamp()}] Audio player error in guild '${interaction.guildId}': `, error.message);
			guildPlayers.delete(interaction.guildId);
			saveVoiceState(voiceConnections, guildPlayers, guildVolumes, currentVolume);
		});
		
		saveVoiceState(voiceConnections, guildPlayers, guildVolumes, currentVolume);
		connection.subscribe(player);
		player.play(resource);
	} catch (error) {
		consoleLog(`[${getTimestamp()}] Failed to execute command [/${interaction.commandName}] : `, error);
		await safeReply(interaction, { content: getLocText(interaction, 'replyCommandError', { commandName: `/${interaction.commandName}` }), flags: [MessageFlags.Ephemeral] });
	}
}

async function commandSoundboardStop(interaction, { getLocText, makeLogMessage, safeReply, consoleLog, getTimestamp, isWhitelistNot, isGuildNot, isVoiceNot, voiceConnections, guildPlayers, guildVolumes, currentVolume }) {
	try {
		if (await isWhitelistNot(interaction)) return;
		if (await isGuildNot(interaction)) return;
		if (await isVoiceNot(interaction)) return;
		makeLogMessage(interaction);
		
		const activeEntry = guildPlayers.get(interaction.guildId);
		if (activeEntry?.player) {
			activeEntry.player.stop();
			guildPlayers.delete(interaction.guildId);
		}
		saveVoiceState(voiceConnections, guildPlayers, guildVolumes, currentVolume);
		
		consoleLog(`[${getTimestamp()}] Stopped playback for guild ID '${interaction.guildId}'.`);
		await safeReply(interaction, { content: getLocText(interaction, 'replySoundboardStopSuccess'), flags: [MessageFlags.Ephemeral] });
	} catch (error) {
		consoleLog(`[${getTimestamp()}] Failed to execute command [/${interaction.commandName}] : `, error);
		await safeReply(interaction, { content: getLocText(interaction, 'replyCommandError', { commandName: `/${interaction.commandName}` }), flags: [MessageFlags.Ephemeral] });
	}
}

async function commandSoundboardVolume(interaction, { getLocText, makeLogMessage, safeReply, consoleLog, getTimestamp, isWhitelistNot, isGuildNot, guildVolumes, guildPlayers, currentVolume }) {
	try {
		if (await isGuildNot(interaction)) return;
		if (await isWhitelistNot(interaction)) return;
		makeLogMessage(interaction);
		
		const volumePercent = interaction.options.getInteger('level');
		const volume = volumePercent / 100;
		guildVolumes.set(interaction.guildId, volume);
		const activeEntry = guildPlayers.get(interaction.guildId);
		if (activeEntry?.resource?.volume) {
			try { activeEntry.resource.volume.setVolume(volume); } catch (e) {}
		}
		saveVoiceState(voiceConnections, guildPlayers, guildVolumes, currentVolume);
		
		consoleLog(`[${getTimestamp()}] Volume set to ${volumePercent}% for guild ID '${interaction.guildId}'.`);
		await safeReply(interaction, { content: getLocText(interaction, 'replySoundboardVolumeSuccess', { volume: volumePercent }), flags: [MessageFlags.Ephemeral] });
	} catch (error) {
		consoleLog(`[${getTimestamp()}] Failed to execute command [/${interaction.commandName}] : `, error);
		await safeReply(interaction, { content: getLocText(interaction, 'replyCommandError', { commandName: `/${interaction.commandName}` }), flags: [MessageFlags.Ephemeral] });
	}
}

module.exports = { getCommands, handleDiscordInteraction };
