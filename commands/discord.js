const { SlashCommandBuilder, InteractionContextType, ApplicationIntegrationType, ChannelType, MessageFlags, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');

function getCommands(CONFIG, getCmdText) {
	return [
		new SlashCommandBuilder().setName('help').setDescription(getCmdText('descHelp'))
			.setContexts([0, 1, 2]).setIntegrationTypes([0, 1]),
		new SlashCommandBuilder().setName('lore').setDescription(getCmdText('descLore'))
			.setContexts([0, 1, 2]).setIntegrationTypes([0, 1]),
		new SlashCommandBuilder().setName('lore-create').setDescription(getCmdText('descLoreCreate'))
			.setContexts([0]).setIntegrationTypes([0])
			.addStringOption(option => option.setName('language_code').setDescription(getCmdText('optionLanguageCode')).setRequired(true))
			.addStringOption(option => option.setName('snippet').setDescription(getCmdText('optionSnippet')).setRequired(true)),
		new SlashCommandBuilder().setName('info').setDescription(getCmdText('descInfo'))
			.setContexts([0, 1, 2]).setIntegrationTypes([0, 1]),
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
		isBotReady, CONFIG, getLocText, getLocalizedLoreSnippets, 
		consoleLog, getTimestamp, makeLogMessage, 
		voiceConnections, guildVolumes, guildPlayers, currentVolume,
		isWhitelist, isWhitelistNot, isAuthorizedTester, isGuildNot, isVoiceNot
	} = context;

	if (!isBotReady) {
		if (interaction.isChatInputCommand()) {
			await interaction.reply({
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
				if (error.code !== 10062) {
					consoleLog('Error handling soundboard autocomplete: ', error);
				}
			}
		}
		return;
	}
	
	if (!interaction.isChatInputCommand()) return;
	
	switch (interaction.commandName) {
		case 'help':
			await commandHelp(interaction, context);
			break;
		case 'lore':
			await commandLore(interaction, context);
			break;
		case 'lore-create':
			await commandLoreCreate(interaction, context);
			break;
		case 'info':
			await commandInfo(interaction, context);
			break;
		case 'lottery-kick':
			await commandLotteryKick(interaction, context);
			break;
		case 'voice-join':
			await commandVoiceJoin(interaction, context);
			break;
		case 'voice-leave':
			await commandVoiceLeave(interaction, context);
			break;
		case 'soundboard-play':
			await commandSoundboardPlay(interaction, context);
			break;
		case 'soundboard-stop':
			await commandSoundboardStop(interaction, context);
			break;
		case 'soundboard-volume':
			await commandSoundboardVolume(interaction, context);
			break;
	}
}

// Discord commands.
async function commandHelp(interaction, { CONFIG, getLocText, makeLogMessage, consoleLog, getTimestamp }) {
	makeLogMessage(interaction);
	
	try {
		const HELP_TEXT = getLocText(interaction, 'helpText', { kickChance: CONFIG.kickChance });
		await interaction.reply(HELP_TEXT);
	} catch (error) {
		consoleLog(`[${getTimestamp()}] Failed to execute command [/${interaction.commandName}] :`, error);
		await interaction.reply({ content: getLocText(interaction, 'replyCommandError', { commandName: `/${interaction.commandName}` }), flags: [MessageFlags.Ephemeral] });
	}
}

async function commandLore(interaction, { getLocalizedLoreSnippets, getLocText, makeLogMessage, consoleLog, getTimestamp }) {
	makeLogMessage(interaction);
	
	try {
		const loreSnippets = getLocalizedLoreSnippets(interaction);
		const randomIndex = Math.floor(Math.random() * loreSnippets.length);
		const replyText = getLocText(interaction, 'replyLore', { loreSnippet: loreSnippets[randomIndex] });
		await interaction.reply(replyText);
	} catch (error) {
		consoleLog(`[${getTimestamp()}] Failed to execute command [/${interaction.commandName}] :`, error);		
		await interaction.reply({ content: getLocText(interaction, 'replyCommandError', { commandName: `/${interaction.commandName}` }), flags: [MessageFlags.Ephemeral] });
	}
}

async function commandLoreCreate(interaction, { getLocText, makeLogMessage, consoleLog, getTimestamp, loadSafeModule }) {
	if (await isGuildNot(interaction)) return;
	makeLogMessage(interaction);
	
	try {
		// Check if user has Administrator or Manage Server permissions.
		if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator) && 
			!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
			await interaction.reply({ 
				content: getLocText(interaction, 'replyLoreCreateNoPermission'), 
				flags: [MessageFlags.Ephemeral] 
			});
			return;
		}
		
		const guildIdArg = interaction.guildId || 'default';
		const langArg = interaction.options.getString('language_code');
		const snippetText = interaction.options.getString('snippet');

		const loresDir = './lores';
		if (!fs.existsSync(loresDir)) {
			fs.mkdirSync(loresDir, { recursive: true });
		}

		const filePath = `${loresDir}/${guildIdArg}_${langArg}.js`;
		let existingSnippets = [];

		if (fs.existsSync(filePath)) {
			existingSnippets = loadSafeModule(filePath, []);
		}

		existingSnippets.push(snippetText);

		const fileContent = `module.exports = [\n` + 
			existingSnippets.map(s => `\t\`${s.replace(/`/g, '\\`')}\``).join(',\n') + `\n];\n`;

		fs.writeFileSync(filePath, fileContent, 'utf8');
		consoleLog(`[${getTimestamp()}] Success: Added snippet via Discord to ${filePath}`);

		await interaction.reply(getLocText(interaction, 'replyLoreCreateSuccess', { guildId: guildIdArg, lang: langArg }));
	} catch (error) {
		consoleLog(`[${getTimestamp()}] Failed to execute command [/${interaction.commandName}] :`, error);
		await interaction.reply({ content: getLocText(interaction, 'replyCommandError', { commandName: `/${interaction.commandName}` }), flags: [MessageFlags.Ephemeral] });
	}
}

