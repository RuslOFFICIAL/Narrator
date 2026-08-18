require('dotenv').config();

const readline = require('readline');
const { spawn, exec } = require('child_process');
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, ActivityType, InteractionContextType, MessageFlags } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, StreamType } = require('@discordjs/voice');

process.on('unhandledRejection', error => {
    console.error(`[${getTimestamp()}] Unhandled promise rejection: `, error);
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
	soundboardId: process.env.SOUNDBOARD_ID,
	
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
/soundboard-play - Запускає звук в голосовому каналі, вибраний хостом.`;

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
	new SlashCommandBuilder().setName('soundboard-play').setDescription('Запускає звук в голосовому каналі, вибраний хостом.').setContexts([InteractionContextType.Guild])
].map(command => command.toJSON());

// Run this code after the client is ready.
client.once('clientReady', async () => {
	readline.clearLine(process.stdout, 0);
	readline.cursorTo(process.stdout, 0);
	
	console.log(`\nPress Ctrl+C to shut down bot.\nPrint "help" for commands.\n`);
	console.log(`[${getTimestamp()}] Logged in as ${client.user.tag}!`);
	
	// Status.
	try {
		process.stdout.write(`[${getTimestamp()}] Setting bot status up... `)
		client.user.setPresence({
			activities: [{ name: CONFIG.statusName, type: ActivityType[CONFIG.statusType], url: CONFIG.statusUrl }],
			status: CONFIG.statusBot,
		});
		console.log('Success!');
	} catch (error) {
		console.error(error);
	}
	
	// Register slash (/).
	const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
	try {
		process.stdout.write(`[${getTimestamp()}] Refreshing application (/) commands... `);
		
		await rest.put(
			Routes.applicationCommands(client.user.id),
			{ body: commands },
		);
		
		console.log('Success!');
		console.log(`[${getTimestamp()}] Waiting for commands...\n`);
		
		isBotReady = true;
		rl.prompt();
	} catch (error) {
		console.error(error);
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
	
	readline.clearLine(process.stdout, 0);
	readline.cursorTo(process.stdout, 0);
	console.log(logMessage);
	rl.prompt(true);
}

// Add "if (!(await isAuthorizedTester(interaction))) return;" at the beggining of command to make it for Authorized Testers. Comment it with "//" to disable the tester check.
async function isAuthorizedTester(interaction) {
	if(!CONFIG.authorizedTesters.includes(interaction.user.id)) {
		const logMessage = `[${getTimestamp()}] [Testing Command Used] '/${interaction.commandName}' was executed by not a tester @${interaction.user.tag} (${interaction.user.id})`;
		readline.clearLine(process.stdout, 0);
		readline.cursorTo(process.stdout, 0);
		console.log(logMessage);
		rl.prompt(true);

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
		readline.clearLine(process.stdout, 0);
		readline.cursorTo(process.stdout, 0);
		console.error(`[${getTimestamp()}] Failed to execute command [/help] :`, error);
		rl.prompt(true);
		
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
		readline.clearLine(process.stdout, 0);
		readline.cursorTo(process.stdout, 0);
		console.error(`[${getTimestamp()}] Failed to execute command [/lore] :`, error);
		rl.prompt(true);
		
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
		readline.clearLine(process.stdout, 0);
		readline.cursorTo(process.stdout, 0);
		console.error(`[${getTimestamp()}] Failed to execute command [/info] :`, error);
		rl.prompt(true);
		
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
				readline.clearLine(process.stdout, 0);
				readline.cursorTo(process.stdout, 0);
				console.log(`[${getTimestamp()}] ERROR: Couldn't kick user @${interaction.user.tag} or send DM.`);
				rl.prompt(true);
				
				await interaction.reply({
					content: `<@${interaction.user.id}>\n\nНе вдалося тебе кікнути. Спробуй знову.`,
					flags: [MessageFlags.Ephemeral]
				})
			}
		} else {
			await interaction.reply(`<@${interaction.user.id}>\n\nЩо ж, твій кік не сьогодні... Спробуй знову, якщо не боїшся.\n\nСпробуєш знову? Все-таки, кік і є виграшем тут.`);
		}
	} catch (error) {
		readline.clearLine(process.stdout, 0);
		readline.cursorTo(process.stdout, 0);
		console.error(`[${getTimestamp()}] Failed to execute command [/lottery-kick] :`, error);
		rl.prompt(true);
		
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
			readline.clearLine(process.stdout, 0);
			readline.cursorTo(process.stdout, 0);
			console.error(`[${getTimestamp()}] Failed to join voice channel: `, error);
			rl.prompt(true);
			
			await interaction.reply({
				content: `Не вдалося приєднатися до голосового каналу. Спробуйте знову.`,
				flags: [MessageFlags.Ephemeral]
			})
		}
	} catch (error) {
		readline.clearLine(process.stdout, 0);
		readline.cursorTo(process.stdout, 0);
		console.error(`[${getTimestamp()}] Failed to execute command [/voice-join] :`, error);
		rl.prompt(true);
		
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
			readline.clearLine(process.stdout, 0);
			readline.cursorTo(process.stdout, 0);
			console.error(`[${getTimestamp()}] Failed to join voice channel: `, error);
			rl.prompt(true);
				
			await interaction.reply({
				content: 'Не вдалося боту покинути голосовий канал. Спробуйте знову.',
				flags: [MessageFlags.Ephemeral]
			})
		}
	} catch (error) {
		readline.clearLine(process.stdout, 0);
		readline.cursorTo(process.stdout, 0);
		console.error(`[${getTimestamp()}] Failed to execute command [/voice-leave] :`, error);
		rl.prompt(true);
		
		await interaction.reply({
			content: 'Не вдалося виконати команду [/voice-leave]. Спробуйте пізніше.',
			flags: [MessageFlags.Ephemeral]
		})
	}
}

