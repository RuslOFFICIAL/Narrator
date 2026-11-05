// Dependencies.
const { SlashCommandBuilder, ChannelType, MessageFlags, AttachmentBuilder } = require('discord.js');
const { createAudioPlayer, createAudioResource, VoiceConnectionStatus } = require('@discordjs/voice');
const isIgnorableInteractionError = (err) => err?.code === 10062 || err?.code === 40060;
const fs = require('fs');
const path = require('path');

// Variables.
const loresDir = path.join(__dirname, '../lores');
const soundsDir = path.join(__dirname, '../sounds');

function getCommands(CONFIG, getCmdText) {
	return [
		// setContexts: 0 (Guild), 1 (Bot DM), 2 (Group DMs and Friend DMs).
		// setIntegrationTypes: 0 (Guild Install), 1 (User Install).
		
		new SlashCommandBuilder().setName('help').setDescription(getCmdText('descHelp'))
			.setContexts([0, 1, 2]).setIntegrationTypes([0, 1]),
		
		new SlashCommandBuilder().setName('info').setDescription(getCmdText('descInfo'))
			.setContexts([0, 1, 2]).setIntegrationTypes([0, 1]),
		
		new SlashCommandBuilder().setName('lottery-kick').setDescription(getCmdText('descLotteryKick').replace('{kickChance}', CONFIG.kickChance))
			.setContexts([0]).setIntegrationTypes([0]),
		
		new SlashCommandBuilder().setName('lore').setDescription(getCmdText('descLore'))
			.setContexts([0]).setIntegrationTypes([0]),
		
		new SlashCommandBuilder().setName('lore-list').setDescription(getCmdText('descLoreList'))
			.setContexts([0]).setIntegrationTypes([0])
			.addStringOption(option => option.setName('language_code').setDescription(getCmdText('optionLanguageCode')).setMaxLength(10).setRequired(false)),
		
		new SlashCommandBuilder().setName('lore-create').setDescription(getCmdText('descLoreCreate'))
			.setContexts([0]).setIntegrationTypes([0])
			.addStringOption(option => option.setName('language_code').setDescription(getCmdText('optionLanguageCode')).setMaxLength(10).setRequired(true))
			.addStringOption(option => option.setName('snippet').setDescription(getCmdText('optionSnippet')).setMaxLength(1000).setRequired(true)),
		
		new SlashCommandBuilder().setName('lore-remove').setDescription(getCmdText('descLoreRemove'))
			.setContexts([0]).setIntegrationTypes([0])
			.addStringOption(option => option.setName('language_code').setDescription(getCmdText('optionLanguageCode')).setMaxLength(10).setRequired(true))
			.addIntegerOption(option => option.setName('snippet_number').setDescription(getCmdText('optionSnippetNumber')).setRequired(true)),
		
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
		isBotReady, getLocText,
		consoleLog, makeLogMessage, getTimestamp, safeReply
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
				if (!fs.existsSync(soundsDir)) {
					return;
				}
				const files = fs.readdirSync(soundsDir);
				const choices = files
					.filter(file => file.endsWith('.mp3'))
					.map(file => file.slice(0, -'.mp3'.length));
				
				const focusedValue = interaction.options.getFocused();
				const filtered = choices.filter(choice => choice.toLowerCase().includes(focusedValue.toLowerCase()));
				
				if (!interaction.responded) {
					await interaction.respond(
						filtered.slice(0, 25).map(choice => ({ name: choice, value: choice }))
					);
				}
			} catch (err) {
				if (err.code !== 10062 && err.code !== 40060) {
					consoleLog(`[${getTimestamp()}] Error handling soundboard autocomplete: `, err);
				}
			}
		}
		return;
	}
	
	if (!interaction.isChatInputCommand()) return;
	makeLogMessage(interaction);
	
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
			
			case 'lottery-kick': {
				await commandLotteryKick(interaction, context);
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
	} catch (err) {
		if (isIgnorableInteractionError(err)) return;
		consoleLog(`[${getTimestamp()}] Interaction handling error: `, err);
	}
}

