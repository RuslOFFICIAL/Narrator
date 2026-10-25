module.exports = {
	// Long texts.
	helpText: `Команди Бота Narrator\n
Загальні Команди:
/help - Показує команди бота.
/info - Інформація про лор.
\nКоманди Сервера:
/lore - Розказує одну з частин лору.
/lore-list - Перелік уривків лору.
/lore-create - Додати новий уривок лору до файлу сервера.
/lore-remove - Видалити уривок лору за його порядковим номером.
/lottery-kick - {kickChance}% на кік з серверу. Удачі!
/voice-join - Заходить в обраний голосовий канал.
/voice-leave - Покидає голосовий канал.
/soundboard-play - Запускає обраний звук в голосовому каналі.
/soundboard-stop - Припиняє звук в голосовому каналі.`,
	
	infoText: `Лори серверів зроблені тими Учасниками серверу, які на сервері мають дозвіл "Керувати сервером" або "Адміністратор".
Лор серверів не зроблений Творцем боту "Narrator".`,	
	
	// Messages.
	replyBotLoading: `Бот ще завантажується. Почекайте, будь ласка.`,
	replyCommandError: `Не вдалося виконати команду [{commandName}]. Спробуйте пізніше.`,
	replyGuild: `Цю команду можна використовувати лише на серверах!`,
	replyVoiceNotFound: `Не вдалося знайти голосового каналу з ID "{channelId}". Впевніться, що бот є на тому сервері.`,
	replyNotInVoice: `Бот зараз не в голосовому каналі. Спробуйте спершу запустити команду "/voice-join".`,
	replyLoreSnippetsUnavailable: `Уривки з лору наразі недоступні.`,
	replyNoPermissionAdminManageServer: `У Вас немає прав для використання цієї команди (Потрібні права "Керування сервером" або "Адміністратор").`,
	
	replyWhitelistYes: `Ця команда недоступна Вам, бо вона може зробити Вам щось. Спробуйте використати іншу команду або пізніше.`,
	replyWhitelistNo: `Ця команда недоступна Вам. Спробуйте використати іншу команду або пізніше.`,
	replyAuthorizedTester: `Ця команда тестується. Спробуйте використати іншу команду або пізніше.`,
	
	replyLore: `Лор? Ну добре...\n\n{loreSnippet}`,
	
	replyLoreListLanguage: '**Мова: `{lang}`**',
	
	replyLoreCreateSuccess: `Успішно додано уривок лору до '{guildId}_{lang}.js'.`,
	replyLoreCreateError: `Не вдалося додати уривок лору.`,
	
	replyLoreRemoveSuccess: `Успішно видалено уривок лору #{number}.`,
	replyLoreRemoveNotFound: `Не вдалося знайти уривок лору з номером #{number}.`,
	
	replyLotteryKickYes: `<@{userId}>\n\nОй, схоже вдача не на Вашій стороні сьогодні. Шкода... насправді ні.\n\nЧерез 30 секунд Ваш кік. Напишіть Ваші останні слова.`,
	replyLotteryKickDm: `Хей! Ви тільки-но були кікнуті із серверу, на жаль. Ось посилання на сервер:\nhttps://discord.gg/{inviteCode}`,
	replyLotteryKickReason: `На жаль, удача не на Вашій стороні була того разу. Спробуйте знову наступного разу, якщо не страшно.`,
	replyLotteryKickError: `<@{userId}>\n\nВас не вдалося кікнути. Спробуйте знову.`,
	replyLotteryKickNo: `<@{userId}>\n\nЩо ж, Ваш кік не сьогодні... Спробуйте знову, якщо не боїтеся.\n\nСпробуєте знову? Все-таки, кік і є виграшем тут.`,
	
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
	descLoreList: `Перелік уривків лору.`,
	descLoreCreate: `Додати новий уривок лору до файлу сервера.`,
	descLoreRemove: `Видалити фрагмент лору за його порядковим номером.`,
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
	optionSnippet: `Текст уривка лору.`,
	optionSnippetNumber: `Номер уривка для видалення (дивіться /lore-list).`
}
