// Dependencies.
const { SlashCommandBuilder, ChannelType, MessageFlags, AttachmentBuilder } = require('discord.js');
const { createAudioPlayer, createAudioResource, VoiceConnectionStatus } = require('@discordjs/voice');
const isIgnorableInteractionError = (err) => err?.code === 10062 || err?.code === 40060;
const fs = require('fs');
const path = require('path');

// Variables.
const loresDir = path.join(__dirname, '../lores');
const soundsDir = path.join(__dirname, '../sounds');

const LORE_EXT = '.js';
const SOUND_EXT = '.mp3';

const ROLE_ERROR_KEYS = {
	notFound: 'replyRoleNotFound',
	everyone: 'replyRoleInvalidEveryone',
	managed: 'replyRoleInvalidManaged',
	dangerous: 'replyRoleInvalidDangerous',
	botPermission: 'replyRoleInvalidBotPermission',
	botHierarchy: 'replyRoleInvalidBotHierarchy',
	userHierarchy: 'replyRoleInvalidUserHierarchy'
};
const ROLE_CREATE_ERROR_KEYS = {
	limit: 'replyRoleAddLimit',
	botPermission: 'replyRoleInvalidBotPermission',
	invalidName: 'replyRoleCreateInvalidName'
};
const ROLE_GIVE_ERROR_KEYS = {
	...ROLE_ERROR_KEYS,
	memberNotFound: 'replyRoleGiveMemberNotFound',
	notSelected: 'replyRoleGiveNotSelected',
	targetHierarchy: 'replyRoleGiveTargetHierarchy',
	already: 'replyRoleGiveAlready'
};
const ROLE_TAKE_ERROR_KEYS = {
	...ROLE_GIVE_ERROR_KEYS,
	missing: 'replyRoleTakeMissing'
};

