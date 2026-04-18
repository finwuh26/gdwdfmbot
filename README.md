# Discord Radio Bot

A simple `discord.js` bot that:

- logs into your Discord server
- automatically joins a chosen voice channel
- plays an MP3 radio stream URL continuously
- restarts the stream if FFmpeg drops or the connection is interrupted

## Requirements

- Node.js 18 or newer
- A Discord bot token
- A server ID and voice channel ID

## Setup

1. Install dependencies:

```bash
npm install
```

2. Copy the example environment file:

```bash
copy .env.example .env
```

3. Fill in `.env`:

```env
DISCORD_TOKEN=your_bot_token_here
GUILD_ID=your_server_id_here
VOICE_CHANNEL_ID=your_voice_channel_id_here
RADIO_STREAM_URL=https://example.com/stream.mp3
BOT_DEAF=true
BOT_MUTE=false
```

## Bot Permissions

Your bot should have these permissions in the target server/channel:

- View Channels
- Connect
- Speak

If you want to use a Stage Channel, the bot may also need permission to request to speak or be unsuppressed by a moderator.

## Run

```bash
npm start
```

## Notes

- The bot uses `ffmpeg-static` to decode the MP3 radio stream and send raw audio to Discord.
- The bot also needs an Opus encoder. This project uses `opusscript`, which is easier to install on Windows than native Opus bindings.
- If your radio source requires special headers, auth, or redirects, the FFmpeg input command may need to be adjusted.