// Discord commands.
async function commandHelp(interaction, { CONFIG, getLocText, safeReply, consoleLog, getTimestamp }) {
	try {
		const HELP_TEXT = getLocText(interaction, 'helpText', { kickChance: CONFIG.kickChance });
		await safeReply(interaction, HELP_TEXT);
	} catch (err) {
		if (isIgnorableInteractionError(err)) return;
		consoleLog(`[${getTimestamp()}] Failed to execute command [/${interaction.commandName}] :`, err);
		await safeReply(interaction, { content: getLocText(interaction, 'replyCommandError', { commandName: `/${interaction.commandName}` }), flags: [MessageFlags.Ephemeral] });
	}
}

async function commandInfo(interaction, { getLocText, safeReply, consoleLog, getTimestamp, packageJson }) {
	try {
		const INFO_TEXT = getLocText(interaction, 'infoText');
		await safeReply(interaction, { content: `Narrator | ${packageJson.version}\n\n${INFO_TEXT}`, flags: [MessageFlags.Ephemeral] });
	} catch (err) {
		if (isIgnorableInteractionError(err)) return;
		consoleLog(`[${getTimestamp()}] Failed to execute command [/${interaction.commandName}] : `, err);
		await safeReply(interaction, { content: getLocText(interaction, 'replyCommandError', { commandName: `/${interaction.commandName}` }), flags: [MessageFlags.Ephemeral] });
	}
}

async function commandLotteryKick(interaction, { CONFIG, getLocText, safeReply, consoleLog, getTimestamp, isWhitelist, isGuildNot }) {
	try {
		if (await isWhitelist(interaction)) return;
		if (await isGuildNot(interaction)) return;
		
		const roll = Math.floor(Math.random() * 100) + 1;
		if (roll <= CONFIG.kickChance) {
			const kickMsg = getLocText(interaction, 'replyLotteryKickYes', { userId: interaction.user.id });
			await safeReply(interaction, kickMsg);
			await new Promise(resolve => setTimeout(resolve, 30000));
			try {
				let inviteCode = null;
				try {
					const invite = await interaction.channel.createInvite({ maxAge: 86400, maxUses: 1, unique: true });
					inviteCode = invite.code;
				} catch (err) {
					consoleLog(`[${getTimestamp()}] WARNING: Couldn't create invite for @${interaction.user.tag}: `, err.message);
				}

				if (inviteCode) {
					try {
						await interaction.user.send(getLocText(interaction, 'replyLotteryKickDm', { inviteCode }));
					} catch (err) {
						consoleLog(`[${getTimestamp()}] WARNING: Couldn't DM @${interaction.user.tag}: `, err.message);
					}
				}

				await interaction.member.kick(getLocText(interaction, 'replyLotteryKickReason'));
			} catch (err) {
				consoleLog(`[${getTimestamp()}] ERROR: Couldn't kick user @${interaction.user.tag}: `, err.message);
				const errorKick = getLocText(interaction, 'replyLotteryKickError', { userId: interaction.user.id });
				await interaction.followUp({ content: errorKick, flags: [MessageFlags.Ephemeral] });
			}
		} else {
			const noKickMsg = getLocText(interaction, 'replyLotteryKickNo', { userId: interaction.user.id });
			await safeReply(interaction, noKickMsg);
		}
	} catch (err) {
		if (isIgnorableInteractionError(err)) return;
		consoleLog(`[${getTimestamp()}] Failed to execute command [/${interaction.commandName}] : `, err);
		await safeReply(interaction, { content: getLocText(interaction, 'replyCommandError', { commandName: `/${interaction.commandName}` }), flags: [MessageFlags.Ephemeral] });
	}
}

