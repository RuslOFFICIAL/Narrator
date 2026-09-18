module.exports = {
	// Long texts.
	helpText: `Narrator bot commands:

/help - Shows the bot commands.
/lore - Tells one of the parts of the lore.
/lore-create - Add a new lore snippet to a server file.
/info - Information about the lore.
/lottery-kick - {kickChance}% chance to be kicked from the server. Good luck!
/voice-join - Joins the selected voice channel.
/voice-leave - Leaves the voice channel.
/soundboard-play - Plays the selected sound in the voice channel.
/soundboard-stop - Stops the sound in the voice channel.`,
	
	infoText: `This server's lore is written by members with the "Manage Server" permission.
It is not created by the creator of the "Narrator" bot.`,	
	
	// Messages.
	replyBotLoading: `The bot is still loading. Please wait.`,
	replyCommandError: `Failed to execute the command [{commandName}]. Try again later.`,
	replyGuild: `This command can only be used on servers!`,
	replyVoiceNotFound: `Failed to find a voice channel with ID "{channelId}". Make sure the bot is on that server.`,
	replyNotInVoice: `The bot is not currently in a voice channel. Try running the "/voice-join" command first.`,
	replyLoreSnippetsUnavailable: `Lore snippets are currently unavailable.`,
	
	replyWhitelistYes: `This command is not available to you because it might do something to you. Try using another command or try again later.`,
	replyWhitelistNo: `This command is not available to you. Try using another command or try again later.`,
	replyAuthorizedTester: `This command is being tested. Try using another command or try again later.`,
	
	replyLore: `Lore? Well, alright...\n\n{loreSnippet}`,
	
	replyLoreCreateSuccess: `Successfully added lore snippet to '{guildId}_{lang}.js'!`,
	replyLoreCreateNoPermission: `You don't have permission to use this command (Requires "Manage Server" or "Administrator").`,
	replyLoreCreateError: `Failed to add lore snippet.`,
	
	replyLotteryKickYes: `<@{userId}>\n\nOh, it seems luck is not on your side today. Too bad... actually, not really.\n\nYour kick is in 30 seconds. Write your last words.`,
	replyLotteryKickDm: `Hey! You were just kicked from the server, unfortunately. Here is the link to the server:\nhttps://discord.gg/{inviteCode}`,
	replyLotteryKickReason: `Unfortunately, luck was not on your side that time. Try again next time, if you're not afraid.`,
	replyLotteryKickError: `<@{userId}>\n\nFailed to kick you. Try again.`,
	replyLotteryKickNo: `<@{userId}>\n\nWell, your kick isn't today... Try again, if you aren't afraid.\n\nWill you try again? After all, a kick is a win here.`,
	
	replyVoiceJoinSuccess: `The bot has successfully joined: "{channelName}".`,
	replyVoiceJoinError: `The bot failed to join the voice channel. Try again.`,
	
	replyVoiceLeaveSuccess: `The bot has successfully left the voice channel.`,
	replyVoiceLeaveError: `The bot failed to leave the voice channel. Try again.`,
	
	replySoundboardPlayNotFound: `The sound "{soundChoice}" was not found in the host folder "sounds".`,
	replySoundboardPlayPlaying: `The bot is playing the sound: "{soundChoice}"...`,
	replySoundboardPlayError: `The bot failed to play the sound. Try again.`,
	
	replySoundboardStopSuccess: `The bot's sound has been stopped in the voice channel.`,
	replySoundboardStopError: `The bot failed to stop the sound in the voice channel. Try again.`,
	
	replySoundboardVolumeSuccess: `The bot successfully set audio volume to {volume}%.`,
	replySoundboardVolumeError: `The bot failed to set audio volume. Try again.`,
	
	// Commands.
	descHelp: `Shows the bot commands.`,
	descLore: `Command for the lore.`,
	descLoreCreate: `Add a new lore snippet to a server file.`,
	descInfo: `Information about the lore.`,
	descLotteryKick: `{kickChance}% chance to be kicked from the server. Good luck!`,
	descVoiceJoin: `Joins the selected voice channel.`,
	descVoiceLeave: `Leaves the voice channel.`,
	descSoundboardPlay: `Plays the selected sound in the voice channel.`,
	descSoundboardStop: `Stops the sound in the voice channel.`,
	descSoundboardVolume: `Adjust the playback volume of the bot.`,

	optionChannel: `Select a voice channel.`,
	optionSound: `Select a sound to play.`,
	optionVolumeLevel: `Volume level from 0 to 100.`,
	optionLanguageCode: `Language code (e.g.: en, uk).`,
	optionSnippet: `The lore snippet text.`
}