async function commandSoundboardPlay(interaction) {
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
		
		try {
			await interaction.reply(`Запускаю звук з ID: '${CONFIG.soundboardId}'...`,)
			
			const player = createAudioPlayer();
			const resource = createAudioResource(`./sounds/${CONFIG.soundboardId}.mp3`);
			currentVoiceConnection.subscribe(player);
			player.play(resource);
		} catch (error) {
			readline.clearLine(process.stdout, 0);
			readline.cursorTo(process.stdout, 0);
			console.error(`[${getTimestamp()}] Failed to play soundboard audio: `, error);
			rl.prompt(true);
			
			await interaction.reply({
				content: 'Не вдалося запустити звук. Спробуйте знову.',
				flags: [MessageFlags.Ephemeral]
			})
		}
	} catch (error) {
		readline.clearLine(process.stdout, 0);
		readline.cursorTo(process.stdout, 0);
		console.error(`[${getTimestamp()}] Failed to execute command [/soundboard-play] :`, error);
		rl.prompt(true);
		
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
		
		readline.clearLine(process.stdout, 0);
		readline.cursorTo(process.stdout, 0);
		
		// Terminal commands.
		switch (command) {
			// BOT:
			case 'help':
				console.log(`[${getTimestamp()}] Commands:\nBOT:\n- help: Show terminal commands.\n- exit/stop/shutdown: Shut down the bot.\n- status: Status of the bot.\n- ping: Check bot latency.\n- clear: Clear the terminal screen.\n\nSERVER:\n- voice-join: Connect bot to voice channel from '.env' file.\n- voice-leave: Disconnect bot from voice channel.\n- soundboard-play: Play the specified soundboard audio.`);
				console.log();
				break;
			
			case 'exit':
			case 'stop':
			case 'shutdown':
				console.log(`[${getTimestamp()}] Stopping bot via terminal command...`);
				shutdown();
				console.log();
				return;
			
			case 'status':
				console.log(`[${getTimestamp()}] Status:\n- Bot is ready: ${isBotReady}\n- Logged in as: ${client.user ? client.user.tag : 'Not yet'}\n- Server count: ${client.guilds.cache.size}`);
				console.log();
				break;
			
			case 'ping':
				console.log(`[${getTimestamp()}] Pinging...`);
				exec('ping -n 1 8.8.8.8', (error, stdout) => {
					readline.clearLine(process.stdout, 0);
					readline.cursorTo(process.stdout, 0);
					if (error) {
						console.log(`[${getTimestamp()}] Failed to execute ping.`);
					} else {
						// Pull out the time from Windows ping output.
						const match = stdout.match(/time[=<](\d+ms)/i) || stdout.match(/рисует.*?(\d+ms)/i);
						const time = match ? match[1] : 'unknown';
						console.log(`[${getTimestamp()}] Pong! Network latency: ${time}`);
					}
					console.log();
					rl.prompt(true);
				});
				break;
			
			case 'clear':
				console.clear();
				break;
			
			// SERVER:
			case 'voice-join':
				if (!CONFIG.voiceChannelId) {
					console.log(`[${getTimestamp()}] Error: 'VOICE_CHANNEL_ID' is not defined in '.env' file.\n`);
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
					console.log(`[${getTimestamp()}] Error: Could not find voice channel with ID '${CONFIG.voiceChannelId}'. Make sure the bot is in that server.\n`);
					break;
				}

				try {
					currentVoiceConnection = joinVoiceChannel({
						channelId: targetChannel.id,
						guildId: targetChannel.guild.id,
						adapterCreator: targetChannel.guild.voiceAdapterCreator,
					});
					console.log(`[${getTimestamp()}] Successfully joined voice channel: '${targetChannel.name}' (${targetChannel.id})`);
				} catch (error) {
					console.error(`[${getTimestamp()}] Failed to join voice channel: `, error);
				}
				console.log();
				break;
			
			case 'voice-leave':
				if (!currentVoiceConnection) {
					console.log(`[${getTimestamp()}] Error: Bot is not currently in a voice channel. Run "voice-join" first.\n`);
					break;
				}
				
				try {
					currentVoiceConnection.destroy();
					currentVoiceConnection = null;
					console.log(`[${getTimestamp()}] Successfully left the voice channel.`);
				} catch (error) {
					console.error(`[${getTimestamp()}] Failed to leave voice channel:`, error);
				}
				console.log();
				break;
			
			case 'soundboard-play':
				if (!currentVoiceConnection) {
					console.log(`[${getTimestamp()}] Error: Bot is not in a voice channel. Run "voice-join" first.\n`);
					break;
				}
				
				try {
					console.log(`[${getTimestamp()}] Playing soundboard item ID: '${CONFIG.soundboardId}'...`);
					
					const player = createAudioPlayer();
					const resource = createAudioResource(`./sounds/${CONFIG.soundboardId}.mp3`);
					currentVoiceConnection.subscribe(player);
					player.play(resource);
					
					console.log(`[${getTimestamp()}] Sound playback initialized for ID '${CONFIG.soundboardId}'.`);
					
					player.on('idle', () => {
						readline.clearLine(process.stdout, 0);
						readline.cursorTo(process.stdout, 0);
						console.log(`[${getTimestamp()}] Soundboard sound finished playing.`);
						rl.prompt(true);
					});
				} catch (error) {
					console.error(`[${getTimestamp()}] Failed to play soundboard audio: `, error);
				}
				console.log();
				break;
			
			default:
				console.log(`[${getTimestamp()}] Unknown terminal command: "${command}". For commands, try "help".\n`);
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
		console.error(error);
	} finally {
		console.log("Press 'Ctrl+C' or close the window to end process, or make changes in '.js' file.");
		process.exit(0);
	}
}

process.once('SIGINT', () => shutdown());
process.once('SIGTERM', () => shutdown());

// Login.
client.login(process.env.DISCORD_TOKEN);