async function commandLore(interaction, { getLocalizedLoreSnippets, getLocText, safeReply, consoleLog, getTimestamp, isGuildNot }) {
	try {
		if (await isGuildNot(interaction)) return;
		
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
	} catch (err) {
		if (isIgnorableInteractionError(err)) return;
		consoleLog(`[${getTimestamp()}] Failed to execute command [/${interaction.commandName}] : `, err);		
		await safeReply(interaction, { content: getLocText(interaction, 'replyCommandError', { commandName: `/${interaction.commandName}` }), flags: [MessageFlags.Ephemeral] });
	}
}

async function commandLoreList(interaction, { getLocText, safeReply, consoleLog, getTimestamp, loadSafeModule, isGuildNot, isAdminManageServer }) {
	try {
		if (await isGuildNot(interaction)) return;
		if (await isAdminManageServer(interaction)) return;
		
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
				snippets.forEach((s, idx) => outputLines.push(`> ${idx + 1}. ${String(s).replace(/\n/g, '\n> ')}`));
			}
		}
		
		const responseText = outputLines.length > 0 ? outputLines.join('\n') : getLocText(interaction, 'replyLoreSnippetsUnavailable');
		
		const chunks = [];
		let currentChunk = '';
		for (const line of responseText.split('\n')) {
			const safeLine = line.length > 1900 ? `${line.slice(0, 1897)}...` : line;
			if (currentChunk && currentChunk.length + safeLine.length + 1 > 1900) {
				chunks.push(currentChunk);
				currentChunk = safeLine;
			} else {
				currentChunk = currentChunk ? `${currentChunk}\n${safeLine}` : safeLine;
			}
		}
		if (currentChunk) chunks.push(currentChunk);
		
		if (chunks.length > 5) {
			const file = new AttachmentBuilder(Buffer.from(responseText.replace(/^> /gm, ''), 'utf8'), { name: 'lore-list.txt' });
			await safeReply(interaction, { files: [file], flags: [MessageFlags.Ephemeral] });
		} else {
			for (const chunk of chunks) {
				await safeReply(interaction, { content: chunk, flags: [MessageFlags.Ephemeral] });
			}
		}
	} catch (err) {
		if (isIgnorableInteractionError(err)) return;
		consoleLog(`[${getTimestamp()}] Failed to execute command [/${interaction.commandName}] : `, err);
		await safeReply(interaction, { content: getLocText(interaction, 'replyCommandError', { commandName: `/${interaction.commandName}` }), flags: [MessageFlags.Ephemeral] });
	}
}

async function commandLoreCreate(interaction, { getLocText, removeDuplicateLoreInFiles, safeReply, consoleLog, getTimestamp, getLoreFilePath, readLoreFileStrict, writeLoreFile, exceedsLoreLimit, LORE_MAX_FILE_BYTES, isGuildNot, isAdminManageServer }) {
	try {
		if (await isGuildNot(interaction)) return;
		if (await isAdminManageServer(interaction)) return;

		const guildIdArg = interaction.guildId;
		const langArg = interaction.options.getString('language_code');
		const snippetText = interaction.options.getString('snippet');

		const filePath = getLoreFilePath(guildIdArg, langArg);
		if (!filePath) {
			await safeReply(interaction, { content: getLocText(interaction, 'replyLoreInvalidLanguage'), flags: [MessageFlags.Ephemeral] });
			return;
		}

		if (!fs.existsSync(loresDir)) {
			fs.mkdirSync(loresDir, { recursive: true });
		}

		const snippets = readLoreFileStrict(filePath);
		snippets.push(snippetText);

		if (exceedsLoreLimit(snippets)) {
			await safeReply(interaction, { content: getLocText(interaction, 'replyLoreCreateTooLarge', { limit: LORE_MAX_FILE_BYTES }), flags: [MessageFlags.Ephemeral] });
			return;
		}

		writeLoreFile(filePath, snippets);
		removeDuplicateLoreInFiles(loresDir);

		consoleLog(`[${getTimestamp()}] Success: Added snippet via Discord to '${filePath}'`);
		await safeReply(interaction, { content: getLocText(interaction, 'replyLoreCreateSuccess', { guildId: guildIdArg, lang: langArg }), flags: [MessageFlags.Ephemeral] });
	} catch (err) {
		if (isIgnorableInteractionError(err)) return;
		consoleLog(`[${getTimestamp()}] Failed to execute command [/${interaction.commandName}] : `, err);
		await safeReply(interaction, { content: getLocText(interaction, 'replyCommandError', { commandName: `/${interaction.commandName}` }), flags: [MessageFlags.Ephemeral] });
	}
}

