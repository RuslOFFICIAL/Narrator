// Dependencies.
require('dotenv').config();

const locales = {
    uk: require('./locales/uk.js'),
    en: require('./locales/en.js')
};
const fs = require('fs');
const readline = require('readline');
const { spawn, exec } = require('child_process');
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, ActivityType, InteractionContextType, MessageFlags, ChannelType } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, StreamType } = require('@discordjs/voice');

// Localization.
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

const rawSnippetsUk = require('./locales/uk-lore.js');
const rawSnippetsEn = require('./locales/en-lore.js');

function getLocalizedLoreSnippets(interaction) {
    const langCode = interaction.locale?.startsWith('en') ? 'en' : 'uk';
    const snippets = langCode === 'en' ? rawSnippetsEn : rawSnippetsUk;
    
    return snippets.map(snippet => 
        snippet
            .replace('$loreLink$', loreLink)
            .replace('$loreLinkKey$', loreLinkKey)
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
const loreLink = process.env.LORE_LINK;
const loreLinkKey = process.env.LORE_LINK_KEY;

let isBotReady = false;

const CONFIG = {
	statusBot: process.env.STATUS,
	statusName: process.env.STATUS_NAME,
	statusType: process.env.STATUS_TYPE,
	statusUrl: process.env.STATUS_URL,
	
	kickChance: parseInt(process.env.KICK_CHANCE, 10) || 10,
	whitelist: process.env.WHITELIST ? process.env.WHITELIST.split(',') : [],
	authorizedTesters: process.env.AUTHORIZED_TESTERS ? process.env.AUTHORIZED_TESTERS.split(',') : []
}

let currentVoiceConnection = null;

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
	new SlashCommandBuilder().setName('soundboard-stop').setDescription(getCmdText('descSoundboardStop')).setContexts([InteractionContextType.Guild])
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
			loreLink: loreLink,
			loreLinkKey: loreLinkKey
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
			currentVoiceConnection = joinVoiceChannel({
				channelId: targetChannel.id,
				guildId: targetChannel.guild.id,
				adapterCreator: targetChannel.guild.voiceAdapterCreator,
			});
			const voiceJoin = getLocText(interaction, 'replyVoiceJoinSuccess', {
				channelName: targetChannel.name
			});
			
			consoleLog(`[${getTimestamp()}] Successfully joined the voice channel.`);
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
		
		if (!currentVoiceConnection) {
			await interaction.reply({
				content: getLocText(interaction, 'replyNotInVoice'), 
				flags: [MessageFlags.Ephemeral]
			})
			return;
		}
		
		try {
			currentVoiceConnection.destroy();
			currentVoiceConnection = null;
			consoleLog(`[${getTimestamp()}] Successfully left voice channel.`);
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
		
		if (!currentVoiceConnection) {
			await interaction.reply({
				content: getLocText(interaction, 'replyNotInVoice'),
				flags: [MessageFlags.Ephemeral]
			})
			return;
		}
		
		const soundChoice = interaction.options.getString('sound');
		const soundPath = `./sounds/${soundChoice}.mp3`;
		
		if (!fs.existsSync(soundPath)) {
			await interaction.reply({
				content: getLocText(interaction, 'replySoundboardPlayNotFound'),
				flags: [MessageFlags.Ephemeral]
			})
			return;
		}
		
		try {
			const playingMsg = getLocText(interaction, 'replySoundboardPlayPlaying', {
				soundChoice: soundChoice
			});
			
			consoleLog(`[${getTimestamp()}] Playing soundboard item: '${soundChoice}.mp3'...`);
			await interaction.reply(playingMsg)
			
			const player = createAudioPlayer();
			const resource = createAudioResource(soundPath);
			currentVoiceConnection.subscribe(player);
			player.play(resource);
			
			consoleLog(`[${getTimestamp()}] Sound playback initialized for '${soundChoice}.mp3'.`);
			
			player.on('idle', () => {
				consoleLog(`[${getTimestamp()}] Soundboard sound '${soundChoice}.mp3' finished playing.`);
			});
		} catch (error) {
			consoleLog(`[${getTimestamp()}] Failed to play soundboard audio: `, error);
			await interaction.reply({
				content: getLocText(interaction, 'replySoundboardPlayError'),
				flags: [MessageFlags.Ephemeral]
			})
		}
	} catch (error) {
		consoleLog(`[${getTimestamp()}] Failed to execute command [/${interaction.commandName}] :`, error);
		await interaction.reply({
			content: getLocText(interaction, 'replyCommandError', { commandName: '/soundboard-play' }),
			flags: [MessageFlags.Ephemeral]
		})
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
		
		if (!currentVoiceConnection) {
			await interaction.reply({
				content: getLocText(interaction, 'replyNotInVoice'),
				flags: [MessageFlags.Ephemeral]
			})
			return;
		}
				
		try {
			const stopPlayer = createAudioPlayer();
			currentVoiceConnection.subscribe(stopPlayer);
			consoleLog(`[${getTimestamp()}] Sound playback stopped.`);
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
				consoleLog(`[${getTimestamp()}] Commands:\nBOT:\n- help: Show terminal commands.\n- exit/stop/shutdown: Shut down the bot.\n- status: Status of the bot.\n- ping: Check bot latency.\n- clear: Clear the terminal screen.\n\nSERVER:\n- voice-join: Connect bot to specified voice channel by ID.\n- voice-leave: Disconnect bot from voice channel.\n- soundboard-play: Play the specified soundboard audio.\n- soundboard-stop: Stop playing the soundboard audio.`);
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
			case 'voice-join':
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
					currentVoiceConnection = joinVoiceChannel({
						channelId: targetChannel.id,
						guildId: targetChannel.guild.id,
						adapterCreator: targetChannel.guild.voiceAdapterCreator,
					});
					consoleLog(`[${getTimestamp()}] Successfully joined voice channel: '${targetChannel.name}' (${targetChannel.id})`);
				} catch (error) {
					consoleLog(`[${getTimestamp()}] Failed to join voice channel: `, error);
				}
				consoleLog();
				break;
			
			case 'voice-leave':
				if (!currentVoiceConnection) {
					consoleLog(`[${getTimestamp()}] Error: Bot is not currently in a voice channel. Run "voice-join" first.\n`);
					break;
				}
				
				try {
					currentVoiceConnection.destroy();
					currentVoiceConnection = null;
					consoleLog(`[${getTimestamp()}] Successfully left the voice channel.`);
				} catch (error) {
					consoleLog(`[${getTimestamp()}] Failed to leave voice channel:`, error);
				}
				consoleLog();
				break;
			
			case 'soundboard-play':
				if (!currentVoiceConnection) {
					consoleLog(`[${getTimestamp()}] Error: Bot is not in a voice channel. Run "voice-join" first.\n`);
					break;
				}
				
				const rawTargetSound = args[1];
				
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
				
				try {
					consoleLog(`[${getTimestamp()}] Playing soundboard item: '${targetSound}.mp3'...`);
					
					const player = createAudioPlayer();
					const resource = createAudioResource(soundPath);
					currentVoiceConnection.subscribe(player);
					player.play(resource);
					
					consoleLog(`[${getTimestamp()}] Sound playback initialized for '${targetSound}.mp3'.`);
					
					player.on('idle', () => {
						consoleLog(`[${getTimestamp()}] Soundboard sound '${targetSound}.mp3' finished playing.`);
					});
				} catch (error) {
					consoleLog(`[${getTimestamp()}] Failed to play soundboard audio: `, error);
				}
				consoleLog();
				break;
			
			case 'soundboard-stop':
				if (!currentVoiceConnection) {
					consoleLog(`[${getTimestamp()}] Error: Bot is not in a voice channel.\n`);
					break;
				}
				
				try {
					const stopPlayer = createAudioPlayer();
					currentVoiceConnection.subscribe(stopPlayer);
					consoleLog(`[${getTimestamp()}] Sound playback stopped.`);
				} catch (error) {
					consoleLog(`[${getTimestamp()}] Failed to stop audio: `, error);
				}
				consoleLog();
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