function getCommands(CONFIG, getCmdText) {
	return [
		// setContexts: 0 (Guild), 1 (Bot DM), 2 (Group DMs and Friend DMs).
		// setIntegrationTypes: 0 (Guild Install), 1 (User Install).
		
		new SlashCommandBuilder().setName('help').setDescription(getCmdText('descHelp'))
			.setContexts([0, 1, 2]).setIntegrationTypes([0, 1]),
		
		new SlashCommandBuilder().setName('info').setDescription(getCmdText('descInfo'))
			.setContexts([0, 1, 2]).setIntegrationTypes([0, 1]),
		
		new SlashCommandBuilder().setName('role-create').setDescription(getCmdText('descRoleCreate'))
			.setContexts([0]).setIntegrationTypes([0])
			.addStringOption(option => option.setName('name').setDescription(getCmdText('optionRoleName')).setMaxLength(100).setRequired(true)),
		
		new SlashCommandBuilder().setName('role-add').setDescription(getCmdText('descRoleAdd'))
			.setContexts([0]).setIntegrationTypes([0])
			.addStringOption(option => option.setName('role').setDescription(getCmdText('optionRole')).setRequired(true).setAutocomplete(true)),
		
		new SlashCommandBuilder().setName('role-give').setDescription(getCmdText('descRoleGive'))
			.setContexts([0]).setIntegrationTypes([0])
			.addUserOption(option => option.setName('member').setDescription(getCmdText('optionMember')).setRequired(true))
			.addStringOption(option => option.setName('role').setDescription(getCmdText('optionRole')).setRequired(true).setAutocomplete(true)),
		
		new SlashCommandBuilder().setName('role-take').setDescription(getCmdText('descRoleTake'))
			.setContexts([0]).setIntegrationTypes([0])
			.addUserOption(option => option.setName('member').setDescription(getCmdText('optionMember')).setRequired(true))
			.addStringOption(option => option.setName('role').setDescription(getCmdText('optionRole')).setRequired(true).setAutocomplete(true)),
		
		new SlashCommandBuilder().setName('role-remove').setDescription(getCmdText('descRoleRemove'))
			.setContexts([0]).setIntegrationTypes([0])
			.addStringOption(option => option.setName('role').setDescription(getCmdText('optionRole')).setRequired(true).setAutocomplete(true)),
		
		new SlashCommandBuilder().setName('role-list').setDescription(getCmdText('descRoleList'))
			.setContexts([0]).setIntegrationTypes([0]),
		
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
			.addIntegerOption(option => option.setName('snippet_number').setDescription(getCmdText('optionSnippetNumber')).setMinValue(1).setRequired(true)),
		
		new SlashCommandBuilder().setName('voice-join').setDescription(getCmdText('descVoiceJoin'))
			.setContexts([0]).setIntegrationTypes([0])
			.addChannelOption(option => option.setName('channel').setDescription(getCmdText('optionVoiceChannel')).addChannelTypes(ChannelType.GuildVoice).setRequired(true)),
		
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
		colorize, roleColorEmoji,
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
		if (['role-add', 'role-give', 'role-take', 'role-remove'].includes(interaction.commandName)) {
			try {
				const guild = interaction.guild;
				if (!interaction.guildId || !guild) {
					if (!interaction.responded) await interaction.respond([]);
					return;
				}

				const selected = new Set(context.getGuildRoles(interaction.guildId));
				const focusedValue = interaction.options.getFocused().toLowerCase();
				let roles;
				const deletedLabel = context.getLocText(interaction, 'replyRoleDeleted');

				if (interaction.commandName === 'role-add') {
					// Not selected roles.
					const actor = context.CONFIG.whitelist.includes(interaction.user.id) ? null : interaction.member;
					roles = [...guild.roles.cache.values()]
						.filter(role => !selected.has(role.id))
						.filter(role => !context.validateRoleSelection(guild, role, actor))
						.sort((a, b) => b.position - a.position);
				} else {
					// Selected roles.
					roles = [...selected]
						.map(id => guild.roles.cache.get(id) ?? (interaction.commandName === 'role-remove' ? { id, name: `${id} ${deletedLabel}`, color: 0 } : null))
						.filter(Boolean);
				}

				const choices = roles
					.filter(role => role.name.toLowerCase().includes(focusedValue) || role.id.includes(focusedValue))
					.slice(0, 25)
					.map(role => ({ name: `${roleColorEmoji(role)} ${role.name}`.slice(0, 100), value: role.id }));

				if (!interaction.responded) await interaction.respond(choices);
			} catch (err) {
				if (!isIgnorableInteractionError(err)) {
					consoleLog(`${getTimestamp()} Error handling role autocomplete: `, err);
				}
			}
		}
		
		if (interaction.commandName === 'soundboard-play') {
			try {
				if (!interaction.guildId) {
					if (!interaction.responded) {
						await interaction.respond([]);
					}
					return;
				}
				if (!fs.existsSync(soundsDir)) {
					if (!interaction.responded) {
						await interaction.respond([]);
					}
					return;
				}
				
				fs.mkdirSync(soundsDir, { recursive: true });
				const files = fs.readdirSync(soundsDir);
				const choices = files
					.filter(file => file.endsWith(SOUND_EXT))
					.map(file => file.slice(0, -SOUND_EXT.length))
					.filter(name => name.length <= 100);
				
				const focusedValue = interaction.options.getFocused();
				const filtered = choices.filter(choice => choice.toLowerCase().includes(focusedValue.toLowerCase()));
				
				if (!interaction.responded) {
					await interaction.respond(
						filtered.slice(0, 25).map(choice => ({ name: choice, value: choice }))
					);
				}
			} catch (err) {
				if (err.code !== 10062 && err.code !== 40060) {
					consoleLog(`${getTimestamp()} Error handling soundboard autocomplete: `, err);
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
			
			case 'role-create': {
				await commandRoleCreate(interaction, context);
				break;
			}
			
			case 'role-give': {
				await commandRoleGive(interaction, context);
				break;
			}
			
			case 'role-take': {
				await commandRoleTake(interaction, context);
				break;
			}
			
			case 'role-add': {
				await commandRoleAdd(interaction, context);
				break;
			}
			
			case 'role-remove': {
				await commandRoleRemove(interaction, context);
				break;
			}
			
			case 'role-list': {
				await commandRoleList(interaction, context);
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
		consoleLog(`${getTimestamp()} Interaction handling error: `, err);
	}
}

// Discord commands.
async function commandHelp(interaction, context) {
	const { CONFIG, getLocText, safeReply, colorize, consoleLog, getTimestamp } = context;
	
	try {
		const HELP_TEXT = getLocText(interaction, 'helpText', { kickChance: CONFIG.kickChance });
		await safeReply(interaction, HELP_TEXT);
	} catch (err) {
		if (isIgnorableInteractionError(err)) return;
		consoleLog(`${getTimestamp()} Failed to execute command [/${interaction.commandName}] : `, err);
		await safeReply(interaction, { content: getLocText(interaction, 'replyCommandError', { commandName: `/${interaction.commandName}` }), flags: [MessageFlags.Ephemeral] });
	}
}

async function commandInfo(interaction, context) {
	const { getLocText, safeReply, colorize, consoleLog, getTimestamp, packageJson } = context;
	
	try {
		const INFO_TEXT = getLocText(interaction, 'infoText');
		await safeReply(interaction, { content: `Narrator | ${packageJson.version}\n\n${INFO_TEXT}`, flags: [MessageFlags.Ephemeral] });
	} catch (err) {
		if (isIgnorableInteractionError(err)) return;
		consoleLog(`${getTimestamp()} Failed to execute command [/${interaction.commandName}] : `, err);
		await safeReply(interaction, { content: getLocText(interaction, 'replyCommandError', { commandName: `/${interaction.commandName}` }), flags: [MessageFlags.Ephemeral] });
	}
}

async function commandRoleCreate(interaction, context) {
	const { CONFIG, locales, getLocText, safeReply, colorize, consoleLog, getTimestamp, isGuildNot, isRoleManagerNot, createSelectedRole } = context;
	
	try {
		if (await isGuildNot(interaction)) return;
		if (await isRoleManagerNot(interaction, CONFIG, locales)) return;

		const roleName = interaction.options.getString('name', true);
		const result = await createSelectedRole(interaction.guild, {
			name: roleName,
			reason: `Created by @${interaction.user.tag} (${interaction.user.id}).`
		});

		if (result.status !== 'created') {
			const key = ROLE_CREATE_ERROR_KEYS[result.status] ?? 'replyRoleCreateFailed';
			await safeReply(interaction, { content: getLocText(interaction, key, { limit: CONFIG.rolesMaxPerGuild }), flags: [MessageFlags.Ephemeral] });
			return;
		}

		consoleLog(`${getTimestamp()} Success: Created selected role '${result.role.id}' in guild '${interaction.guildId}' by @${interaction.user.tag} (${interaction.user.id}) via Discord`);
		await safeReply(interaction, {
			content: getLocText(interaction, 'replyRoleCreateSuccess', { role: `<@&${result.role.id}>` }),
			allowedMentions: { parse: [] },
			flags: [MessageFlags.Ephemeral]
		});
	} catch (err) {
		if (isIgnorableInteractionError(err)) return;
		consoleLog(`${getTimestamp()} Failed to execute command [/${interaction.commandName}] : `, err);
		await safeReply(interaction, { content: getLocText(interaction, 'replyCommandError', { commandName: `/${interaction.commandName}` }), flags: [MessageFlags.Ephemeral] });
	}
}

async function commandRoleGive(interaction, context) {
	const { CONFIG, locales, getLocText, safeReply, colorize, consoleLog, getTimestamp, isGuildNot, isRoleManagerNot, giveGuildRole } = context;

	try {
		if (await isGuildNot(interaction)) return;
		if (await isRoleManagerNot(interaction, CONFIG, locales)) return;

		const guild = interaction.guild;
		const targetUser = interaction.options.getUser('member');
		const member = interaction.options.getMember('member')
			?? (guild && targetUser ? await guild.members.fetch(targetUser.id).catch(() => null) : null);
		const roleId = interaction.options.getString('role', true);
		const role = guild?.roles.cache.get(roleId);

		const actor = CONFIG.whitelist.includes(interaction.user.id) ? null : interaction.member;
		const status = await giveGuildRole(guild, member, role, actor, `Given by @${interaction.user.tag} (${interaction.user.id}).`);

		if (status !== 'given') {
			const key = ROLE_GIVE_ERROR_KEYS[status] ?? 'replyRoleGiveFailed';
			await safeReply(interaction, {
				content: getLocText(interaction, key, { role: `<@&${roleId}>`, member: targetUser ? `<@${targetUser.id}>` : '' }),
				allowedMentions: { parse: [] },
				flags: [MessageFlags.Ephemeral]
			});
			return;
		}

		consoleLog(`${getTimestamp()} Success: Gave role '${role.id}' to '${member.id}' in guild '${guild.id}' by @${interaction.user.tag} (${interaction.user.id}) via Discord`);
		await safeReply(interaction, {
			content: getLocText(interaction, 'replyRoleGiveSuccess', { member: `<@${member.id}>`, role: `<@&${role.id}>` }),
			allowedMentions: { parse: [] },
			flags: [MessageFlags.Ephemeral]
		});
	} catch (err) {
		if (isIgnorableInteractionError(err)) return;
		consoleLog(`${getTimestamp()} Failed to execute command [/${interaction.commandName}] : `, err);
		await safeReply(interaction, { content: getLocText(interaction, 'replyCommandError', { commandName: `/${interaction.commandName}` }), flags: [MessageFlags.Ephemeral] });
	}
}

async function commandRoleTake(interaction, context) {
	const { CONFIG, locales, getLocText, safeReply, colorize, consoleLog, getTimestamp, isGuildNot, isRoleManagerNot, takeGuildRole } = context;

	try {
		if (await isGuildNot(interaction)) return;
		if (await isRoleManagerNot(interaction, CONFIG, locales)) return;

		const guild = interaction.guild;
		const targetUser = interaction.options.getUser('member');
		const member = interaction.options.getMember('member')
			?? (guild && targetUser ? await guild.members.fetch(targetUser.id).catch(() => null) : null);
		const roleId = interaction.options.getString('role', true);
		const role = guild?.roles.cache.get(roleId);

		const actor = CONFIG.whitelist.includes(interaction.user.id) ? null : interaction.member;
		const status = await takeGuildRole(guild, member, role, actor, `Taken by @${interaction.user.tag} (${interaction.user.id}).`);

		if (status !== 'taken') {
			const key = ROLE_TAKE_ERROR_KEYS[status] ?? 'replyRoleTakeFailed';
			await safeReply(interaction, {
				content: getLocText(interaction, key, { role: `<@&${roleId}>`, member: targetUser ? `<@${targetUser.id}>` : '' }),
				allowedMentions: { parse: [] },
				flags: [MessageFlags.Ephemeral]
			});
			return;
		}

		consoleLog(`${getTimestamp()} Success: Took role '${role.id}' from '${member.id}' in guild '${guild.id}' by @${interaction.user.tag} (${interaction.user.id}) via Discord`);
		await safeReply(interaction, {
			content: getLocText(interaction, 'replyRoleTakeSuccess', { member: `<@${member.id}>`, role: `<@&${role.id}>` }),
			allowedMentions: { parse: [] },
			flags: [MessageFlags.Ephemeral]
		});
	} catch (err) {
		if (isIgnorableInteractionError(err)) return;
		consoleLog(`${getTimestamp()} Failed to execute command [/${interaction.commandName}] : `, err);
		await safeReply(interaction, { content: getLocText(interaction, 'replyCommandError', { commandName: `/${interaction.commandName}` }), flags: [MessageFlags.Ephemeral] });
	}
}

async function commandRoleAdd(interaction, context) {
	const { CONFIG, locales, getLocText, safeReply, colorize, consoleLog, getTimestamp, isGuildNot, isRoleManagerNot, validateRoleSelection, addGuildRole } = context;
	
	try {
		if (await isGuildNot(interaction)) return;
		if (await isRoleManagerNot(interaction, CONFIG, locales)) return;

		const guild = interaction.guild;
		const optionRoleId = interaction.options.getString('role', true);
		const role = guild?.roles.cache.get(optionRoleId);
		
		const actor = CONFIG.whitelist.includes(interaction.user.id) ? null : interaction.member;
		const problem = guild ? validateRoleSelection(guild, role, actor) : 'notFound';
		
		if (problem) {
			await safeReply(interaction, {
				content: getLocText(interaction, ROLE_ERROR_KEYS[problem], { role: `<@&${optionRoleId}>` }),
				allowedMentions: { parse: [] },
				flags: [MessageFlags.Ephemeral]
			});
			return;
		}

		const result = addGuildRole(guild.id, role.id);
		if (result === 'exists') {
			await safeReply(interaction, {
				content: getLocText(interaction, 'replyRoleAddExists', { role: `<@&${role.id}>` }),
				allowedMentions: { parse: [] },
				flags: [MessageFlags.Ephemeral]
			});
			return;
		}
		if (result === 'limit') {
			await safeReply(interaction, {
				content: getLocText(interaction, 'replyRoleAddLimit', { limit: CONFIG.rolesMaxPerGuild }),
				flags: [MessageFlags.Ephemeral]
			});
			return;
		}

		consoleLog(`${getTimestamp()} Success: Selected role '${role.id}' in guild '${guild.id}' by @${interaction.user.tag} (${interaction.user.id}) via Discord`);
		await safeReply(interaction, {
			content: getLocText(interaction, 'replyRoleAddSuccess', { role: `<@&${role.id}>` }),
			allowedMentions: { parse: [] },
			flags: [MessageFlags.Ephemeral]
		});
	} catch (err) {
		if (isIgnorableInteractionError(err)) return;
		consoleLog(`${getTimestamp()} Failed to execute command [/${interaction.commandName}] : `, err);
		await safeReply(interaction, { content: getLocText(interaction, 'replyCommandError', { commandName: `/${interaction.commandName}` }), flags: [MessageFlags.Ephemeral] });
	}
}

async function commandRoleRemove(interaction, context) {
	const { CONFIG, locales, getLocText, safeReply, colorize, consoleLog, getTimestamp, isGuildNot, isRoleManagerNot, removeGuildRole } = context;
	
	try {
		if (await isGuildNot(interaction)) return;
		if (await isRoleManagerNot(interaction, CONFIG, locales)) return;

		const roleId = interaction.options.getString('role', true);
		const result = /^\d{5,25}$/.test(roleId) ? removeGuildRole(interaction.guildId, roleId) : 'missing';
		if (result === 'missing') {
			await safeReply(interaction, {
				content: getLocText(interaction, 'replyRoleRemoveNotFound', { role: `<@&${roleId}>` }),
				allowedMentions: { parse: [] },
				flags: [MessageFlags.Ephemeral]
			});
			return;
		}

		consoleLog(`${getTimestamp()} Success: Unselected role '${roleId}' in guild '${interaction.guildId}' by @${interaction.user.tag} (${interaction.user.id}) via Discord`);
		await safeReply(interaction, {
			content: getLocText(interaction, 'replyRoleRemoveSuccess', { role: `<@&${roleId}>` }),
			allowedMentions: { parse: [] },
			flags: [MessageFlags.Ephemeral]
		});
	} catch (err) {
		if (isIgnorableInteractionError(err)) return;
		consoleLog(`${getTimestamp()} Failed to execute command [/${interaction.commandName}] : `, err);
		await safeReply(interaction, { content: getLocText(interaction, 'replyCommandError', { commandName: `/${interaction.commandName}` }), flags: [MessageFlags.Ephemeral] });
	}
}

async function commandRoleList(interaction, context) {
	const { CONFIG, locales, getLocText, safeReply, colorize, consoleLog, getTimestamp, isGuildNot, isRoleManagerNot, getGuildRoles } = context;
	
	try {
		if (await isGuildNot(interaction)) return;
		if (await isRoleManagerNot(interaction, CONFIG, locales)) return;

		const ids = getGuildRoles(interaction.guildId);
		if (ids.length === 0) {
			await safeReply(interaction, { content: getLocText(interaction, 'replyRoleListEmpty'), flags: [MessageFlags.Ephemeral] });
			return;
		}

		const deleted = getLocText(interaction, 'replyRoleDeleted');
		const rows = ids.map(id => {
			const role = interaction.guild?.roles.cache.get(id);
			return role
				? { rich: `- <@&${id}> \`${id}\``, plain: `${role.name} (${id})` }
				: { rich: `- \`${id}\` ${deleted}`, plain: `${id} ${deleted}` };
		});
		const header = getLocText(interaction, 'replyRoleListHeader', { count: ids.length });
		const text = `${header}\n${rows.map(r => r.rich).join('\n')}`;

		if (text.length > 1900) {
			const file = new AttachmentBuilder(Buffer.from(`${header}\n${rows.map(r => r.plain).join('\n')}`, 'utf8'), { name: 'role-list.txt' });
			await safeReply(interaction, { files: [file], flags: [MessageFlags.Ephemeral] });
		} else {
			await safeReply(interaction, { content: text, allowedMentions: { parse: [] }, flags: [MessageFlags.Ephemeral] });
		}
	} catch (err) {
		if (isIgnorableInteractionError(err)) return;
		consoleLog(`${getTimestamp()} Failed to execute command [/${interaction.commandName}] : `, err);
		await safeReply(interaction, { content: getLocText(interaction, 'replyCommandError', { commandName: `/${interaction.commandName}` }), flags: [MessageFlags.Ephemeral] });
	}
}

async function commandLotteryKick(interaction, context) {
	const { CONFIG, getLocText, safeReply, colorize, consoleLog, getTimestamp, isWhitelist, isGuildNot } = context;
	
	try {
		if (await isGuildNot(interaction)) return;
		if (await isWhitelist(interaction)) return;
		
		const roll = Math.floor(Math.random() * 100) + 1;
		if (roll <= CONFIG.kickChance) {
			if (!interaction.member?.kickable) {
				await safeReply(interaction, {
					content: getLocText(interaction, 'replyLotteryKickError', { userId: interaction.user.id }),
					flags: [MessageFlags.Ephemeral]
				});
				return;
			}
			
			const kickMsg = getLocText(interaction, 'replyLotteryKickYes', { userId: interaction.user.id });
			await safeReply(interaction, kickMsg);
			await new Promise(resolve => setTimeout(resolve, 30000));
			try {
				let inviteCode = null;
				try {
					const invite = await interaction.channel.createInvite({ maxAge: 86400, maxUses: 1, unique: true });
					inviteCode = invite.code;
				} catch (err) {
					consoleLog(`${getTimestamp()} WARNING: Couldn't create invite for @${interaction.user.tag}: `, err.message);
				}

				if (inviteCode) {
					try {
						await interaction.user.send(getLocText(interaction, 'replyLotteryKickDm', { inviteCode }));
					} catch (err) {
						consoleLog(`${getTimestamp()} WARNING: Couldn't DM @${interaction.user.tag}: `, err.message);
					}
				}

				await interaction.member.kick(getLocText(interaction, 'replyLotteryKickReason'));
			} catch (err) {
				consoleLog(`${getTimestamp()} ERROR: Couldn't kick user @${interaction.user.tag}: `, err.message);
				const errorKick = getLocText(interaction, 'replyLotteryKickError', { userId: interaction.user.id });
				await interaction.followUp({ content: errorKick, flags: [MessageFlags.Ephemeral] });
			}
		} else {
			const noKickMsg = getLocText(interaction, 'replyLotteryKickNo', { userId: interaction.user.id });
			await safeReply(interaction, noKickMsg);
		}
	} catch (err) {
		if (isIgnorableInteractionError(err)) return;
		consoleLog(`${getTimestamp()} Failed to execute command [/${interaction.commandName}] : `, err);
		await safeReply(interaction, { content: getLocText(interaction, 'replyCommandError', { commandName: `/${interaction.commandName}` }), flags: [MessageFlags.Ephemeral] });
	}
}

async function commandLore(interaction, context) {
	const { getLocalizedLoreSnippets, getLocText, safeReply, colorize, consoleLog, getTimestamp, isGuildNot } = context;
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
		consoleLog(`${getTimestamp()} Failed to execute command [/${interaction.commandName}] : `, err);		
		await safeReply(interaction, { content: getLocText(interaction, 'replyCommandError', { commandName: `/${interaction.commandName}` }), flags: [MessageFlags.Ephemeral] });
	}
}

async function commandLoreList(interaction, context) {
	const { getLocText, safeReply, colorize, consoleLog, getTimestamp, loadSafeModule, isGuildNot, isAdminManageServer } = context;
	
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
			const lang = file.replace(`${guildId}_`, '').replace(LORE_EXT, '');
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
		consoleLog(`${getTimestamp()} Failed to execute command [/${interaction.commandName}] : `, err);
		await safeReply(interaction, { content: getLocText(interaction, 'replyCommandError', { commandName: `/${interaction.commandName}` }), flags: [MessageFlags.Ephemeral] });
	}
}

async function commandLoreCreate(interaction, context) {
	const { getLocText, removeDuplicateLoreInFiles, safeReply, colorize, consoleLog, getTimestamp, getLoreFilePath, getLoreMaxBytes, readLoreFileStrict, writeLoreFile, exceedsLoreLimit, isGuildNot, isAdminManageServer } = context;
	
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
			await safeReply(interaction, { content: getLocText(interaction, 'replyLoreCreateTooLarge', { limit: getLoreMaxBytes() }), flags: [MessageFlags.Ephemeral] });
			return;
		}

		writeLoreFile(filePath, snippets);
		removeDuplicateLoreInFiles(loresDir, filePath);

		consoleLog(`${getTimestamp()} Success: Added snippet via Discord to '${filePath}'`);
		await safeReply(interaction, { content: getLocText(interaction, 'replyLoreCreateSuccess', { guildId: guildIdArg, lang: langArg }), flags: [MessageFlags.Ephemeral] });
	} catch (err) {
		if (isIgnorableInteractionError(err)) return;
		consoleLog(`${getTimestamp()} Failed to execute command [/${interaction.commandName}] : `, err);
		await safeReply(interaction, { content: getLocText(interaction, 'replyCommandError', { commandName: `/${interaction.commandName}` }), flags: [MessageFlags.Ephemeral] });
	}
}