async function commandInfo(interaction, { CONFIG, getLocText, makeLogMessage, consoleLog, getTimestamp }) {
	makeLogMessage(interaction);
	
	try {
		const INFO_TEXT = getLocText(interaction, 'infoText', { loreLink: CONFIG.loreLink, loreLinkKey: CONFIG.loreLinkKey });
		await interaction.reply(INFO_TEXT);
	} catch (error) {
		consoleLog(`[${getTimestamp()}] Failed to execute command [/${interaction.commandName}] :`, error);
		await interaction.reply({ content: getLocText(interaction, 'replyCommandError', { commandName: `/${interaction.commandName}` }), flags: [MessageFlags.Ephemeral] });
	}
}

async function commandLotteryKick(interaction, { CONFIG, getLocText, makeLogMessage, consoleLog, getTimestamp, isWhitelist }) {
	if (await isWhitelist(interaction)) return;
	if (await isGuildNot(interaction)) return;
	makeLogMessage(interaction);
	
	try {
		const roll = Math.floor(Math.random() * 100) + 1;
		if (roll <= CONFIG.kickChance) {
			const kickMsg = getLocText(interaction, 'replyLotteryKickYes', { userId: interaction.user.id });
			await interaction.reply(kickMsg);
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
			await interaction.reply(noKickMsg);
		}
	} catch (error) {
		consoleLog(`[${getTimestamp()}] Failed to execute command [/${interaction.commandName}] :`, error);
		await interaction.reply({ content: getLocText(interaction, 'replyCommandError', { commandName: `/${interaction.commandName}` }), flags: [MessageFlags.Ephemeral] });
	}
}

async function commandVoiceJoin(interaction, { getLocText, makeLogMessage, consoleLog, getTimestamp, isWhitelistNot, voiceConnections }) {
	if (await isWhitelistNot(interaction)) return;
	if (await isGuildNot(interaction)) return;
	makeLogMessage(interaction);
	
	try {
		const optionChannel = interaction.options.getChannel('channel');
		if (!optionChannel) {
			await interaction.reply({ content: getLocText(interaction, 'replyVoiceNotFound', { channelId: 'unknown' }), flags: [MessageFlags.Ephemeral] });
			return;
		}
		const { joinVoiceChannel, VoiceConnectionStatus } = require('@discordjs/voice');
		const connection = joinVoiceChannel({
			channelId: optionChannel.id,
			guildId: optionChannel.guild.id,
			adapterCreator: optionChannel.guild.voiceAdapterCreator,
		});
		voiceConnections.set(optionChannel.guild.id, connection);
		connection.on('stateChange', (oldState, newState) => {
			if (newState.status === VoiceConnectionStatus.Disconnected) {
				voiceConnections.delete(optionChannel.guild.id);
			}
		});
		consoleLog(`[${getTimestamp()}] Successfully joined the voice channel '${optionChannel.name}' (${optionChannel.id}) by @${interaction.user.tag} (${interaction.user.id})`);
		await interaction.reply(getLocText(interaction, 'replyVoiceJoinSuccess', { channelName: optionChannel.name }));
	} catch (error) {
		consoleLog(`[${getTimestamp()}] Failed to execute command [/${interaction.commandName}] :`, error);
		await interaction.reply({ content: getLocText(interaction, 'replyCommandError', { commandName: `/${interaction.commandName}` }), flags: [MessageFlags.Ephemeral] });
	}
}

