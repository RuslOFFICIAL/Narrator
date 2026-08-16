require('dotenv').config();

const readline = require('readline');
const { spawn, exec } = require('child_process');
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, ActivityType, InteractionContextType, MessageFlags } = require('discord.js');

process.on('unhandledRejection', error => {
    console.error(`[${getTimestamp()}] Unhandled promise rejection: `, error);
});

// Create a new client instance with necessary intents.
const client = new Client({
	intents: [
		GatewayIntentBits.Guilds,
		GatewayIntentBits.GuildMessages,
		GatewayIntentBits.MessageContent
	]
});

// Variables.
let isBotReady = false;

const CONFIG = {
	authorizedTesters: ['675686068196212757'],
	whitelist: ['1123273922851389502', '675686068196212757', '883687038220664882'], // ie550vxs, Rusl, Katy.
    kickChance: 10
}

const LORE_SNIPPETS = [
	'ie550vxs є Творцем та Власником сервера. Його рішення є вирішальним.',
	'Rusl це Адмін, якому все одно чи ви слухалися правил чи ні. Він банить кого хоче і що хоче.',
	'Katy є другом ie550vxs, хоча вона не дуже використовує її силу Адміна. Але якщо щось не так, кнопка бана завжди доступна.',
	'Ponko запросив двох Учасників. Nazarpushka3 залишився, P3N1$ був забанений, але ненадовго. Яка причина? Неприпустимий контент.',
	'Хто такий Оповідач? Це лише Оповідач. Не Адмін, не Творець, не Власник, не Учасник. Лише Оповідач.',
	'Посилання "https://www.youtube.com/watch?v=dQw4w9WgXcQ" веде на музичний кліп Ріка Естлі Never Gonna Give You Up, або ж Rickroll, який Адміни дуже обожнюють.',
	'На сервері були ці власні Боти: Bostl, Яндекс Алиса, Українська Алиса, Narrator, BanBot, Server HELPER.',
	'Першим повідомленням на сервері був стікер надісланий 27 червня 2023 року о 19:40.',
	'На сервері дуже, ну ДУЖЕ, полюбляють ігри... ну й також містику.',
	'На сервері є Трійка, яка складається з: ie550vxs, Rusl, Katy.',
	'Короче: Чити - Бан; Кемперство - Бан; Оскорбление - Бан; Оскорбление Администрации - Растрел, потом бан. Всем удачи!',
	'На диво, Учасникам сподобався Бот "The Casino". Через це з\'явилася роль Лудоман.',
	'Агов! Чого використовувати Бота, якщо можна прочитати Лор від Оповідача? [Натисніть сюди](https://mega.nz/folder/JmkQHTza#q1l478SHytQR-C0PWKL1oA). Якщо треба ключ, ось він: "q1l478SHytQR-C0PWKL1oA".'
];

const HELP_TEXT = `Команди бота Narrator:

/help - Показує команди бота.
/lore - Розказує одну з частин лору.
/info - Інформація про лор.
/lottery-kick - ${CONFIG.kickChance}% на кік з серверу. Удачі!`;

const INFO_TEXT = `Створенням лору та бота зайнявся Адмін Rusl, аватарку боту створила Адмін Katy.
 
Посиланням на файл "Server-Lore" є: "https://mega.nz/folder/JmkQHTza#q1l478SHytQR-C0PWKL1oA". Ключем до посилання є: "q1l478SHytQR-C0PWKL1oA".
 
Значеннями версії файлу "Server-Lore" є:
Кількість частин.
Кількість змін за перше число версії.

Всі учасники сервера, які коли-небудь приєднувалися на сервер, автоматично приймають згоду на те, що вони можуть бути в лорі. Це може бути відмовлено лише, якщо написати Rusl з проханням цього та якщо він прийме це.`;

// Discord Commands Information.
const commands = [
	new SlashCommandBuilder().setName('help').setDescription('Показує команди бота.'),
	new SlashCommandBuilder().setName('lore').setDescription('Команда для лору.'),
	new SlashCommandBuilder().setName('info').setDescription('Інформація про лор.'),
	new SlashCommandBuilder().setName('lottery-kick').setDescription(`${CONFIG.kickChance}% на кік з серверу. Удачі!`).setContexts([InteractionContextType.Guild])
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
			activities: [{ name: 'Лор Сервера', type: ActivityType.Playing, url: 'https://mega.nz/folder/JmkQHTza#q1l478SHytQR-C0PWKL1oA' }], /* After 'ActivityType.' can be:
																						'Playing' (Playing [name]),
																						'Streaming' (Streaming [name]) (requires a Twitch/YouTube URL),
																						'Listening' (Listening to [name]),
																						'Watching' (Watching [name]),
																						'Competing' (Competing in [name]).*/
			status: 'online', // Can be 'online', 'idle', 'dnd', 'invisible',
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
		console.error(`Failed to execute command [/help] :`, error);
		await interaction.reply({
			content: 'Не вдалося виконати команду [/help]. Спробуйте пізніше.',
			flags: [MessageFlags.Ephemeral]
		})
	}
}

async function commandLore(interaction) {
	if (!(await isAuthorizedTester(interaction))) return;
	
	makeLogMessage(interaction);
	
	try {
		const randomIndex = Math.floor(Math.random() * LORE_SNIPPETS.length);
		await interaction.reply(`Лор? Ну добре...\n\n${LORE_SNIPPETS[randomIndex]}`);
	} catch (error) {
		console.error(`Failed to execute command [/lore] :`, error);
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
		console.error(`Failed to execute command [/info] :`, error);
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
				content: `<@${interaction.user.id}>\n\nТебе не можна кикнути через правила боту. Не можна кікати ie550vxs, Rusl, Katy.`,
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
				console.log(`ERROR: Couldn't kick user @${interaction.user.tag} or send DM.`);
				await interaction.reply({
					content: `<@${interaction.user.id}>\n\nНе вдалося тебе кікнути. Спробуй знову.`,
					flags: [MessageFlags.Ephemeral]
				})
			}
		} else {
			await interaction.reply(`<@${interaction.user.id}>\n\nЩо ж, твій кік не сьогодні... Спробуй знову, якщо не боїшся.\n\nСпробуєш знову? Все-таки, кік і є виграшем тут.`);
		}
	} catch (error) {
		console.error(`Failed to execute command [/lottery-kick] :`, error);
		await interaction.reply({
			content: 'Не вдалося виконати команду [/lottery-kick]. Спробуйте пізніше.',
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

rl.on('line', (line) => {
	const trimmedLine = line.trim();
	
	if (!trimmedLine) {
        rl.prompt();
        return;
    }
	
    const args = line.trim().split(' ');
    const command = args[0].toLowerCase();
	
	readline.clearLine(process.stdout, 0);
    readline.cursorTo(process.stdout, 0);

	// Terminal commands.
    switch (command) {
		case 'help':
			console.log(`[${getTimestamp()}] Commands:\n- help: Show terminal commands.\n- exit/stop/shutdown: Shut down the bot.\n- status: Status of the bot.\n- ping: Check bot latency.\n- clear: Clear the terminal screen.`);
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
		
        default:
            console.log(`[${getTimestamp()}] Unknown terminal command: "${command}". For commands, try "help".`);
			console.log();
            break;
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