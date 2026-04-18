const { spawn } = require("node:child_process");
const process = require("node:process");
const { Client, GatewayIntentBits, ChannelType } = require("discord.js");
const {
  AudioPlayerStatus,
  VoiceConnectionStatus,
  createAudioPlayer,
  createAudioResource,
  entersState,
  joinVoiceChannel,
  StreamType,
} = require("@discordjs/voice");
const ffmpegPath = require("ffmpeg-static");
require("dotenv").config();

const requiredEnvVars = [
  "DISCORD_TOKEN",
  "GUILD_ID",
  "VOICE_CHANNEL_ID",
  "RADIO_STREAM_URL",
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`Missing required environment variable: ${envVar}`);
    process.exit(1);
  }
}

if (!ffmpegPath) {
  console.error("Could not find ffmpeg. Make sure ffmpeg-static installed correctly.");
  process.exit(1);
}

const config = {
  token: process.env.DISCORD_TOKEN,
  guildId: process.env.GUILD_ID,
  voiceChannelId: process.env.VOICE_CHANNEL_ID,
  radioStreamUrl: process.env.RADIO_STREAM_URL,
  selfDeaf: process.env.BOT_DEAF !== "false",
  selfMute: process.env.BOT_MUTE === "true",
};

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

const player = createAudioPlayer();
let ffmpegProcess = null;

function stopCurrentStream() {
  if (ffmpegProcess) {
    ffmpegProcess.kill("SIGKILL");
    ffmpegProcess = null;
  }

  player.stop(true);
}

function startRadioStream() {
  stopCurrentStream();

  ffmpegProcess = spawn(
    ffmpegPath,
    [
      "-hide_banner",
      "-loglevel",
      "warning",
      "-reconnect",
      "1",
      "-reconnect_streamed",
      "1",
      "-reconnect_delay_max",
      "5",
      "-i",
      config.radioStreamUrl,
      "-f",
      "s16le",
      "-ar",
      "48000",
      "-ac",
      "2",
      "pipe:1",
    ],
    {
      stdio: ["ignore", "pipe", "pipe"],
    }
  );

  ffmpegProcess.stderr.on("data", (chunk) => {
    const message = chunk.toString().trim();
    if (message) {
      console.error(`[ffmpeg] ${message}`);
    }
  });

  ffmpegProcess.once("close", (code, signal) => {
    console.warn(`FFmpeg exited with code=${code} signal=${signal ?? "none"}`);
    ffmpegProcess = null;

    setTimeout(() => {
      console.log("Attempting to restart radio stream...");
      startRadioStream();
    }, 5000);
  });

  const resource = createAudioResource(ffmpegProcess.stdout, {
    inputType: StreamType.Raw,
  });

  player.play(resource);
  console.log(`Started radio stream: ${config.radioStreamUrl}`);
}

async function connectAndPlay() {
  const guild = await client.guilds.fetch(config.guildId);
  const channel = await guild.channels.fetch(config.voiceChannelId);

  if (!channel) {
    throw new Error("Voice channel not found.");
  }

  if (
    channel.type !== ChannelType.GuildVoice &&
    channel.type !== ChannelType.GuildStageVoice
  ) {
    throw new Error("Configured channel is not a voice channel.");
  }

  const connection = joinVoiceChannel({
    channelId: channel.id,
    guildId: guild.id,
    adapterCreator: guild.voiceAdapterCreator,
    selfDeaf: config.selfDeaf,
    selfMute: config.selfMute,
  });

  connection.on("error", (error) => {
    console.error("Voice connection error:", error);
  });

  connection.on("stateChange", (_, newState) => {
    console.log(`Voice connection state: ${newState.status}`);
  });

  player.on("stateChange", (_, newState) => {
    console.log(`Audio player state: ${newState.status}`);
  });

  player.on("error", (error) => {
    console.error("Audio player error:", error);
  });

  connection.subscribe(player);

  await entersState(connection, VoiceConnectionStatus.Ready, 30_000);
  console.log(`Joined voice channel: ${channel.name}`);

  if (channel.type === ChannelType.GuildStageVoice) {
    const me = await guild.members.fetchMe();
    if (me.voice.suppress) {
      await me.voice.setSuppressed(false).catch(() => {
        console.warn("Joined a stage channel but could not unsuppress the bot.");
      });
    }
  }

  startRadioStream();

  connection.on(VoiceConnectionStatus.Disconnected, async () => {
    console.warn("Voice connection disconnected. Waiting for recovery...");

    try {
      await Promise.race([
        entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
        entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
      ]);
    } catch {
      console.warn("Rejoining voice channel after disconnect...");
      stopCurrentStream();
      connection.destroy();
      await connectAndPlay();
    }
  });
}

client.once("clientReady", async () => {
  console.log(`Logged in as ${client.user.tag}`);

  try {
    await connectAndPlay();
  } catch (error) {
    console.error("Failed to join and play radio stream:", error);
    process.exit(1);
  }
});

client.on("shardError", (error) => {
  console.error("Discord websocket error:", error);
});

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

let shuttingDown = false;

async function shutdown() {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  console.log("Shutting down...");

  stopCurrentStream();
  client.destroy();
  process.exit(0);
}

client.login(config.token);