async function commandLoreRemove(interaction, context) {
	const { getLocText, removeDuplicateLoreInFiles, safeReply, colorize, consoleLog, getTimestamp, getLoreFilePath, readLoreFileStrict, writeLoreFile, isGuildNot, isAdminManageServer } = context;
	
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
			removeDuplicateLoreInFiles(loresDir, filePath);

			consoleLog(`${getTimestamp()} Success: Removed snippet #${snippetNumber} from '${path.basename(filePath)}' via Discord`);
			await safeReply(interaction, { content: getLocText(interaction, 'replyLoreRemoveSuccess', { number: snippetNumber }), flags: [MessageFlags.Ephemeral] });
		} else {
			await safeReply(interaction, { content: getLocText(interaction, 'replyLoreRemoveNotFound', { number: snippetNumber }), flags: [MessageFlags.Ephemeral] });
		}
	} catch (err) {
		if (isIgnorableInteractionError(err)) return;
		consoleLog(`${getTimestamp()} Failed to execute command [/${interaction.commandName}] : `, err);
		await safeReply(interaction, { content: getLocText(interaction, 'replyCommandError', { commandName: `/${interaction.commandName}` }), flags: [MessageFlags.Ephemeral] });
	}
}

async function commandVoiceJoin(interaction, context) {
	const { getLocText, saveVoiceState, safeReply, colorize, consoleLog, getTimestamp, joinVoice, isWhitelistNot, isSelectedRoleNot, isGuildNot, voiceConnections, guildPlayers, guildVolumes, currentVolume } = context;
	
	try {
		if (await isGuildNot(interaction)) return;
		if (await isSelectedRoleNot(interaction)) return;

		const optionVoiceChannel = interaction.options.getChannel('channel');
		if (!optionVoiceChannel || !optionVoiceChannel.isVoiceBased()) {
			await safeReply(interaction, { content: getLocText(interaction, 'replyVoiceNotFound', { channelId: optionVoiceChannel?.id ?? 'unknown' }), flags: [MessageFlags.Ephemeral] });
			return;
		}
		
		try {
			await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
		} catch (err) {
			if (err.code === 10062) return;
			throw err;
		}

		try {
			await joinVoice(optionVoiceChannel, voiceConnections, guildPlayers);
		} catch (err) {
			consoleLog(`${getTimestamp()} ${err.message}`);
			await safeReply(interaction, { content: getLocText(interaction, 'replyCommandError', { commandName: `/${interaction.commandName}` }), flags: [MessageFlags.Ephemeral] });
			return;
		}
		saveVoiceState(voiceConnections, guildPlayers, guildVolumes, currentVolume);

		consoleLog(`${getTimestamp()} Successfully joined the voice channel '${optionVoiceChannel.name}' (${optionVoiceChannel.id}) by @${interaction.user.tag} (${interaction.user.id})`);
		await safeReply(interaction, { content: getLocText(interaction, 'replyVoiceJoinSuccess', { channelName: optionVoiceChannel.name }), flags: [MessageFlags.Ephemeral] });
	} catch (err) {
		if (isIgnorableInteractionError(err)) return;
		consoleLog(`${getTimestamp()} Failed to execute command [/${interaction.commandName}] : `, err);
		await safeReply(interaction, { content: getLocText(interaction, 'replyCommandError', { commandName: `/${interaction.commandName}` }), flags: [MessageFlags.Ephemeral] });
	}
}