async function commandLoreRemove(interaction, { getLocText, removeDuplicateLoreInFiles, safeReply, consoleLog, getTimestamp, getLoreFilePath, readLoreFileStrict, writeLoreFile, isGuildNot, isAdminManageServer }) {
	try {
		if (await isGuildNot(interaction)) return;
		if (await isAdminManageServer(interaction)) return;

		const guildId = interaction.guildId;
		const langArg = interaction.options.getString('language_code');
		const snippetNumber = interaction.options.getInteger('snippet_number');

		const filePath = getLoreFilePath(guildId, langArg);
		if (!filePath) {
			await safeReply(interaction, { content: getLocText(interaction, 'replyLoreInvalidLanguage'), flags: [MessageFlags.Ephemeral] });
			return;
		}
		if (!fs.existsSync(filePath)) {
			await safeReply(interaction, { content: getLocText(interaction, 'replyLoreSnippetsUnavailable'), flags: [MessageFlags.Ephemeral] });
			return;
		}

		const snippets = readLoreFileStrict(filePath);

		if (snippetNumber > 0 && snippetNumber <= snippets.length) {
			snippets.splice(snippetNumber - 1, 1);
			writeLoreFile(filePath, snippets);
			removeDuplicateLoreInFiles(loresDir);

			consoleLog(`[${getTimestamp()}] Success: Removed snippet #${snippetNumber} from '${guildId}_${langArg}.js' via Discord`);
			await safeReply(interaction, { content: getLocText(interaction, 'replyLoreRemoveSuccess', { number: snippetNumber }), flags: [MessageFlags.Ephemeral] });
		} else {
			await safeReply(interaction, { content: getLocText(interaction, 'replyLoreRemoveNotFound', { number: snippetNumber }), flags: [MessageFlags.Ephemeral] });
		}
	} catch (err) {
		if (isIgnorableInteractionError(err)) return;
		consoleLog(`[${getTimestamp()}] Failed to execute command [/${interaction.commandName}] : `, err);
		await safeReply(interaction, { content: getLocText(interaction, 'replyCommandError', { commandName: `/${interaction.commandName}` }), flags: [MessageFlags.Ephemeral] });
	}
}

async function commandVoiceJoin(interaction, { getLocText, saveVoiceState, safeReply, consoleLog, getTimestamp, joinVoice, isWhitelistNot, isGuildNot, voiceConnections, guildPlayers, guildVolumes, currentVolume }) {
	try {
		if (await isWhitelistNot(interaction)) return;
		if (await isGuildNot(interaction)) return;

		const optionChannel = interaction.options.getChannel('channel');
		if (!optionChannel || !optionChannel.isVoiceBased()) {
			await safeReply(interaction, { content: getLocText(interaction, 'replyVoiceNotFound', { channelId: optionChannel?.id ?? 'unknown' }), flags: [MessageFlags.Ephemeral] });
			return;
		}
		
		try {
			await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
		} catch (err) {
			if (err.code === 10062) return;
			throw err;
		}

		try {
			await joinVoice(optionChannel, voiceConnections, guildPlayers);
		} catch (err) {
			consoleLog(`[${getTimestamp()}] ${err.message}`);
			await safeReply(interaction, { content: getLocText(interaction, 'replyCommandError', { commandName: `/${interaction.commandName}` }), flags: [MessageFlags.Ephemeral] });
			return;
		}
		saveVoiceState(voiceConnections, guildPlayers, guildVolumes, currentVolume);

		consoleLog(`[${getTimestamp()}] Successfully joined the voice channel '${optionChannel.name}' (${optionChannel.id}) by @${interaction.user.tag} (${interaction.user.id})`);
		await safeReply(interaction, { content: getLocText(interaction, 'replyVoiceJoinSuccess', { channelName: optionChannel.name }), flags: [MessageFlags.Ephemeral] });
	} catch (err) {
		if (isIgnorableInteractionError(err)) return;
		consoleLog(`[${getTimestamp()}] Failed to execute command [/${interaction.commandName}] : `, err);
		await safeReply(interaction, { content: getLocText(interaction, 'replyCommandError', { commandName: `/${interaction.commandName}` }), flags: [MessageFlags.Ephemeral] });
	}
}

