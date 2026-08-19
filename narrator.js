require('dotenv').config();

const fs = require('fs');
const readline = require('readline');
const { spawn, exec } = require('child_process');
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, ActivityType, InteractionContextType, MessageFlags } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, StreamType } = require('@discordjs/voice');

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
	
	voiceChannelId: process.env.VOICE_CHANNEL_ID,
	
	kickChance: parseInt(process.env.KICK_CHANCE, 10) || 10,
	whitelist: process.env.WHITELIST ? process.env.WHITELIST.split(',') : [],
	authorizedTesters: process.env.AUTHORIZED_TESTERS ? process.env.AUTHORIZED_TESTERS.split(',') : []
}

let currentVoiceConnection = null;

const rawSnippets = require('./lore.js');

const LORE_SNIPPETS = rawSnippets.map(snippet => 
	snippet
        .replace('$loreLink$', loreLink)
        .replace('$loreLinkKey$', loreLinkKey)
);

const HELP_TEXT = `Команди бота Narrator:

/help - Показує команди бота.
/lore - Розказує одну з частин лору.
/info - Інформація про лор.
/lottery-kick - ${CONFIG.kickChance}% на кік з серверу. Удачі!
/voice-join - Заходить в голосовий канал, який вибраний у хоста.
/voice-leave - Покидає голосовий канал.
/soundboard-play - Запускає вибраний звук в голосовому каналі.`;

const INFO_TEXT = `Створенням лору та бота зайнявся Адмін Rusl, аватарку боту створила Адмін Katy.
 
Посиланням на файл "Server-Lore" є: "<${loreLink}>". Ключем до посилання є: "${loreLinkKey}".
 
Значеннями версії файлу "Server-Lore" є:
Кількість частин.
Кількість змін за перше число версії.

Всі учасники сервера, які коли-небудь приєднувалися на сервер, автоматично приймають згоду на те, що вони можуть бути в лорі. Це може бути відмовлено лише, якщо написати Rusl з проханням цього та якщо він прийме це.`;

