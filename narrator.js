// Dependencies.
require('dotenv').config();
const fs = require('fs');
const readline = require('readline');
const { spawn, exec } = require('child_process');
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, ActivityType, InteractionContextType, MessageFlags, ChannelType } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, StreamType, VoiceConnectionStatus } = require('@discordjs/voice');

// Localization.
function loadSafeModule(filePath, fallbackValue) {
    try {
        if (fs.existsSync(filePath)) {
            return require(filePath);
        }
    } catch (error) {
        console.log(`[Warning] Could not load file at ${filePath}:`, error.message);
    }
    return fallbackValue;
}

const locales = {
    en: loadSafeModule('./locales/en.js', {}),
    uk: loadSafeModule('./locales/uk.js', {})
};

const defaultLang = 'en'; 

function getCmdText(key) {
    return locales[defaultLang]?.[key] || locales['uk'][key] || key;
}

function getLocText(interaction, key, variables = {}) {
    const langCode = interaction.locale?.startsWith('en') ? 'en' : 'uk';
    let text = locales[langCode]?.[key] || locales['uk'][key] || key;
	
    for (const [varName, value] of Object.entries(variables)) {
        text = text.replace(new RegExp(`\\{${varName}\\}`, 'g'), value);
    }
    return text;
}

const rawSnippetsUk = loadSafeModule('./locales/uk-lore.js', []);
const rawSnippetsEn = loadSafeModule('./locales/en-lore.js', []);

function getLocalizedLoreSnippets(interaction) {
    const langCode = interaction.locale?.startsWith('en') ? 'en' : 'uk';
    const snippets = langCode === 'en' ? rawSnippetsEn : rawSnippetsUk;
    
    return snippets.map(snippet => 
        snippet
			// Variables for lore snippets.
            .replace('$loreLink$', CONFIG.loreLink)
            .replace('$loreLinkKey$', CONFIG.loreLinkKey)
    );
}

process.on('unhandledRejection', error => {
    consoleLog(`[${getTimestamp()}] Unhandled promise rejection: `, error);
});

// Create a new client instance with necessary intents.
const client = new Client({
	intents: [
		GatewayIntentBits.Guilds,
		GatewayIntentBits.GuildMessages,
		GatewayIntentBits.MessageContent,
		GatewayIntentBits.GuildVoiceStates
	]
});

// Variables.
let isBotReady = false;
let currentAudioResource = null;
let currentVolume = 1.0;

const voiceConnections = new Map();
const guildVolumes = new Map();
const guildPlayers = new Map();

const CONFIG = {
	statusBot: process.env.STATUS,
	statusName: process.env.STATUS_NAME,
	statusType: process.env.STATUS_TYPE,
	statusUrl: process.env.STATUS_URL,
	
	kickChance: parseInt(process.env.KICK_CHANCE, 10) || 10,
	whitelist: process.env.WHITELIST ? process.env.WHITELIST.split(',') : [],
	authorizedTesters: process.env.AUTHORIZED_TESTERS ? process.env.AUTHORIZED_TESTERS.split(',') : [],
	
	loreLink: process.env.LORE_LINK,
	loreLinkKey: process.env.LORE_LINK_KEY
}

// Discord Commands Information.
const commands = [
	new SlashCommandBuilder().setName('help').setDescription(getCmdText('descHelp')),
	new SlashCommandBuilder().setName('lore').setDescription(getCmdText('descLore')),
	new SlashCommandBuilder().setName('info').setDescription(getCmdText('descInfo')),
	new SlashCommandBuilder().setName('lottery-kick').setDescription(getCmdText('descLotteryKick').replace('{kickChance}', CONFIG.kickChance)).setContexts([InteractionContextType.Guild]),
	new SlashCommandBuilder().setName('voice-join').setDescription(getCmdText('descVoiceJoin')).setContexts([InteractionContextType.Guild]).addChannelOption(option =>
		option.setName('channel').setDescription(getCmdText('optionChannel')).addChannelTypes(ChannelType.GuildVoice).setRequired(true)),
	new SlashCommandBuilder().setName('voice-leave').setDescription(getCmdText('descVoiceLeave')).setContexts([InteractionContextType.Guild]),
	new SlashCommandBuilder().setName('soundboard-play').setDescription(getCmdText('descSoundboardPlay')).setContexts([InteractionContextType.Guild]).addStringOption(option =>
		option.setName('sound').setDescription(getCmdText('optionSound')).setRequired(true).setAutocomplete(true)),
	new SlashCommandBuilder().setName('soundboard-stop').setDescription(getCmdText('descSoundboardStop')).setContexts([InteractionContextType.Guild]),
	new SlashCommandBuilder().setName('soundboard-volume').setDescription(getCmdText('descSoundboardVolume')).setContexts([InteractionContextType.Guild]).addIntegerOption(option =>
		option.setName('level').setDescription(getCmdText('optionVolumeLevel')).setMinValue(0).setMaxValue(100).setRequired(true))
].map(command => command.toJSON());

