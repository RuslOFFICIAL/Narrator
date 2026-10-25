# Discord Commands Formats:

-----

## Commands with Command as Format:

### help

### lore

### info

### lottery-kick

### voice-leave

### soundboard-stop

-----

## Commands wth One Format:

### lore-list:
- To List current Guild and Specific Language Lore Snippets: lore-list [LANGUAGE]

### lore-create:
- To Create Lore Snippet of current Guild: lore-create lore-create [LANGUAGE] [LORE_SNIPPET]

### lore-remove:
- To Remove Lore Snippet of current Guild: lore-remove [GUILD_ID] [LANGUAGE] [SNIPPET_NUMBER]

### voice-join:
- To Join particular Voice Channel of current Guild: voice-join [CHANNEL]

### soundboard-play:
- To play playback on current Guild: soundboard-play [SOUND]

### soundboard-volume:
- To Change volume on current Guild: soundboard-volume [VOLUME]

-----
-----
-----

# Terminal Commands Formats:

-----

## Commands with Command as Format:

### help

### exit/stop/shutdown

### restart/reboot

### status

### ping

### clear

### info

-----

## Commands with One Format:

### lore-create:
- To Create Lore Snippet of particular Guild: lore-create [GUILD_ID] [LANGUAGE] [LORE_SNIPPET]

### lore-remove:
- To Remove Lore Snippet of particular Guild: lore-remove [GUILD_ID] [LANGUAGE] [SNIPPET_NUMBER]

### voice-join
- To Join particular Voice Channel by ID: voice-join [CHANNEL_ID]

-----

## Command with Few Formats:

### echo:
- To Send Message: echo [CHANNEL_ID] [MESSAGE]
- To Edit Message: echo -e [CHANNEL_ID] [EDITED_TEXT]

### lore:
- To Get Random Lore Snippet: lore
- To Get specific Guild Lore Snippet: lore [GUILD_ID]
- To Get specific Language Lore Snippet: lore [LANGUAGE]
- To Get specific Guild and specific Language Lore Snippet: lore [GUILD_ID] [LANGUAGE]

### lore-list:
- To List All Lore Snippets: lore-list
- To List specific Guild Lore Snippets: lore-list [GUILD_ID]
- To List specific Language Lore Snippets: lore-list [LANGUAGE]
- To List specific Guild and specific Language Lore Snippets: lore-list [GUILD_ID] [LANGUAGE]

### voice-leave:
- To Leave All Voice Channels: voice-leave
- To Leave specific Guild Voice Channel: voice-leave [GUILD_ID]

### soundboard-play:
- To Play playback on All Guilds: soundboard-play [SOUND_NAME]
- To Play playback on specific Guild: soundboard-play [GUILD_ID] [SOUND_NAME]

### soundboard-stop:
- To Stop playback on All Guilds: soundboard-stop
- To Stop playback on specific Guild: soundboard-stop [GUILD_ID]

### soundboard-volume:
- To Change volume on All Guilds: soundboard-volume [VOLUME]
- To Change volume on Specific Guild: soundboard-volume [GUILD_ID] [VOLUME]