async function commandVoiceLeave(interaction, context) {
	const { getLocText, saveVoiceState, safeReply, colorize, consoleLog, getTimestamp, isWhitelistNot, isSelectedRoleNot, isGuildNot, isVoiceNot, voiceConnections, guildPlayers, guildVolumes, currentVolume } = context;
	
	try {
		if (await isGuildNot(interaction)) return;
		if (await isVoiceNot(interaction, voiceConnections)) return;
		if (await isSelectedRoleNot(interaction)) return;
		
		const connection = voiceConnections.get(interaction.guildId);
		const activePlayer = guildPlayers.get(interaction.guildId);
		voiceConnections.delete(interaction.guildId);
		guildPlayers.delete(interaction.guildId);
		try { activePlayer?.player.stop(true); } catch (err) {}
		try { connection?.destroy(); } catch (err) {}
		saveVoiceState(voiceConnections, guildPlayers, guildVolumes, currentVolume);
		
		consoleLog(`${getTimestamp()} Successfully left voice channel for guild ID '${interaction.guildId}' by @${interaction.user.tag} (${interaction.user.id})`);
		await safeReply(interaction, { content: getLocText(interaction, 'replyVoiceLeaveSuccess'), flags: [MessageFlags.Ephemeral] });
	} catch (err) {
		if (isIgnorableInteractionError(err)) return;
		consoleLog(`${getTimestamp()} Failed to execute command [/${interaction.commandName}] : `, err);
		await safeReply(interaction, { content: getLocText(interaction, 'replyCommandError', { commandName: `/${interaction.commandName}` }), flags: [MessageFlags.Ephemeral] });
	}
}