// Run this code after the client is ready.
client.once('clientReady', async () => {
	consoleLog(`\nPress Ctrl+C to shut down bot.\nPrint "help" for commands.\n`);
	consoleLog(`[${getTimestamp()}] Logged in as ${client.user.tag}!`);
	
	// Status.
	try {
		readline.clearLine(process.stdout, 0);
		readline.cursorTo(process.stdout, 0);
		process.stdout.write(`[${getTimestamp()}] Setting bot status up... `)
		client.user.setPresence({
			activities: [{ name: CONFIG.statusName, type: ActivityType[CONFIG.statusType], url: CONFIG.statusUrl }],
			status: CONFIG.statusBot,
		});
		console.log('Success!');
	} catch (error) {
		consoleLog(error);
	}
	
	// Register slash (/).
	const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
	try {
		readline.clearLine(process.stdout, 0);
		readline.cursorTo(process.stdout, 0);
		process.stdout.write(`[${getTimestamp()}] Refreshing application (/) commands... `);
		
		await rest.put(
			Routes.applicationCommands(client.user.id),
			{ body: commands },
		);
		
		console.log('Success!');
		consoleLog(`[${getTimestamp()}] Waiting for commands...\n`);
		
		isBotReady = true;
		rl.prompt();
	} catch (error) {
		consoleLog(error);
	}
});

client.on('interactionCreate', async interaction => {
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
				const files = fs.readdirSync('./sounds');
				const choices = files
					.filter(file => file.endsWith('.mp3'))
					.map(file => file.replace('.mp3', ''));
				
				const focusedValue = interaction.options.getFocused();
				const filtered = choices.filter(choice => choice.toLowerCase().includes(focusedValue.toLowerCase()));
				
				await interaction.respond(
					filtered.slice(0, 25).map(choice => ({ name: choice, value: choice }))
				);
			} catch (error) {
				consoleLog('Error handling soundboard autocomplete: ', error);
			}
		}
		return;
	}
	
	if (!interaction.isChatInputCommand()) return;
	
	switch (interaction.commandName) {
		case 'help':
			await commandHelp(interaction);
			break;
        case 'lore':
            await commandLore(interaction);
            break;
		case 'info':
            await commandInfo(interaction);
            break;
        case 'lottery-kick':
            await commandLotteryKick(interaction);
            break;
		case 'voice-join':
			await commandVoiceJoin(interaction);
            break;
		case 'voice-leave':
			await commandVoiceLeave(interaction);
            break;
		case 'soundboard-play':
			await commandSoundboardPlay(interaction);
			break;
		case 'soundboard-stop':
			await commandSoundboardStop(interaction);
			break;
		case 'soundboard-volume':
			await commandSoundboardVolume(interaction);
			break;
    }
});