async function commandVoiceLeave(interaction, { getLocText, saveVoiceState, safeReply, consoleLog, getTimestamp, isWhitelistNot, isGuildNot, isVoiceNot, voiceConnections, guildPlayers, guildVolumes, currentVolume }) {
	try {
		if (await isWhitelistNot(interaction)) return;
		if (await isGuildNot(interaction)) return;
		if (await isVoiceNot(interaction)) return;
		
		const connection = voiceConnections.get(interaction.guildId);
		const activePlayer = guildPlayers.get(interaction.guildId);
		voiceConnections.delete(interaction.guildId);
		guildPlayers.delete(interaction.guildId);
		try { activePlayer?.player.stop(true); } catch (err) {}
		try { connection?.destroy(); } catch (err) {}
		saveVoiceState(voiceConnections, guildPlayers, guildVolumes, currentVolume);
		
		consoleLog(`[${getTimestamp()}] Successfully left voice channel for guild ID '${interaction.guildId}' by @${interaction.user.tag} (${interaction.user.id})`);
		await safeReply(interaction, { content: getLocText(interaction, 'replyVoiceLeaveSuccess'), flags: [MessageFlags.Ephemeral] });
	} catch (err) {
		if (isIgnorableInteractionError(err)) return;
		consoleLog(`[${getTimestamp()}] Failed to execute command [/${interaction.commandName}] : `, err);
		await safeReply(interaction, { content: getLocText(interaction, 'replyCommandError', { commandName: `/${interaction.commandName}` }), flags: [MessageFlags.Ephemeral] });
	}
}

async function commandSoundboardPlay(interaction, { getLocText, saveVoiceState, safeReply, consoleLog, getTimestamp, getSoundFilePath, setupPlayerEvents, isWhitelistNot, isGuildNot, isVoiceNot, voiceConnections, guildVolumes, guildPlayers, currentVolume, getCurrentVolume }) {
	try {
		if (await isWhitelistNot(interaction)) return;
		if (await isGuildNot(interaction)) return;
		if (await isVoiceNot(interaction)) return;

		const soundChoice = interaction.options.getString('sound');
		const soundPath = getSoundFilePath(soundChoice);
		if (!soundPath || !fs.existsSync(soundPath)) {
			await safeReply(interaction, { content: getLocText(interaction, 'replySoundboardPlayNotFound'), flags: [MessageFlags.Ephemeral] });
			return;
		}

		const connection = voiceConnections.get(interaction.guildId);
		if (!connection) {
			await safeReply(interaction, { content: getLocText(interaction, 'replyNotInVoice'), flags: [MessageFlags.Ephemeral] });
			return;
		}
		
		const previousEntry = guildPlayers.get(interaction.guildId);
		guildPlayers.delete(interaction.guildId);
		try { previousEntry?.player.stop(true); } catch (err) {}

		const player = createAudioPlayer();
		const resource = createAudioResource(soundPath, { inlineVolume: true });
		const volume = guildVolumes.get(interaction.guildId) ?? currentVolume;
		resource.volume.setVolume(volume);

		guildPlayers.set(interaction.guildId, {
			player,
			resource,
			soundName: path.basename(soundPath, '.mp3'),
			startTime: Date.now()
		});
		setupPlayerEvents(interaction.guildId, player, voiceConnections, guildPlayers, guildVolumes, getCurrentVolume);
		saveVoiceState(voiceConnections, guildPlayers, guildVolumes, currentVolume);
		
		const startPlayback = () => {
			connection.subscribe(player);
			player.play(resource);
		};
		if (connection.state.status === VoiceConnectionStatus.Ready) {
			startPlayback();
		} else {
			connection.once(VoiceConnectionStatus.Ready, startPlayback);
		}

		consoleLog(`[${getTimestamp()}] Played sound '${soundChoice}' for guild ID '${interaction.guildId}'.`);
		await safeReply(interaction, { content: getLocText(interaction, 'replySoundboardPlayPlaying', { soundChoice }), flags: [MessageFlags.Ephemeral] });
	} catch (err) {
		if (isIgnorableInteractionError(err)) return;
		consoleLog(`[${getTimestamp()}] Failed to execute command [/${interaction.commandName}] : `, err);
		await safeReply(interaction, { content: getLocText(interaction, 'replyCommandError', { commandName: `/${interaction.commandName}` }), flags: [MessageFlags.Ephemeral] });
	}
}