// Discord Commands Information.
const commands = [
	new SlashCommandBuilder().setName('help').setDescription('Показує команди бота.'),
	new SlashCommandBuilder().setName('lore').setDescription('Команда для лору.'),
	new SlashCommandBuilder().setName('info').setDescription('Інформація про лор.'),
	new SlashCommandBuilder().setName('lottery-kick').setDescription(`${CONFIG.kickChance}% на кік з серверу. Удачі!`).setContexts([InteractionContextType.Guild]),
	new SlashCommandBuilder().setName('voice-join').setDescription('Заходить в голосовий канал, який вибраний у хоста.').setContexts([InteractionContextType.Guild]),
	new SlashCommandBuilder().setName('voice-leave').setDescription('Покидає голосовий канал.').setContexts([InteractionContextType.Guild]),
	new SlashCommandBuilder().setName('soundboard-play').setDescription('Запускає вибраний звук в голосовому каналі.').addStringOption(option =>
		option.setName('sound').setDescription('Виберіть звук для відтворення.').setRequired(true).setAutocomplete(true)
		).setContexts([InteractionContextType.Guild])
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
				content: 'Бот ще завантажується. Почекайте, будь ласка.',
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

// Add "if (!(await isAuthorizedTester(interaction))) return;" at the beggining of command to make it for Authorized Testers. Comment it with "//" to disable the tester check.
async function isAuthorizedTester(interaction) {
	if(!CONFIG.authorizedTesters.includes(interaction.user.id)) {
		const logMessage = `[${getTimestamp()}] [Testing Command Used] '/${interaction.commandName}' was executed by not a tester @${interaction.user.tag} (${interaction.user.id})`;
		consoleLog(logMessage);

		await interaction.reply({
			content: 'Ця команда тестується. Спробуйте використати іншу команду або пізніше.',
			flags: [MessageFlags.Ephemeral]
		});
		return false;
	}
	return true;
}



// Discord Commands.
async function commandHelp(interaction) {
	//if (!(await isAuthorizedTester(interaction))) return;
	
	makeLogMessage(interaction);
	
	try {
		await interaction.reply(HELP_TEXT);
	} catch (error) {
		consoleLog(`[${getTimestamp()}] Failed to execute command [/help] :`, error);
		await interaction.reply({
			content: 'Не вдалося виконати команду [/help]. Спробуйте пізніше.',
			flags: [MessageFlags.Ephemeral]
		})
	}
}

async function commandLore(interaction) {
	//if (!(await isAuthorizedTester(interaction))) return;
	
	makeLogMessage(interaction);
	
	try {
		const randomIndex = Math.floor(Math.random() * LORE_SNIPPETS.length);
		await interaction.reply(`Лор? Ну добре...\n\n${LORE_SNIPPETS[randomIndex]}`);
	} catch (error) {
		consoleLog(`[${getTimestamp()}] Failed to execute command [/lore] :`, error);		
		await interaction.reply({
			content: 'Не вдалося виконати команду [/lore]. Спробуйте пізніше.',
			flags: [MessageFlags.Ephemeral]
		})
	}
}

async function commandInfo(interaction) {
	//if (!(await isAuthorizedTester(interaction))) return;
	
	makeLogMessage(interaction);
	
	try {
		await interaction.reply(INFO_TEXT);
	} catch (error) {
		consoleLog(`[${getTimestamp()}] Failed to execute command [/info] :`, error);
		await interaction.reply({
			content: 'Не вдалося виконати команду [/info]. Спробуйте пізніше.',
			flags: [MessageFlags.Ephemeral]
		})
	}
}
	
async function commandLotteryKick(interaction) {
	//if (!(await isAuthorizedTester(interaction))) return;
	
	makeLogMessage(interaction);
	
	try {
		
		if (!interaction.inGuild()) {
			await interaction.reply({
				content: 'Цю команду можна використовувати лише на серверах!',
				flags: [MessageFlags.Ephemeral]
			});
			return;
		}
		
		if (CONFIG.whitelist.includes(interaction.user.id)) {
			await interaction.reply({
				content: `<@${interaction.user.id}>\n\nЧерез правила боту, тебе не можна кикнути.`,
				flags: [MessageFlags.Ephemeral]
			});
			return;
		}
			
		const roll = Math.floor(Math.random() * 100) + 1;
		
		if (roll <= CONFIG.kickChance) {
			await interaction.reply(`<@${interaction.user.id}>\n\nОй, схоже вдача не на твоїй стороні сьогодні. Шкода... насправді ні.\n\nЧерез 30 секунд твій кік. Напиши свої останні слова.`);
			await new Promise(resolve => setTimeout(resolve, 30000));
			
			try {
				const invite = await interaction.channel.createInvite({ maxAge: 86400, maxUses: 1, unique: true });
				await interaction.user.send(`Хей! Ти тільки-но був кікнутий із серверу, нажаль. Ось посилання на сервер:\nhttps://discord.gg/${invite.code}`);
				await interaction.member.kick('Нажаль, удача не на твоїй стороні була того разу. Спробуй знову наступного разу, якщо не страшно.');
			} catch (err) {
				consoleLog(`[${getTimestamp()}] ERROR: Couldn't kick user @${interaction.user.tag} or send DM.`);
				await interaction.reply({
					content: `<@${interaction.user.id}>\n\nНе вдалося тебе кікнути. Спробуй знову.`,
					flags: [MessageFlags.Ephemeral]
				})
			}
		} else {
			await interaction.reply(`<@${interaction.user.id}>\n\nЩо ж, твій кік не сьогодні... Спробуй знову, якщо не боїшся.\n\nСпробуєш знову? Все-таки, кік і є виграшем тут.`);
		}
	} catch (error) {
		consoleLog(`[${getTimestamp()}] Failed to execute command [/lottery-kick] :`, error);
		await interaction.reply({
			content: 'Не вдалося виконати команду [/lottery-kick]. Спробуйте пізніше.',
			flags: [MessageFlags.Ephemeral]
		})
	}
}

async function commandVoiceJoin(interaction) {
	//if (!(await isAuthorizedTester(interaction))) return;
	
	makeLogMessage(interaction);
	
	try {
		if (!interaction.inGuild()) {
			await interaction.reply({
				content: 'Цю команду можна використовувати лише на серверах!',
				flags: [MessageFlags.Ephemeral]
			});
			return;
		}
		
		if (!CONFIG.whitelist.includes(interaction.user.id)) {
			await interaction.reply({
				content: `<@${interaction.user.id}>\n\nЧерез правила боту, ти не можеш примусити бота приєднатися до голосового каналу.`,
				flags: [MessageFlags.Ephemeral]
			});
			return;
		}
		
		if (!CONFIG.voiceChannelId) {
			await interaction.reply({
				content: '\'VOICE_CHANNEL_ID\' не визначено в файлі хоста \'.env\'.',
				flags: [MessageFlags.Ephemeral]
			})
			return;
		}
		
		// Find the channel across all guilds the bot is in.
		let targetChannel = null;
		for (const [guildId, guild] of client.guilds.cache) {
			const channel = guild.channels.cache.get(CONFIG.voiceChannelId);
			if (channel) {
				targetChannel = channel;
				break;
			}
		}
		
		if (!targetChannel) {
			await interaction.reply({
				content: `Не вдалося знайти голосового каналу з ID '${CONFIG.voiceChannelId}'. Впевніться, що бот є на тому сервері.`,
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
			await interaction.reply(`Успішно приєднався до: '${targetChannel.name}'`);
		} catch (error) {
			consoleLog(`[${getTimestamp()}] Failed to join voice channel: `, error);
			await interaction.reply({
				content: `Не вдалося приєднатися до голосового каналу. Спробуйте знову.`,
				flags: [MessageFlags.Ephemeral]
			})
		}
	} catch (error) {
		consoleLog(`[${getTimestamp()}] Failed to execute command [/voice-join] :`, error);
		await interaction.reply({
			content: 'Не вдалося виконати команду [/voice-join]. Спробуйте пізніше.',
			flags: [MessageFlags.Ephemeral]
		})
	}
}

async function commandVoiceLeave(interaction) {
	//if (!(await isAuthorizedTester(interaction))) return;
	
	makeLogMessage(interaction);
	
	try {
		if (!interaction.inGuild()) {
			await interaction.reply({
				content: 'Цю команду можна використовувати лише на серверах!',
				flags: [MessageFlags.Ephemeral]
			});
			return;
		}
		
		if (!CONFIG.whitelist.includes(interaction.user.id)) {
			await interaction.reply({
				content: `<@${interaction.user.id}>\n\nЧерез правила боту, ти не можеш примусити бота покинути голосовий канал.`,
				flags: [MessageFlags.Ephemeral]
			});
			return;
		}
		
		if (!currentVoiceConnection) {
			await interaction.reply({
				content: 'Бот зараз не в голосовому каналі. Спробуйте спершу запустити команду "/voice-join".',
				flags: [MessageFlags.Ephemeral]
			})
			return;
		}
		
		try {
			currentVoiceConnection.destroy();
			currentVoiceConnection = null;
			await interaction.reply('Бот успішно покинув голосовий канал.');
		} catch (error) {
			consoleLog(`[${getTimestamp()}] Failed to join voice channel: `, error);
			await interaction.reply({
				content: 'Не вдалося боту покинути голосовий канал. Спробуйте знову.',
				flags: [MessageFlags.Ephemeral]
			})
		}
	} catch (error) {
		consoleLog(`[${getTimestamp()}] Failed to execute command [/voice-leave] :`, error);
		await interaction.reply({
			content: 'Не вдалося виконати команду [/voice-leave]. Спробуйте пізніше.',
			flags: [MessageFlags.Ephemeral]
		})
	}
}

async function commandSoundboardPlay(interaction) {
	if (!(await isAuthorizedTester(interaction))) return;
	
	makeLogMessage(interaction);
	
	try {
		if (!interaction.inGuild()) {
			await interaction.reply({
				content: 'Цю команду можна використовувати лише на серверах!',
				flags: [MessageFlags.Ephemeral]
			});
			return;
		}
		
		if (!CONFIG.whitelist.includes(interaction.user.id)) {
			await interaction.reply({
				content: `<@${interaction.user.id}>\n\nЧерез правила боту, ти не можеш примусити бота запустити звук в голосовому каналі.`,
				flags: [MessageFlags.Ephemeral]
			});
			return;
		}
		
		if (!currentVoiceConnection) {
			await interaction.reply({
				content: 'Бот зараз не в голосовому каналі. Спробуйте спершу запустити команду "/voice-join".',
				flags: [MessageFlags.Ephemeral]
			})
			return;
		}
		
		const soundChoice = interaction.options.getString('sound');
		const soundPath = `./sounds/${soundChoice}.mp3`;
		
		if (!fs.existsSync(soundPath)) {
			await interaction.reply({
				content: `Звук '${soundChoice}' не знайдено в папці хоста 'sounds'.`,
				flags: [MessageFlags.Ephemeral]
			});
			return;
		}
		
		try {
			await interaction.reply(`Запускаю звук: '${soundChoice}'...`,)
			
			const player = createAudioPlayer();
			const resource = createAudioResource(soundPath);
			currentVoiceConnection.subscribe(player);
			player.play(resource);
			
			player.on('idle', () => {
				consoleLog(`[${getTimestamp()}] Soundboard sound '${targetSound}.mp3' finished playing.`);
			});
		} catch (error) {
			consoleLog(`[${getTimestamp()}] Failed to play soundboard audio: `, error);
			await interaction.reply({
				content: 'Не вдалося запустити звук. Спробуйте знову.',
				flags: [MessageFlags.Ephemeral]
			})
		}
	} catch (error) {
		consoleLog(`[${getTimestamp()}] Failed to execute command [/soundboard-play] :`, error);
		await interaction.reply({
			content: 'Не вдалося виконати команду [/soundboard-play]. Спробуйте пізніше.',
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
				consoleLog(`[${getTimestamp()}] Commands:\nBOT:\n- help: Show terminal commands.\n- exit/stop/shutdown: Shut down the bot.\n- status: Status of the bot.\n- ping: Check bot latency.\n- clear: Clear the terminal screen.\n\nSERVER:\n- voice-join: Connect bot to voice channel from '.env' file.\n- voice-leave: Disconnect bot from voice channel.\n- soundboard-play: Play the specified soundboard audio.`);
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
				if (!CONFIG.voiceChannelId) {
					consoleLog(`[${getTimestamp()}] Error: 'VOICE_CHANNEL_ID' is not defined in '.env' file.\n`);
					break;
				}
				
				// Find the channel across all guilds the bot is in.
				let targetChannel = null;
				for (const [guildId, guild] of client.guilds.cache) {
					const channel = guild.channels.cache.get(CONFIG.voiceChannelId);
					if (channel) {
						targetChannel = channel;
						break;
					}
				}

				if (!targetChannel) {
					consoleLog(`[${getTimestamp()}] Error: Could not find voice channel with ID '${CONFIG.voiceChannelId}'. Make sure the bot is in that server.\n`);
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