// Functions.
function consoleLog(...args) {
	readline.clearLine(process.stdout, 0);
	readline.cursorTo(process.stdout, 0);
	console.log(...args);
	
	try {
		rl.prompt(true);
	} catch (err) {
		// Readline is closed, ignore or handle silently.
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

function makeLogMessage(interaction) {
	const logMessage = `[${getTimestamp()}] [Command Used] '/${interaction.commandName}' was executed by @${interaction.user.tag} (${interaction.user.id})`;
	consoleLog(logMessage);
}

// Add "if (await isWhiteListIn(interaction)) return;", if is in whitelist, and "if (await isWhiteListNot(interaction)) return;", if is not in whitelist, at the beggining of command to make it for Authorized Testers. Comment it with "//" to disable the tester check.
async function isWhiteListIn(interaction) {
	if(CONFIG.whitelist.includes(interaction.user.id)) {
		const logMessage = `[${getTimestamp()}] [Whitelist Command Used] '/${interaction.commandName}' was executed by a whitelist user: @${interaction.user.tag} (${interaction.user.id})`;
		consoleLog(logMessage);

		await interaction.reply({
			content: getLocText(interaction, 'replyWhitelistYes'),
			flags: [MessageFlags.Ephemeral]
		});
		return true;
	}
	return false;
}

async function isWhiteListNot(interaction) {
	if(!CONFIG.whitelist.includes(interaction.user.id)) {
		const logMessage = `[${getTimestamp()}] [Whitelist Command Failed] '/${interaction.commandName}' was executed by not a whitelist user: @${interaction.user.tag} (${interaction.user.id})`;
		consoleLog(logMessage);

		await interaction.reply({
			content: getLocText(interaction, 'replyWhitelistNo'),
			flags: [MessageFlags.Ephemeral]
		});
		return true;
	}
	return false;
}

// Add "if (!(await isAuthorizedTester(interaction))) return;" at the beggining of command to make it for Authorized Testers. Comment it with "//" to disable the tester check.
async function isAuthorizedTester(interaction) {
	if(!CONFIG.authorizedTesters.includes(interaction.user.id)) {
		const logMessage = `[${getTimestamp()}] [Testing Command Used] '/${interaction.commandName}' was executed by not a tester: @${interaction.user.tag} (${interaction.user.id})`;
		consoleLog(logMessage);

		await interaction.reply({
			content: getLocText(interaction, 'replyAuthorizedTester'),
			flags: [MessageFlags.Ephemeral]
		});
		return false;
	}
	return true;
}



// Discord Commands.
async function commandHelp(interaction) {
	//if (!(await isWhiteListIn(interaction))) return;
	//if (!(await isAuthorizedTester(interaction))) return;
	
	makeLogMessage(interaction);
	
	try {
		const HELP_TEXT = getLocText(interaction, 'helpText', {
			kickChance: CONFIG.kickChance
		});
		await interaction.reply(HELP_TEXT);
	} catch (error) {
		consoleLog(`[${getTimestamp()}] Failed to execute command [/${interaction.commandName}] :`, error);
		await interaction.reply({
			content: getLocText(interaction, 'replyCommandError', { commandName: '/help' }),
			flags: [MessageFlags.Ephemeral]
		})
	}
}

async function commandLore(interaction) {
	//if (!(await isWhiteListIn(interaction))) return;
	//if (!(await isAuthorizedTester(interaction))) return;
	
	makeLogMessage(interaction);
	
	try {
		const loreSnippets = getLocalizedLoreSnippets(interaction);
		const randomIndex = Math.floor(Math.random() * loreSnippets.length);
		
		const replyText = getLocText(interaction, 'replyLore', {
            loreSnippet: loreSnippets[randomIndex]
        });
		
		await interaction.reply(replyText);
	} catch (error) {
		consoleLog(`[${getTimestamp()}] Failed to execute command [/${interaction.commandName}] :`, error);		
		await interaction.reply({
			content:getLocText(interaction, 'replyCommandError', { commandName: '/lore' }),
			flags: [MessageFlags.Ephemeral]
		})
	}
}

async function commandInfo(interaction) {
	//if (!(await isWhiteListIn(interaction))) return;
	//if (!(await isAuthorizedTester(interaction))) return;
	
	makeLogMessage(interaction);
	
	try {
		const INFO_TEXT = getLocText(interaction, 'infoText', {
			loreLink: CONFIG.loreLink,
			loreLinkKey: CONFIG.loreLinkKey
		});
		
		await interaction.reply(INFO_TEXT);
	} catch (error) {
		consoleLog(`[${getTimestamp()}] Failed to execute command [/${interaction.commandName}] :`, error);
		await interaction.reply({
			content: getLocText(interaction, 'replyCommandError', { commandName: '/info' }),
			flags: [MessageFlags.Ephemeral]
		})
	}
}
	
async function commandLotteryKick(interaction) {
	if (await isWhiteListIn(interaction)) return;
	//if (!(await isAuthorizedTester(interaction))) return;
	
	makeLogMessage(interaction);
	
	try {
		
		if (!interaction.inGuild()) {
			await interaction.reply({
				content: getLocText(interaction, 'replyGuild'),
				flags: [MessageFlags.Ephemeral]
			});
			return;
		}
			
		const roll = Math.floor(Math.random() * 100) + 1;
		
		if (roll <= CONFIG.kickChance) {
			const kickMsg = getLocText(interaction, 'replyLotteryKickYes', {
                userId: interaction.user.id
            });
			
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
				const errorKick = getLocText(interaction, 'replyLotteryKickError', {
					userId: interaction.user.id
				});
				
				await interaction.followUp({
					content: errorKick,
					flags: [MessageFlags.Ephemeral]
				});
			}
		} else {
			const noKickMsg = getLocText(interaction, 'replyLotteryKickNo', { userId: interaction.user.id });
			await interaction.reply(noKickMsg);
		}
	} catch (error) {
		consoleLog(`[${getTimestamp()}] Failed to execute command [/${interaction.commandName}] :`, error);
		await interaction.reply({
			content: getLocText(interaction, 'replyCommandError', { commandName: '/lottery-kick' }),
			flags: [MessageFlags.Ephemeral]
		})
	}
}

async function commandVoiceJoin(interaction) {
	if (await isWhiteListNot(interaction)) return;
	//if (!(await isAuthorizedTester(interaction))) return;
	
	makeLogMessage(interaction);
	
	try {
		if (!interaction.inGuild()) {
			await interaction.reply({
				content: getLocText(interaction, 'replyGuild'),
				flags: [MessageFlags.Ephemeral]
			});
			return;
		}
		
		const optionChannel = interaction.options.getChannel('channel');
		let targetChannel = optionChannel;
		
		if (!targetChannel) {
			const voiceNotFound = getLocText(interaction, 'replyVoiceNotFound', {
				channelId: optionChannel?.id || 'unknown'
			});
			await interaction.reply({
				content: voiceNotFound,
				flags: [MessageFlags.Ephemeral]
			})
			return;
		}
		try {
			const connection = joinVoiceChannel({
				channelId: targetChannel.id,
				guildId: targetChannel.guild.id,
				adapterCreator: targetChannel.guild.voiceAdapterCreator,
			});

			voiceConnections.set(targetChannel.guild.id, connection);

			// Handle automatic cleanup if the bot is disconnected or kicked from the voice state.
			connection.on('stateChange', (oldState, newState) => {
				if (newState.status === VoiceConnectionStatus.Disconnected) {
					voiceConnections.delete(targetChannel.guild.id);
				}
			});
			
			const voiceJoin = getLocText(interaction, 'replyVoiceJoinSuccess', {
				channelName: targetChannel.name
			});
			
			consoleLog(`[${getTimestamp()}] Successfully joined the voice channel '${targetChannel.name}' (${targetChannel.id}) by @${interaction.user.tag} (${interaction.user.id})`);
			await interaction.reply(voiceJoin);
		} catch (error) {
			consoleLog(`[${getTimestamp()}] Failed to join voice channel: `, error);
			await interaction.reply({
				content: getLocText(interaction, 'replyVoiceJoinError'),
				flags: [MessageFlags.Ephemeral]
			})
		}
	} catch (error) {
		consoleLog(`[${getTimestamp()}] Failed to execute command [/${interaction.commandName}] :`, error);
		await interaction.reply({
			content: getLocText(interaction, 'replyCommandError', { commandName: '/voice-join' }),
			flags: [MessageFlags.Ephemeral]
		})
	}
}

async function commandVoiceLeave(interaction) {
	if (await isWhiteListNot(interaction)) return;
	//if (!(await isAuthorizedTester(interaction))) return;
	
	makeLogMessage(interaction);
	
	try {
		if (!interaction.inGuild()) {
			await interaction.reply({
				content: getLocText(interaction, 'replyGuild'),
				flags: [MessageFlags.Ephemeral]
			});
			return;
		}
		
		const connection = voiceConnections.get(interaction.guildId);
		if (!connection) {
			await interaction.reply({
				content: getLocText(interaction, 'replyNotInVoice'), 
				flags: [MessageFlags.Ephemeral]
			});
			return;
		}
		
		try {
			connection.destroy();
			voiceConnections.delete(interaction.guildId);
			consoleLog(`[${getTimestamp()}] Successfully left voice channel for guild '${interaction.guildId}' by @${interaction.user.tag} (${interaction.user.id})`);
			await interaction.reply(getLocText(interaction, 'replyVoiceLeaveSuccess'));
		} catch (error) {
			consoleLog(`[${getTimestamp()}] Failed to leave voice channel: `, error);
			await interaction.reply({
				content: getLocText(interaction, 'replyVoiceLeaveError'),
				flags: [MessageFlags.Ephemeral]
			});
		}
	} catch (error) {
		consoleLog(`[${getTimestamp()}] Failed to execute command [/${interaction.commandName}] :`, error);
		await interaction.reply({
			content: getLocText(interaction, 'replyCommandError', { commandName: '/voice-leave' }),
			flags: [MessageFlags.Ephemeral]
		});
	}
}

async function commandSoundboardPlay(interaction) {
	if (await isWhiteListNot(interaction)) return;
	//if (!(await isAuthorizedTester(interaction))) return;
	
	makeLogMessage(interaction);
	
	try {
		if (!interaction.inGuild()) {
			await interaction.reply({
				content: getLocText(interaction, 'replyGuild'),
				flags: [MessageFlags.Ephemeral]
			});
			return;
		}
		
		const connection = voiceConnections.get(interaction.guildId);
		if (!connection) {
			await interaction.reply({
				content: getLocText(interaction, 'replyNotInVoice'),
				flags: [MessageFlags.Ephemeral]
			});
			return;
		}
		
		const soundChoice = interaction.options.getString('sound');
		const soundPath = `./sounds/${soundChoice}.mp3`;
		
		if (!fs.existsSync(soundPath)) {
			await interaction.reply({
				content: getLocText(interaction, 'replySoundboardPlayNotFound'),
				flags: [MessageFlags.Ephemeral]
			});
			return;
		}
		
		try {
			const playingMsg = getLocText(interaction, 'replySoundboardPlayPlaying', {
				soundChoice: soundChoice
			});
			
			consoleLog(`[${getTimestamp()}] Playing soundboard item for guild '${interaction.guildId}': '${soundChoice}.mp3'...`);
			await interaction.reply(playingMsg);
			
			const player = createAudioPlayer();
			const resource = createAudioResource(soundPath, {
				inlineVolume: true
			});
			const volume = guildVolumes.get(interaction.guildId) ?? currentVolume;
			resource.volume.setVolume(volume);
			currentAudioResource = resource;
			
			guildPlayers.set(interaction.guildId, { player, resource });
			
			connection.subscribe(player);
			player.play(resource);
			
			player.on('idle', () => {
				consoleLog(`[${getTimestamp()}] Soundboard sound '${soundChoice}.mp3' finished playing in guild '${interaction.guildId}'.`);
			});
		} catch (error) {
			consoleLog(`[${getTimestamp()}] Failed to play soundboard audio in guild '${interaction.guildId}': `, error);
			await interaction.reply({
				content: getLocText(interaction, 'replySoundboardPlayError'),
				flags: [MessageFlags.Ephemeral]
			});
		}
	} catch (error) {
		consoleLog(`[${getTimestamp()}] Failed to execute command [/${interaction.commandName}] :`, error);
		await interaction.reply({
			content: getLocText(interaction, 'replyCommandError', { commandName: '/soundboard-play' }),
			flags: [MessageFlags.Ephemeral]
		});
	}
}


async function commandSoundboardStop(interaction) {
	if (await isWhiteListNot(interaction)) return;
	//if (!(await isAuthorizedTester(interaction))) return;
	
	makeLogMessage(interaction);
	
	try {
		if (!interaction.inGuild()) {
			await interaction.reply({
				content: getLocText(interaction, 'replyGuild'),
				flags: [MessageFlags.Ephemeral]
			});
			return;
		}
		
		const connection = voiceConnections.get(interaction.guildId);
		if (!connection) {
			await interaction.reply({
				content: getLocText(interaction, 'replyNotInVoice'),
				flags: [MessageFlags.Ephemeral]
			});
			return;
		}
				
		try {
			const stopPlayer = createAudioPlayer();
			connection.subscribe(stopPlayer);
			consoleLog(`[${getTimestamp()}] Sound playback stopped for guild '${interaction.guildId}' by @${interaction.user.tag} (${interaction.user.id})`);
			await interaction.reply(getLocText(interaction, 'replySoundboardStopSuccess'));
		} catch (error) {
			consoleLog(`[${getTimestamp()}] Failed to stop audio: `, error);
			await interaction.reply({
				content: getLocText(interaction, 'replySoundboardStopError'),
				flags: [MessageFlags.Ephemeral]
			});
		}
	} catch (error) {
		consoleLog(`[${getTimestamp()}] Failed to execute command [/${interaction.commandName}] :`, error);
		await interaction.reply({
			content: getLocText(interaction, 'replyCommandError', { commandName: '/soundboard-stop' }),
			flags: [MessageFlags.Ephemeral]
		})
	}
}

async function commandSoundboardVolume(interaction) {
    if (await isWhiteListNot(interaction)) return;
	//if (!(await isAuthorizedTester(interaction))) return;
    
    makeLogMessage(interaction);
    
    try {
        if (!interaction.inGuild()) {
            await interaction.reply({
                content: getLocText(interaction, 'replyGuild'),
                flags: [MessageFlags.Ephemeral]
            });
            return;
        }
        
		try {
			const volumePercent = interaction.options.getInteger('level');
			const volume = volumePercent / 100;
			
			guildVolumes.set(interaction.guildId, volume);
			
			const activeEntry = guildPlayers.get(interaction.guildId);
			if (activeEntry && activeEntry.resource && activeEntry.resource.volume) {
				try {
					activeEntry.resource.volume.setVolume(volume);
				} catch (e) {}
			}
			
			const successMsg = getLocText(interaction, 'replySoundboardVolumeSuccess', {
				volume: volumePercent
			});
			
			consoleLog(`[${getTimestamp()}] Voice volume for guild '${interaction.guildId}' set to ${volumePercent}% by @${interaction.user.tag} (${interaction.user.id})`);
			await interaction.reply(successMsg);
		} catch (error) {
			consoleLog(`[${getTimestamp()}] Failed to set audio volume: `, error);
			await interaction.reply({
				content: getLocText(interaction, 'replySoundboardVolumeError'),
				flags: [MessageFlags.Ephemeral]
			});
		}
	} catch (error) {
        consoleLog(`[${getTimestamp()}] Failed to execute command [/${interaction.commandName}] :`, error);
        await interaction.reply({
            content: getLocText(interaction, 'replyCommandError', { commandName: '/soundboard-volume' }),
            flags: [MessageFlags.Ephemeral]
        });
    }
}



// Terminal.
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
	prompt: '> '
});