async function commandSoundboardStop(interaction, { getLocText, saveVoiceState, safeReply, consoleLog, getTimestamp, isWhitelistNot, isGuildNot, isVoiceNot, voiceConnections, guildPlayers, guildVolumes, currentVolume }) {
	try {
		if (await isWhitelistNot(interaction)) return;
		if (await isGuildNot(interaction)) return;
		if (await isVoiceNot(interaction)) return;
		
		const activeEntry = guildPlayers.get(interaction.guildId);
		if (activeEntry?.player) {
			activeEntry.player.stop();
			guildPlayers.delete(interaction.guildId);
		}
		saveVoiceState(voiceConnections, guildPlayers, guildVolumes, currentVolume);
		
		consoleLog(`[${getTimestamp()}] Stopped playback for guild ID '${interaction.guildId}'.`);
		await safeReply(interaction, { content: getLocText(interaction, 'replySoundboardStopSuccess'), flags: [MessageFlags.Ephemeral] });
	} catch (err) {
		if (isIgnorableInteractionError(err)) return;
		consoleLog(`[${getTimestamp()}] Failed to execute command [/${interaction.commandName}] : `, err);
		await safeReply(interaction, { content: getLocText(interaction, 'replyCommandError', { commandName: `/${interaction.commandName}` }), flags: [MessageFlags.Ephemeral] });
	}
}

async function commandSoundboardVolume(interaction, { getLocText, saveVoiceState, safeReply, consoleLog, getTimestamp, isWhitelistNot, isGuildNot, voiceConnections, guildVolumes, guildPlayers, currentVolume }) {
	try {
		if (await isGuildNot(interaction)) return;
		if (await isWhitelistNot(interaction)) return;
		
		const volumePercent = interaction.options.getInteger('level');
		const volume = volumePercent / 100;
		guildVolumes.set(interaction.guildId, volume);
		const activeEntry = guildPlayers.get(interaction.guildId);
		if (activeEntry?.resource?.volume) {
			try { activeEntry.resource.volume.setVolume(volume); } catch (err) {}
		}
		saveVoiceState(voiceConnections, guildPlayers, guildVolumes, currentVolume);
		
		consoleLog(`[${getTimestamp()}] Volume set to ${volumePercent}% for guild ID '${interaction.guildId}'.`);
		await safeReply(interaction, { content: getLocText(interaction, 'replySoundboardVolumeSuccess', { volume: volumePercent }), flags: [MessageFlags.Ephemeral] });
	} catch (err) {
		if (isIgnorableInteractionError(err)) return;
		consoleLog(`[${getTimestamp()}] Failed to execute command [/${interaction.commandName}] : `, err);
		await safeReply(interaction, { content: getLocText(interaction, 'replyCommandError', { commandName: `/${interaction.commandName}` }), flags: [MessageFlags.Ephemeral] });
	}
}

module.exports = { getCommands, handleDiscordInteraction };
