'use strict';

const { Readable } = require('node:stream');
const { Client, GatewayIntentBits, ActivityType } = require('discord.js');
const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
  NoSubscriberBehavior,
  StreamType,
} = require('@discordjs/voice');

const ffmpegPath = require('ffmpeg-static');

if (ffmpegPath) {
  process.env.FFMPEG_PATH = ffmpegPath;
}

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const VOICE_CHANNEL_ID = process.env.VOICE_CHANNEL_ID;
const STREAM_URL = process.env.RADIO_STREAM_URL || 'https://radio.finwuh.uk/listen/goodwood/radio.mp3';
const NOW_PLAYING_API = process.env.NOW_PLAYING_API || 'https://radio.finwuh.uk/api/nowplaying/1';
const STATUS_UPDATE_INTERVAL_MS = Number(process.env.STATUS_UPDATE_INTERVAL_MS || 30000);

if (!DISCORD_TOKEN) {
  throw new Error('Missing DISCORD_TOKEN environment variable.');
}

if (!GUILD_ID || !VOICE_CHANNEL_ID) {
  throw new Error('Missing GUILD_ID or VOICE_CHANNEL_ID environment variable.');
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

const player = createAudioPlayer({
  behaviors: {
    noSubscriber: NoSubscriberBehavior.Play,
  },
});

let connection;
let reconnectTimeout;
let streamAbortController;

function restartStream(delayMs = 3000) {
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
  }

  reconnectTimeout = setTimeout(() => {
    void playStream();
  }, delayMs);
}

async function playStream() {
  try {
    if (!connection) {
      return;
    }

    if (streamAbortController) {
      streamAbortController.abort();
    }

    streamAbortController = new AbortController();

    const response = await fetch(STREAM_URL, {
      signal: streamAbortController.signal,
      headers: {
        'Icy-MetaData': '1',
      },
    });

    if (!response.ok || !response.body) {
      throw new Error(`Stream request failed with status ${response.status}`);
    }

    const nodeStream = Readable.fromWeb(response.body);
    const resource = createAudioResource(nodeStream, {
      inputType: StreamType.Arbitrary,
    });

    player.play(resource);
  } catch (error) {
    console.error('Failed to start stream:', error);
    restartStream(5000);
  }
}

async function updateNowPlayingPresence() {
  try {
    const response = await fetch(NOW_PLAYING_API, {
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Now playing request failed with status ${response.status}`);
    }

    const payload = await response.json();
    const song = payload?.now_playing?.song;

    const artist = song?.artist?.trim();
    const title = song?.title?.trim();
    const stationName = payload?.station?.name?.trim() || 'Goodwood FM';

    const trackText = artist && title ? `${artist} - ${title}` : title || artist;
    const activityName = (trackText || stationName).slice(0, 128);

    client.user?.setPresence({
      status: 'online',
      activities: [
        {
          name: activityName,
          type: ActivityType.Listening,
        },
      ],
    });
  } catch (error) {
    console.error('Failed to update now playing presence:', error);
  }
}

async function connectAndPlay() {
  const guild = await client.guilds.fetch(GUILD_ID);
  const channel = await guild.channels.fetch(VOICE_CHANNEL_ID);

  if (!channel?.isVoiceBased()) {
    throw new Error('Configured VOICE_CHANNEL_ID is not a voice channel.');
  }

  connection = joinVoiceChannel({
    guildId: guild.id,
    channelId: channel.id,
    adapterCreator: guild.voiceAdapterCreator,
    selfDeaf: true,
    selfMute: false,
  });

  connection.subscribe(player);

  connection.on(VoiceConnectionStatus.Disconnected, async () => {
    try {
      await Promise.race([
        entersState(connection, VoiceConnectionStatus.Signalling, 5000),
        entersState(connection, VoiceConnectionStatus.Connecting, 5000),
      ]);
    } catch {
      restartStream();
      connection.destroy();
      connection = undefined;
    }
  });

  await entersState(connection, VoiceConnectionStatus.Ready, 30000);
  await playStream();
}

player.on(AudioPlayerStatus.Idle, () => {
  restartStream();
});

player.on('error', (error) => {
  console.error('Audio player error:', error);
  restartStream();
});

client.once('ready', async () => {
  console.log(`Logged in as ${client.user?.tag}`);

  try {
    await connectAndPlay();
    await updateNowPlayingPresence();
    setInterval(() => {
      void updateNowPlayingPresence();
    }, STATUS_UPDATE_INTERVAL_MS);
  } catch (error) {
    console.error('Failed to initialize voice connection:', error);
  }
});

client.login(DISCORD_TOKEN).catch((error) => {
  console.error('Discord login failed:', error);
  process.exitCode = 1;
});