rl.on('line', async (line) => {
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
			// BOT:
			case 'help':
				consoleLog(`[${getTimestamp()}] Commands:\nBOT:\n- help: Show terminal commands.\n- exit/stop/shutdown: Shut down the bot.\n- status: Status of the bot.\n- ping: Check bot latency.\n- clear: Clear the terminal screen.\n
SERVER:\n- echo: Send a message to a specific channel by ID or edit a message by ID.\n- lore: Print a random lore snippet.\n- info: Show bot info and links.\n- voice-join: Connect bot to specified voice channel by ID.\n- voice-leave: Disconnect bot from voice channel.\n- soundboard-play: Play the specified soundboard audio.\n- soundboard-stop: Stop playing the soundboard audio.\n- soundboard-volume: Set playback volume (0-100).`);
				consoleLog();
				break;
			
			case 'exit':
			case 'stop':
			case 'shutdown':
				consoleLog(`[${getTimestamp()}] Stopping bot via terminal command...`);
				shutdown();
				consoleLog();
				return;
			
			case 'status':
				consoleLog(`[${getTimestamp()}] Status:\n- Bot is ready: ${isBotReady}\n- Logged in as: ${client.user ? client.user.tag : 'Not yet'}\n- Server count: ${client.guilds.cache.size}`);
				consoleLog();
				break;
			
			case 'ping':
				consoleLog(`[${getTimestamp()}] Pinging...`);
				exec('ping -n 1 8.8.8.8', (error, stdout) => {
					if (error) {
						consoleLog(`[${getTimestamp()}] Failed to execute ping.`);
					} else {
						// Pull out the time from Windows ping output.
						const match = stdout.match(/time[=<](\d+ms)/i) || stdout.match(/рисует.*?(\d+ms)/i);
						const time = match ? match[1] : 'unknown';
						consoleLog(`[${getTimestamp()}] Pong! Network latency: ${time}`);
					}
					consoleLog();
					rl.prompt(true);
				});
				break;
			
			case 'clear':
				console.clear();
				break;
			
			// SERVER:
			case 'echo':
				if (args[1] === '-e') {
					// Format: echo -e [MESSAGE_ID] [EDITED_TEXT]
					const messageId = args[2];
					const newText = args.slice(3).join(' ').replace(/\\n/g, '\n');
					
					if (!messageId || !newText) {
						consoleLog(`[${getTimestamp()}] Error: Please provide a message ID and new text. Usage: echo -e [MESSAGE_ID] [EDITED_TEXT]\n`);
						break;
					}
					
					// Search across all text channels in the bot's guilds to find and edit the message.
					let targetMessage = null;
					let targetChannel = null;
					
					for (const [guildId, guild] of client.guilds.cache) {
						for (const [channelId, channel] of guild.channels.cache) {
							if (channel.isTextBased()) {
								try {
									const fetchedMsg = await channel.messages.fetch(messageId);
									if (fetchedMsg) {
										targetMessage = fetchedMsg;
										targetChannel = channel;
										break;
									}
								} catch (e) {
									// Message not in this channel, continue searching.
								}
							}
						}
						if (targetMessage) break;
					}
					
					if (!targetMessage) {
						consoleLog(`[${getTimestamp()}] Error: Could not find message with ID '${messageId}' in any accessible channel.\n`);
						break;
					}
					
					try {
						await targetMessage.edit(newText);
						consoleLog(`[${getTimestamp()}] Message successfully edited in channel #${targetChannel.name} (${targetChannel.id}).\n`);
					} catch (error) {
						consoleLog(`[${getTimestamp()}] Failed to edit message: `, error);
					}
				} else {
					// Format: echo [CHANNEL_ID] [MESSAGE]
					const channelId = args[1];
					const messageText = args.slice(2).join(' ').replace(/\\n/g, '\n');
					
					if (!channelId || !messageText) {
						consoleLog(`[${getTimestamp()}] Error: Please provide a channel ID and a message. Usage: echo [CHANNEL_ID] [MESSAGE]\n`);
						break;
					}
					
					let targetEchoChannel = null;
					for (const [guildId, guild] of client.guilds.cache) {
						const channel = guild.channels.cache.get(channelId);
						if (channel) {
							targetEchoChannel = channel;
							break;
						}
					}
					
					if (!targetEchoChannel || !targetEchoChannel.isTextBased()) {
						consoleLog(`[${getTimestamp()}] Error: Could not find a valid text channel with ID '${channelId}'.\n`);
						break;
					}
					
					try {
						await targetEchoChannel.send(messageText);
						consoleLog(`[${getTimestamp()}] Message successfully sent to channel #${targetEchoChannel.name} (${channelId}).\n`);
					} catch (error) {
						consoleLog(`[${getTimestamp()}] Failed to send message: `, error);
					}
				}
				break;
			
			case 'lore':
				const rawSnippets = defaultLang === 'en' ? rawSnippetsEn : rawSnippetsUk;
				if (!rawSnippets || rawSnippets.length === 0) {
					consoleLog(`[${getTimestamp()}] No lore snippets found.\n`);
					break;
				}
				
				const randomIndex = Math.floor(Math.random() * rawSnippets.length);
				const selectedSnippet = rawSnippets[randomIndex]
					.replace(/\$loreLink\$/g, CONFIG.loreLink || '')
					.replace(/\$loreLinkKey\$/g, CONFIG.loreLinkKey || '');
				
				const loreTemplate = locales[defaultLang]?.replyLore || locales['uk']?.replyLore || 'Lore: {loreSnippet}';
				const formattedLore = loreTemplate.replace(/\{loreSnippet\}/g, selectedSnippet);
				
				consoleLog(`[${getTimestamp()}] ${formattedLore}\n`);
				break;
			
			case 'info':
				const infoText = locales[defaultLang]?.infoText || locales['uk']?.infoText || 'Info text unavailable';
				const formattedInfo = infoText
					.replace(/\{loreLink\}/g, CONFIG.loreLink || '')
					.replace(/\{loreLinkKey\}/g, CONFIG.loreLinkKey || '');
				
				consoleLog(`[${getTimestamp()}] Bot Info:\n${formattedInfo}\n`);
				break;
			
			case 'voice-join':
				// Format: voice-join [CHANNEL_ID]
				const targetChannelId = args[1];
				if (!targetChannelId) {
					consoleLog(`[${getTimestamp()}] Error: Please provide a voice channel ID. Usage: voice-join [channelId]\n`);
					break;
				}
				
				// Find the channel across all guilds the bot is in.
				let targetChannel = null;
				for (const [guildId, guild] of client.guilds.cache) {
					const channel = guild.channels.cache.get(targetChannelId);
					if (channel) {
						targetChannel = channel;
						break;
					}
				}

				if (!targetChannel) {
					consoleLog(`[${getTimestamp()}] Error: Could not find voice channel with ID '${targetChannelId}'. Make sure the bot is in that server.\n`);
					break;
				}

				try {
					const connection = joinVoiceChannel({
						channelId: targetChannel.id,
						guildId: targetChannel.guild.id,
						adapterCreator: targetChannel.guild.voiceAdapterCreator,
					});
					voiceConnections.set(targetChannel.guild.id, connection);
					
					connection.on('stateChange', (oldState, newState) => {
						if (newState.status === VoiceConnectionStatus.Disconnected) {
							voiceConnections.delete(targetChannel.guild.id);
						}
					});
					
					consoleLog(`[${getTimestamp()}] Successfully joined voice channel: '${targetChannel.name}' (${targetChannel.id})`);
				} catch (error) {
					consoleLog(`[${getTimestamp()}] Failed to join voice channel: `, error);
				}
				consoleLog();
				break;
			
			case 'voice-leave':
				const leaveGuildId = args[1];
				if (!leaveGuildId) {
					// Global: voice-leave
					if (voiceConnections.size === 0) {
						consoleLog(`[${getTimestamp()}] Error: Bot is not currently in any voice channel.\n`);
						break;
					}
					try {
						for (const [gId, connection] of voiceConnections.entries()) {
							connection.destroy();
						}
						voiceConnections.clear();
						consoleLog(`[${getTimestamp()}] Successfully left all voice channels.`);
					} catch (error) {
						consoleLog(`[${getTimestamp()}] Failed to leave voice channels:`, error);
					}
					consoleLog();
					break;
				}

				// Guild-Specific: voice-leave [GUILD_ID]
				const connectionToLeave = voiceConnections.get(leaveGuildId);
				if (!connectionToLeave) {
					consoleLog(`[${getTimestamp()}] Error: Bot is not in a voice channel for guild ID '${leaveGuildId}'.\n`);
					break;
				}
				
				try {
					connectionToLeave.destroy();
					voiceConnections.delete(leaveGuildId);
					consoleLog(`[${getTimestamp()}] Successfully left the voice channel for guild ID '${leaveGuildId}'.`);
				} catch (error) {
					consoleLog(`[${getTimestamp()}] Failed to leave voice channel:`, error);
				}
				consoleLog();
				break;
			
			case 'soundboard-play':
				if (voiceConnections.size === 0) {
					consoleLog(`[${getTimestamp()}] Error: Bot is not in any voice channel. Run "voice-join" first.\n`);
					break;
				}
				
				let playGuildId = null;
				let rawTargetSound = '';
				
				if (args[1] && voiceConnections.has(args[1])) {
					// Guild specific: soundboard-play [GUILD_ID] [SOUND_NAME]
					playGuildId = args[1];
					rawTargetSound = args.slice(2).join(' ');
				} else {
					// Global: soundboard-play [SOUND_NAME]
					rawTargetSound = args.slice(1).join(' ');
				}
				
				if (!rawTargetSound) {
                    consoleLog(`[${getTimestamp()}] Error: Please provide a sound name. Usage: soundboard-play [filename]\n`);
                    break;
                }
				
				const targetSound = rawTargetSound.endsWith('.mp3') ? rawTargetSound.slice(0, -4) : rawTargetSound;
				const soundPath = `./sounds/${targetSound}.mp3`;
				
				if (!fs.existsSync(soundPath)) {
					consoleLog(`[${getTimestamp()}] Error: Sound file '${targetSound}.mp3' not found in host's './sounds/' directory.\n`);
					break;
				}
				
				const guildsToPlay = playGuildId ? [playGuildId] : Array.from(voiceConnections.keys());
				
				for (const gId of guildsToPlay) {
					const conn = voiceConnections.get(gId);
					if (!conn) continue;
					
					try {
						consoleLog(`[${getTimestamp()}] Playing soundboard item: '${targetSound}.mp3'...`);
						
						const player = createAudioPlayer();
						const resource = createAudioResource(soundPath, {
							inlineVolume: true
						});
						const volume = guildVolumes.get(gId) ?? currentVolume;
						resource.volume.setVolume(volume);
						
						guildPlayers.set(gId, { player, resource });
						
						conn.subscribe(player);
						player.play(resource);
						
						player.on('idle', () => {
							consoleLog(`[${getTimestamp()}] Soundboard sound '${targetSound}.mp3' finished playing in guild ${gId}.`);
						});
					} catch (error) {
						consoleLog(`[${getTimestamp()}] Failed to play soundboard audio in guild ${gId}: `, error);
					}
				}
				consoleLog();
				break;
			
			case 'soundboard-stop':
				const stopGuildId = args[1];

				if (stopGuildId) {
					// Global: soundboard-stop [GUILD_ID]
					const stopConn = voiceConnections.get(stopGuildId);
					if (!stopConn) {
						consoleLog(`[${getTimestamp()}] Error: Bot is not in a voice channel for guild ID '${stopGuildId}'.\n`);
						break;
					}
					const activeEntry = guildPlayers.get(stopGuildId);
					if (activeEntry && activeEntry.player) {
						activeEntry.player.stop();
					} else {
						stopConn.subscribe(createAudioPlayer()).stop();
					}
					consoleLog(`[${getTimestamp()}] Sound playback stopped for guild '${stopGuildId}'.\n`);
				} else {
					// Guild specific: soundboard-stop
					if (voiceConnections.size === 0) {
						consoleLog(`[${getTimestamp()}] Error: Bot is not currently in any voice channel.\n`);
						break;
					}
					try {
						for (const [gId, entry] of guildPlayers.entries()) {
							if (entry && entry.player) {
								entry.player.stop();
							}
						}
						guildPlayers.clear();
						for (const [gId, conn] of voiceConnections.entries()) {
							try {
								conn.subscribe(createAudioPlayer()).stop();
							} catch (e) {}
						}
						consoleLog(`[${getTimestamp()}] Sound playback stopped for all guilds.\n`);
					} catch (error) {
						consoleLog(`[${getTimestamp()}] Failed to stop audio: `, error);
					}
				}
				break;

			case 'soundboard-volume':
				let targetGuildId = null;
				let rawVolume = null;

				if (args.length === 2) {
					// Global change: soundboard-volume [0-100]
					rawVolume = args[1];
				} else if (args.length >= 3) {
					// Guild specific change: soundboard-volume [GUILD_ID] [0-100]
					targetGuildId = args[1];
					rawVolume = args[2];
				} else {
					consoleLog(`[${getTimestamp()}] Error: Please provide a volume level. Usage: soundboard-volume [0-100] or soundboard-volume [GUILD_ID] [0-100]\n`);
					break;
				}
				
				const volumePercent = parseInt(rawVolume, 10);
				
				if (isNaN(volumePercent) || volumePercent < 0 || volumePercent > 100) {
					consoleLog(`[${getTimestamp()}] Error: Volume must be a number between 0 and 100.\n`);
					break;
				}
				
				const volume = volumePercent / 100;

				if (targetGuildId) {
					guildVolumes.set(targetGuildId, volume);
					const activeEntry = guildPlayers.get(targetGuildId);
					if (activeEntry && activeEntry.resource && activeEntry.resource.volume) {
						try {
							activeEntry.resource.volume.setVolume(volume);
						} catch (e) {}
					}
					consoleLog(`[${getTimestamp()}] Voice volume for guild '${targetGuildId}' successfully set to ${volumePercent}%.\n`);
				} else {
					currentVolume = volume;
					for (const [gId, activeEntry] of guildPlayers.entries()) {
						if (!guildVolumes.has(gId) && activeEntry && activeEntry.resource && activeEntry.resource.volume) {
							try {
								activeEntry.resource.volume.setVolume(volume);
							} catch (e) {}
						}
					}
					consoleLog(`[${getTimestamp()}] Global voice volume successfully set to ${volumePercent}%.\n`);
				}
				break;
			
			default:
				consoleLog(`[${getTimestamp()}] Unknown terminal command: "${command}". For commands, try "help".\n`);
				break;
		}
	}
	
	rl.prompt();
});