async function commandSoundboardPlay(interaction, context) {
	const { getLocText, saveVoiceState, safeReply, colorize, consoleLog, getTimestamp, getSoundFilePath, setupPlayerEvents, isWhitelistNot, isSelectedRoleNot, isGuildNot, isVoiceNot, voiceConnections, guildVolumes, guildPlayers, currentVolume, getCurrentVolume } = context;
	
	try {
		if (await isGuildNot(interaction)) return;
		if (await isVoiceNot(interaction, voiceConnections)) return;
		if (await isSelectedRoleNot(interaction)) return;

		const soundChoice = interaction.options.getString('sound');
		const soundPath = getSoundFilePath(soundChoice);
		if (!soundPath || !fs.existsSync(soundPath)) {
			await safeReply(interaction, { content: getLocText(interaction, 'replySoundboardPlayNotFound', { soundChoice }), flags: [MessageFlags.Ephemeral] });
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
			soundName: path.basename(soundPath, SOUND_EXT),
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

		consoleLog(`${getTimestamp()} Played sound '${soundChoice}' for guild ID '${interaction.guildId}'.`);
		await safeReply(interaction, { content: getLocText(interaction, 'replySoundboardPlayPlaying', { soundChoice }), flags: [MessageFlags.Ephemeral] });
	} catch (err) {
		if (isIgnorableInteractionError(err)) return;
		consoleLog(`${getTimestamp()} Failed to execute command [/${interaction.commandName}] : `, err);
		await safeReply(interaction, { content: getLocText(interaction, 'replyCommandError', { commandName: `/${interaction.commandName}` }), flags: [MessageFlags.Ephemeral] });
	}
}

async function commandSoundboardStop(interaction, context) {
	const { getLocText, saveVoiceState, safeReply, colorize, consoleLog, getTimestamp, isWhitelistNot, isSelectedRoleNot, isGuildNot, isVoiceNot, voiceConnections, guildPlayers, guildVolumes, currentVolume } = context;
	
	try {
		if (await isGuildNot(interaction)) return;
		if (await isVoiceNot(interaction, voiceConnections)) return;
		if (await isSelectedRoleNot(interaction)) return;
		
		const activeEntry = guildPlayers.get(interaction.guildId);
		if (activeEntry?.player) {
			activeEntry.player.stop();
			guildPlayers.delete(interaction.guildId);
		}
		saveVoiceState(voiceConnections, guildPlayers, guildVolumes, currentVolume);
		
		consoleLog(`${getTimestamp()} Stopped playback for guild ID '${interaction.guildId}'.`);
		await safeReply(interaction, { content: getLocText(interaction, 'replySoundboardStopSuccess'), flags: [MessageFlags.Ephemeral] });
	} catch (err) {
		if (isIgnorableInteractionError(err)) return;
		consoleLog(`${getTimestamp()} Failed to execute command [/${interaction.commandName}] : `, err);
		await safeReply(interaction, { content: getLocText(interaction, 'replyCommandError', { commandName: `/${interaction.commandName}` }), flags: [MessageFlags.Ephemeral] });
	}
}

async function commandSoundboardVolume(interaction, context) {
	const { getLocText, saveVoiceState, safeReply, colorize, consoleLog, getTimestamp, isWhitelistNot, isSelectedRoleNot, isGuildNot, voiceConnections, guildVolumes, guildPlayers, currentVolume } = context;
	try {
		if (await isGuildNot(interaction)) return;
		if (await isSelectedRoleNot(interaction)) return;
		
		const volumePercent = interaction.options.getInteger('level');
		const volume = volumePercent / 100;
		guildVolumes.set(interaction.guildId, volume);
		const activeEntry = guildPlayers.get(interaction.guildId);
		if (activeEntry?.resource?.volume) {
			try { activeEntry.resource.volume.setVolume(volume); } catch (err) {}
		}
		saveVoiceState(voiceConnections, guildPlayers, guildVolumes, currentVolume);
		
		consoleLog(`${getTimestamp()} Volume set to ${volumePercent}% for guild ID '${interaction.guildId}'.`);
		await safeReply(interaction, { content: getLocText(interaction, 'replySoundboardVolumeSuccess', { volume: volumePercent }), flags: [MessageFlags.Ephemeral] });
	} catch (err) {
		if (isIgnorableInteractionError(err)) return;
		consoleLog(`${getTimestamp()} Failed to execute command [/${interaction.commandName}] : `, err);
		await safeReply(interaction, { content: getLocText(interaction, 'replyCommandError', { commandName: `/${interaction.commandName}` }), flags: [MessageFlags.Ephemeral] });
	}
}

module.exports = { getCommands, handleDiscordInteraction };
