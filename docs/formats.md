# Discord Commands Formats:

-----

## Commands with Command as Format:

### /help

### /info

### /role-list

### /lottery-kick

### /lore

### /voice-leave

### /soundboard-stop

-----

## Commands wth One Format:

### /role-create
- To Create a server Selected Role: /role-create [ROLE_NAME]

### /role-add
- To Add a server already Existing role as a Selected Role: /role-add [ROLE]

### /role-give
- To Give a server Selected Role to a User: /role-give [MEMBER] [ROLE]

### /role-take
- To Take a server Selected Role from a User: /role-take [MEMBER] [ROLE]

### /role-remove
- To Remove a Role From server Selected Role: /role-remove [ROLE]

### /lore-create:
- To Create Lore Snippet of current Guild: /lore-create [LANGUAGE] [LORE_SNIPPET]

### /lore-remove:
- To Remove Lore Snippet of current Guild: /lore-remove [GUILD_ID] [LANGUAGE] [SNIPPET_NUMBER]

### /voice-join:
- To Join particular Voice Channel of current Guild: /voice-join [CHANNEL]

### /soundboard-play:
- To play playback on current Guild: /soundboard-play [SOUND]

### /soundboard-volume:
- To Change volume on current Guild: /soundboard-volume [VOLUME]

-----

## Command with Few Formats:

### /lore-list
- To List current Guild Snippets in a User's language: /lore-list
- To List current Guild Snippets in a Specific Language Lore: /lore-list [LANGUAGE]

-----
-----
-----

# Terminal Commands Formats:

-----

## Commands with Command as Format:

### help

### exit/shutdown

### stop

### restart

### reboot

### status

### ping

### clear

### info

-----

## Commands with One Format:

### role-create
- To Create a particular guild Selected Role: role-create [GUILD_ID] [ROLE_NAME]

### role-add
- To Add a particular guild already Existing role as a Selected Role: role-add [GUILD_ID] [ROLE_ID]

### role-give
- To Give a particular guild Selected Role to a User: role-give [GUILD_ID] [USER_ID] [ROLE_ID]

### role-take
- To Take a particular guild Selected Role from a User: role-take [GUILD_ID] [USER_ID] [ROLE_ID]

### role-remove
- To Remove a Role From particular guild Selected Role: role-remove [GUILD_ID] [ROLE_ID]

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

### role-list
- To List All Selected Roles: role-list
- To List particular Guild Selected Roles: role-list [GUILD_ID]

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