// Shut down the bot.
if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
}
process.stdin.resume();
process.stdin.on('data', (key) => {
    // Ctrl+C.
    if (key.length === 1 && key[0] === 3) {
        process.emit('SIGINT');
    }
});

async function shutdown() {
	console.log(`\n[${getTimestamp()}] Shutting down the bot safely...`);
	
	try {
		rl.close();

		if (voiceConnections.size > 0) {
			try {
				console.log(`[${getTimestamp()}] Leaving voice channels...`);
				for (const [guildId, connection] of voiceConnections.entries()) {
					connection.destroy();
				}
				voiceConnections.clear();
				consoleLog(`[${getTimestamp()}] Successfully left all voice channels.`);
				
				await new Promise(resolve => setTimeout(resolve, 1000));
			} catch (error) {
				consoleLog(`[${getTimestamp()}] Failed to leave voice channels:`, error);
			}
		}
		
		if (client.ws) {
			client.ws.destroy();
		}
		
		await client.destroy();
	} catch (error) {
		console.log(error);
	} finally {
		console.log("Press 'Ctrl+C' or close the window to end process, or make changes in '.js' file.");
		process.exit(0);
	}
}

process.once('SIGINT', () => shutdown());
process.once('SIGTERM', () => shutdown());



// Login.
client.login(process.env.DISCORD_TOKEN);