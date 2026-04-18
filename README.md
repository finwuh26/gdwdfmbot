# gdwdfmbot

Discord bot using discord.js that:
- Automatically joins a configured voice channel on startup
- Plays the Goodwood FM MP3 stream continuously
- Updates bot presence from the now-playing API

## Requirements
- Node.js 18+
- A Discord bot token
- Bot invited to your server with permissions to:
  - View Channels
  - Connect
  - Speak

## Setup
1. Install dependencies:
   ```bash
   npm install
   ```
2. Configure environment variables:
   - `DISCORD_TOKEN` (required)
   - `GUILD_ID` (required)
   - `VOICE_CHANNEL_ID` (required)
   - `RADIO_STREAM_URL` (optional, default: `https://radio.finwuh.uk/listen/goodwood/radio.mp3`)
   - `NOW_PLAYING_API` (optional, default: `https://radio.finwuh.uk/api/nowplaying/1`)
   - `STATUS_UPDATE_INTERVAL_MS` (optional, default: `30000`)

3. Start the bot:
   ```bash
   npm start
   ```

## Notes
- No slash commands are used.
- Presence is set to a Listening activity with the current song from the API.