async function commandVoiceLeave(interaction, { getLocText, makeLogMessage, consoleLog, getTimestamp, isWhitelistNot, voiceConnections }) {
	if (await isWhitelistNot(interaction)) return;
	if (await isGuildNot(interaction)) return;
	if (await isVoiceNot(interaction)) return;
	makeLogMessage(interaction);
	
	try {
		connection.destroy();
		voiceConnections.delete(interaction.guildId);
		consoleLog(`[${getTimestamp()}] Successfully left voice channel for guild '${interaction.guildId}' by @${interaction.user.tag} (${interaction.user.id})`);
		await interaction.reply(getLocText(interaction, 'replyVoiceLeaveSuccess'));
	} catch (error) {
		consoleLog(`[${getTimestamp()}] Failed to execute command [/${interaction.commandName}] :`, error);
		await interaction.reply({ content: getLocText(interaction, 'replyCommandError', { commandName: `/${interaction.commandName}` }), flags: [MessageFlags.Ephemeral] });
	}
}

async function commandSoundboardPlay(interaction, { getLocText, makeLogMessage, consoleLog, getTimestamp, isWhitelistNot, voiceConnections, guildVolumes, currentVolume, guildPlayers }) {
	if (await isWhitelistNot(interaction)) return;
	if (await isGuildNot(interaction)) return;
	if (await isVoiceNot(interaction)) return;
	makeLogMessage(interaction);
	
	try {
		const soundChoice = interaction.options.getString('sound');
		const soundPath = `./sounds/${soundChoice}.mp3`;
		if (!fs.existsSync(soundPath)) {
			await interaction.reply({ content: getLocText(interaction, 'replySoundboardPlayNotFound'), flags: [MessageFlags.Ephemeral] });
			return;
		}
		const { createAudioPlayer, createAudioResource } = require('@discordjs/voice');
		await interaction.reply(getLocText(interaction, 'replySoundboardPlayPlaying', { soundChoice }));
		const player = createAudioPlayer();
		const resource = createAudioResource(soundPath, { inlineVolume: true });
		const volume = guildVolumes.get(interaction.guildId) ?? currentVolume;
		resource.volume.setVolume(volume);
		guildPlayers.set(interaction.guildId, { player, resource });
		connection.subscribe(player);
		player.play(resource);
	} catch (error) {
		consoleLog(`[${getTimestamp()}] Failed to execute command [/${interaction.commandName}] :`, error);
		await interaction.reply({ content: getLocText(interaction, 'replyCommandError', { commandName: `/${interaction.commandName}` }), flags: [MessageFlags.Ephemeral] });
	}
}

async function commandSoundboardStop(interaction, { getLocText, makeLogMessage, consoleLog, getTimestamp, isWhitelistNot, voiceConnections }) {
	if (await isWhitelistNot(interaction)) return;
	if (await isGuildNot(interaction)) return;
	if (await isVoiceNot(interaction)) return;
	makeLogMessage(interaction);
	
	try {
		const { createAudioPlayer } = require('@discordjs/voice');
		connection.subscribe(createAudioPlayer());
		await interaction.reply(getLocText(interaction, 'replySoundboardStopSuccess'));
	} catch (error) {
		consoleLog(`[${getTimestamp()}] Failed to execute command [/${interaction.commandName}] :`, error);
		await interaction.reply({ content: getLocText(interaction, 'replyCommandError', { commandName: `/${interaction.commandName}` }), flags: [MessageFlags.Ephemeral] });
	}
}

async function commandSoundboardVolume(interaction, { getLocText, makeLogMessage, consoleLog, getTimestamp, isWhitelistNot, guildVolumes, guildPlayers }) {
	if (await isGuildNot(interaction)) return;
	if (await isWhitelistNot(interaction)) return;
	makeLogMessage(interaction);
	
	try {
		const volumePercent = interaction.options.getInteger('level');
		const volume = volumePercent / 100;
		guildVolumes.set(interaction.guildId, volume);
		const activeEntry = guildPlayers.get(interaction.guildId);
		if (activeEntry?.resource?.volume) {
			try { activeEntry.resource.volume.setVolume(volume); } catch (e) {}
		}
		await interaction.reply(getLocText(interaction, 'replySoundboardVolumeSuccess', { volume: volumePercent }));
	} catch (error) {
		consoleLog(`[${getTimestamp()}] Failed to execute command [/${interaction.commandName}] :`, error);
		await interaction.reply({ content: getLocText(interaction, 'replyCommandError', { commandName: `/${interaction.commandName}` }), flags: [MessageFlags.Ephemeral] });
	}
}

module.exports = { getCommands, handleDiscordInteraction };