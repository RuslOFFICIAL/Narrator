module.exports = {
	// Long texts.
	helpText: `Команди Бота Narrator\n
Загальні Команди:
/help - Показує команди бота.
/info - Інформація про лор.
\nКоманди Сервера:
/role-create: Створити роль і додати її до вибраних ролей сервера.
/role-give: Видати вибрану роль учаснику.
/role-take: Забрати вибрану роль в учасника.
/role-add: Додати роль до вибраних ролей сервера.
/role-remove: Прибрати роль із вибраних ролей сервера.
/role-list: Показати вибрані ролі сервера.
/lottery-kick - {kickChance}% на кік з серверу. Удачі!
/lore - Розказує одну з частин лору.
/lore-list - Перелік уривків лору.
/lore-create - Додати новий уривок лору до файлу сервера.
/lore-remove - Видалити уривок лору за його порядковим номером.
/voice-join - Заходить в обраний голосовий канал.
/voice-leave - Покидає голосовий канал.
/soundboard-play - Запускає обраний звук в голосовому каналі.
/soundboard-stop - Припиняє звук в голосовому каналі.`,
	
	infoText: `Лори серверів зроблені тими Учасниками серверу, які на сервері мають дозвіл "Керувати сервером" або "Адміністратор".
Лор серверів не зроблений Творцем боту "Narrator".`,	
	
	// Bot texts..
	replyBotLoading: `Бот ще завантажується. Почекайте, будь ласка.`,
	replyCommandError: `Не вдалося виконати команду [{commandName}]. Спробуйте пізніше.`,
	replyGuild: `Цю команду можна використовувати лише на серверах!`,
	replyVoiceNotFound: `Не вдалося знайти голосового каналу з ID "{channelId}". Впевніться, що бот є на тому сервері.`,
	replyNotInVoice: `Бот зараз не в голосовому каналі. Спробуйте спершу запустити команду "/voice-join".`,
	replyLoreSnippetsUnavailable: `Уривки з лору наразі недоступні.`,
	replyNoPermissionAdminManageServer: `У Вас немає прав для використання цієї команди (Потрібні права "Керування сервером" або "Адміністратор").`,
	replyNoPermissionRoleManage: `Ви маєте бути у білому списку або мати право "Керувати сервером" чи "Адміністратор".`,
	replyNoSelectedRole: `Для використання цієї команди Вам потрібна одна з вибраних ролей сервера.`,
	
	// Related texts.
	replyRoleNotFound: `Цю роль не знайдено на цьому сервері.`,
	replyRoleInvalidEveryone: `Роль '@everyone' не можна вибрати.`,
	replyRoleInvalidManaged: `Ролі Ботів та інтеграцій не можна вибрати.`,
	replyRoleInvalidDangerous: `Ролі з правами "Адміністратор", "Керувати сервером" або "Керувати ролями" не можна вибрати.`,
	replyRoleInvalidBotPermission: `Боту потрібне право "Керувати ролями".`,
	replyRoleInvalidBotHierarchy: `Ця роль не нижча за найвищу роль Бота.`,
	replyRoleInvalidUserHierarchy: `Ця роль не нижча за вашу найвищу роль.`,
	
	// Commands texts.
	replyRoleCreateSuccess: 'Роль {role} створено та додано до вибраних.',
	replyRoleCreateInvalidName: 'Назва ролі не може бути порожньою.',
	replyRoleCreateFailed: 'Не вдалося створити вибрану роль.',
	
	replyRoleGiveSuccess: `Видано роль {role} учаснику {member}.`,
	replyRoleGiveMemberNotFound: `Цього учасника не знайдено на цьому сервері.`,
	replyRoleGiveNotSelected: `Ролі {role} немає серед вибраних ролей цього сервера.`,
	replyRoleGiveTargetHierarchy: `Ваша найвища роль не вища за роль цього учасника.`,
	replyRoleGiveAlready: `Учасник {member} уже має роль {role}.`,
	replyRoleGiveFailed: `Не вдалося видати роль.`,
	
	replyRoleTakeSuccess: `Забрано роль {role} в учасника {member}.`,
	replyRoleTakeMissing: `Учасник {member} не має ролі {role}.`,
	replyRoleTakeFailed: `Не вдалося забрати роль.`,
	
	replyRoleAddSuccess: `Роль {role} додано до вибраних.`,
	replyRoleAddExists: `Роль {role} уже вибрана.`,
	replyRoleAddLimit: `Досягнуто ліміту: не більше {limit} ролей на сервер.`,
	
	replyRoleRemoveSuccess: `Роль {role} прибрано з вибраних.`,
	replyRoleRemoveNotFound: `Ролі {role} немає серед вибраних.`,
	
	replyRoleListHeader: `Вибрані ролі ({count}):`,
	replyRoleListEmpty: `На цьому сервері немає вибраних ролей.`,
	replyRoleListDeleted: `(видалена)`,
	
	replyWhitelistYes: `Ця команда недоступна Вам, бо вона може зробити Вам щось. Спробуйте використати іншу команду або пізніше.`,
	replyWhitelistNo: `Ця команда недоступна Вам. Спробуйте використати іншу команду або пізніше.`,
	replyAuthorizedTesterNot: `Ця команда тестується. Спробуйте використати іншу команду або пізніше.`,
	
	replyLotteryKickYes: `<@{userId}>\n\nОй, схоже вдача не на Вашій стороні сьогодні. Шкода... насправді ні.\n\nЧерез 30 секунд Ваш кік. Напишіть Ваші останні слова.`,
	replyLotteryKickDm: `Хей! Ви тільки-но були кікнуті із серверу, на жаль. Ось посилання на сервер:\nhttps://discord.gg/{inviteCode}`,
	replyLotteryKickReason: `На жаль, удача не на Вашій стороні була того разу. Спробуйте знову наступного разу, якщо не страшно.`,
	replyLotteryKickError: `<@{userId}>\n\nВас не вдалося кікнути. Спробуйте знову.`,
	replyLotteryKickNo: `<@{userId}>\n\nЩо ж, Ваш кік не сьогодні... Спробуйте знову, якщо не боїтеся.\n\nСпробуєте знову? Все-таки, кік і є виграшем тут.`,
	
	replyLore: `Лор? Ну добре...\n\n{loreSnippet}`,
	
	replyLoreListLanguage: '**Мова: `{lang}`**',
	
	replyLoreCreateSuccess: `Успішно додано уривок лору до '{guildId}_{lang}.js'.`,
	replyLoreCreateTooLarge: `Файл лору досяг ліміту розміру ({limit} байт). Видаліть кілька фрагментів перед додаванням нових.`,
	replyLoreCreateError: `Не вдалося додати уривок лору.`,
	
	replyLoreRemoveSuccess: `Успішно видалено уривок лору #{number}.`,
	replyLoreRemoveNotFound: `Не вдалося знайти уривок лору з номером #{number}.`,
	
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
	descInfo: `Інформація про лор.`,
	descRoleCreate: `Створити роль і додати її до вибраних ролей сервера.`,
	descRoleGive: `Видати вибрану роль учаснику.`,
	descRoleTake: `Забрати вибрану роль в учасника.`,
	descRoleAdd: `Додати роль до вибраних ролей сервера.`,
	descRoleRemove: `Прибрати роль із вибраних ролей сервера.`,
	descRoleList: `Показати вибрані ролі сервера.`,
	descLotteryKick: `{kickChance}% на кік з серверу. Удачі!`,
	descLore: `Команда для лору.`,
	descLoreList: `Перелік уривків лору.`,
	descLoreCreate: `Додати новий уривок лору до файлу сервера.`,
	descLoreRemove: `Видалити фрагмент лору за його порядковим номером.`,
	descVoiceJoin: `Заходить в обраний голосовий канал.`,
	descVoiceLeave: `Покидає голосовий канал.`,
	descSoundboardPlay: `Запускає обраний звук в голосовому каналі.`,
	descSoundboardStop: `Припиняє звук в голосовому каналі.`,
	descSoundboardVolume: `Змінити гучність відтворення бота.`,
	
	// Options.
	optionRole: `Роль.`,
	optionRoleName: `Назва нової вибраної ролі.`,
	optionMember: `Учасник.`,
	optionVoiceChannel: `Виберіть голосовий канал.`,
	optionSound: `Виберіть звук для відтворення.`,
	optionVolumeLevel: `Рівень гучності від 0 до 100.`,
	optionLanguageCode: `Код мови (наприклад: en, uk).`,
	optionSnippet: `Текст уривка лору.`,
	optionSnippetNumber: `Номер уривка для видалення (дивіться /lore-list).`
}
