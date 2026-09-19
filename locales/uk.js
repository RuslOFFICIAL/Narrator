module.exports = {
	// Long texts.
	helpText: `Команди бота Narrator:

/help - Показує команди бота.
/lore - Розказує одну з частин лору.
/lore-create - Додати новий уривок лору до файлу сервера.
/info - Інформація про лор.
/lottery-kick - {kickChance}% на кік з серверу. Удачі!
/voice-join - Заходить в обраний олосовий канал.
/voice-leave - Покидає голосовий канал.
/soundboard-play - Запускає обраний звук в голосовому каналі.
/soundboard-stop - Припиняє звук в голосовому каналі.`,
	
	infoText: `Лор цього серверу зроблений тими Учасниками серверу, які мають дозвіл "Керувати сервером" або "Адміністратор".
Лор цього серверу не зроблений Творцем боту "Narrator".`,	
	
	// Messages.
	replyBotLoading: `Бот ще завантажується. Почекайте, будь ласка.`,
	replyCommandError: `Не вдалося виконати команду [{commandName}]. Спробуйте пізніше.`,
	replyGuild: `Цю команду можна використовувати лише на серверах!`,
	replyVoiceNotFound: `Не вдалося знайти голосового каналу з ID "{channelId}". Впевніться, що бот є на тому сервері.`,
	replyNotInVoice: `Бот зараз не в голосовому каналі. Спробуйте спершу запустити команду "/voice-join".`,
	replyLoreSnippetsUnavailable: `Уривки з лору наразі недоступні.`,
	
	replyWhitelistYes: `Ця команда недоступна Вам, бо вона може зробити Вам щось. Спробуйте використати іншу команду або пізніше.`,
	replyWhitelistNo: `Ця команда недоступна Вам. Спробуйте використати іншу команду або пізніше.`,
	replyAuthorizedTester: `Ця команда тестується. Спробуйте використати іншу команду або пізніше.`,
	
	replyLore: `Лор? Ну добре...\n\n{loreSnippet}`,
	
	replyLoreCreateSuccess: `Успішно додано уривок лору до '{guildId}_{lang}.js'!`,
	replyLoreCreateNoPermission: `У вас немає прав для використання цієї команди (Потрібні права "Керування сервером" або "Адміністратор").`,
	replyLoreCreateError: `Не вдалося додати уривок лору.`,
	
	replyLotteryKickYes: `<@{userId}>\n\nОй, схоже вдача не на Вашій стороні сьогодні. Шкода... насправді ні.\n\nЧерез 30 секунд Ваш кік. Напишіть Ваші останні слова.`,
	replyLotteryKickDm: `Хей! Ви тільки-но були кікнуті із серверу, нажаль. Ось посилання на сервер:\nhttps://discord.gg/{inviteCode}`,
	replyLotteryKickReason: `Нажаль, удача не на Вашій стороні була того разу. Спробуйте знову наступного разу, якщо не страшно.`,
	replyLotteryKickError: `<@{userId}>\n\nВас не вдалося кікнути. Спробуйте знову.`,
	replyLotteryKickNo: `<@{userId}>\n\nЩо ж, Ваш кік не сьогодні... Спробуйте знову, якщо не боїшся.\n\nСпробуєте знову? Все-таки, кік і є виграшем тут.`,
	
	replyVoiceJoinSuccess: `Бот успішно приєднався до: "{channelName}".`,
	replyVoiceJoinError: `Боту не вдалося приєднатися до голосового каналу. Спробуйте знову.`,
	
	replyVoiceLeaveSuccess: `Бот успішно покинув голосовий канал.`,
	replyVoiceLeaveError: `Боту не вдалося покинути голосовий канал. Спробуйте знову.`,
	
	replySoundboardPlayNotFound: `Звук "{soundChoice}" не знайдено в папці хоста "sounds".`,
	replySoundboardPlayPlaying: `Бот запускає звук: "{soundChoice}"...`,
	replySoundboardPlayError: `Боту не вдалося запустити звук. Спробуйте знову.`,
	
	replySoundboardStopSuccess: `Звук Бота припинено в голосовому каналі.`,
	replySoundboardStopError: `Боту не вдалося припинити звук в голосовому каналі. Спробуйте знову.`,
	
	replySoundboardVolumeSuccess: `Гучність успішно встановлено на {volume}%.`,
	replySoundboardVolumeError: `Боту не вдалося встановити гучність. Спробуйте знову.`,
	
	// Commands.
	descHelp: `Показує команди бота.`,
	descLore: `Команда для лору.`,
	descLoreCreate: `Додати новий уривок лору до файлу сервера.`,
	descInfo: `Інформація про лор.`,
	descLotteryKick: `{kickChance}% на кік з серверу. Удачі!`,
	descVoiceJoin: `Заходить в обраний голосовий канал.`,
	descVoiceLeave: `Покидає голосовий канал.`,
	descSoundboardPlay: `Запускає обраний звук в голосовому каналі.`,
	descSoundboardStop: `Припиняє звук в голосовому каналі.`,
	descSoundboardVolume: `Змінити гучність відтворення бота.`,

	optionChannel: `Виберіть голосовий канал.`,
	optionSound: `Виберіть звук для відтворення.`,
	optionVolumeLevel: `Рівень гучності від 0 до 100.`,
	optionLanguageCode: `Код мови (наприклад: en, uk).`,
	optionSnippet: `Текст уривка лору.`
}
