/********************************************
 * commands/play.ts
 *
 * This command handles the /play functionality.
 * It accepts a song query or link (which can be from YouTube,
 * Spotify, or Apple Music) and converts it into a YouTube link.
 *
 * For Spotify and Apple Music links, it uses the new platform conversion
 * logic (via convertToYouTubeLink) that extracts metadata and searches YouTube.
 *
 * If the input is a playlist URL, the command redirects to the /playlist command.
 *
 * Logging and unified error handling are used throughout the process.
 ********************************************/

import {
  DiscordGatewayAdapterCreator,
  joinVoiceChannel
} from "@discordjs/voice";
import {
  ChatInputCommandInteraction,
  PermissionsBitField,
  SlashCommandBuilder,
  TextChannel
} from "discord.js";
import { bot } from "../index";
import { MusicQueue } from "../structs/MusicQueue";
import { Song } from "../structs/Song";
import { i18n } from "../utils/i18n";
import { config } from "../utils/config";
import {
  playlistPattern,
  appleMusicPattern,
  spotifyPattern
} from "../utils/patterns";
import { convertToYouTubeLink } from "../utils/platform";
import { isSongBlacklisted } from "../utils/blacklist";
import { handleError } from "../utils/errorHandler";
import { log, error as logError } from "../utils/logger";
import { logSongRequested } from "../utils/stats";

export default {
  data: new SlashCommandBuilder()
    .setName("play")
    .setDescription(i18n.__("play.description"))
    .addStringOption((option) =>
      option
        .setName("song")
        .setDescription(i18n.__("play.optionSong"))
        .setRequired(true)
    ),
  cooldown: 3,
  permissions: [PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.Speak],

  async execute(interaction: ChatInputCommandInteraction) {
    // Retrieve the song query or URL provided by the user.
    let argSongName = interaction.options.getString("song")!;

    // Retrieve the guild member who invoked the command and check their voice channel.
    const guildMember = interaction.guild!.members.cache.get(interaction.user.id);
    const { channel } = guildMember!.voice;

    // If the member is not in any voice channel, send an error reply.
    if (!channel) {
      return interaction
        .reply({ content: i18n.__("play.errorNotChannel"), ephemeral: true })
        .catch(logError);
    }

    // Check if a music queue already exists for this guild.
    // If so, ensure that the user is in the same voice channel as the bot.
    const queue = bot.queues.get(interaction.guild!.id);
    if (queue && channel.id !== queue.connection.joinConfig.channelId) {
      return interaction
        .reply({
          content: i18n.__mf("play.errorNotInSameChannel", {
            user: bot.client.user!.username
          }),
          ephemeral: true
        })
        .catch(logError);
    }

    // If no song argument is provided, send usage information.
    if (!argSongName) {
      return interaction
        .reply({
          content: i18n.__mf("play.usageReply", { prefix: bot.prefix }),
          ephemeral: true
        })
        .catch(logError);
    }

    // Inform the user that the request is being processed.
    if (interaction.replied) {
      await interaction.editReply(i18n.__("common.loading")).catch(logError);
    } else {
      await interaction.reply(i18n.__("common.loading")).catch(logError);
    }

    log(`[Play] Processing song input: ${argSongName}`);

    // 1) Check if the input is a playlist URL.
    // If so, redirect to the /playlist command.
    if (playlistPattern.test(argSongName)) {
      log("[Play] Playlist recognized. Redirecting to /playlist command.");
      await interaction.editReply(i18n.__("play.fetchingPlaylist")).catch(logError);
      return bot.slashCommandsMap.get("playlist")!.execute(interaction);
    }

    // 2) For single links (Apple Music or Spotify), convert them to a YouTube link.
    let songUrl: string | null = argSongName;
    if (appleMusicPattern.test(argSongName) || spotifyPattern.test(argSongName)) {
      const platform = appleMusicPattern.test(argSongName) ? "appleMusic" : "spotify";
      try {
        log(`[Play] Recognized as ${platform} link. Converting to YouTube link.`);
        songUrl = await convertToYouTubeLink(argSongName);
        if (!songUrl) {
          throw new Error(i18n.__("play.errorNoResults"));
        }
      } catch (error) {
        logError(`[Play] Error converting ${platform} link:`, error as Error);
        return handleError(interaction, error as Error);
      }
    }

    // 3) Create a Song object from the resolved YouTube link.
    let song: Song;
    try {
      log(`[Play] Creating Song object from URL: ${songUrl}`);
      song = await Song.from(songUrl!, argSongName);
      // Attach the requesterId for tracking and statistics.
      (song as any).requesterId = interaction.user.id;
      // Log that this song was requested.
      // (Make sure to import logSongRequested from your stats module.)
      await logSongRequested(interaction.user.id, song.url);
      if (isSongBlacklisted(song.url)) {
        return interaction.editReply({ content: i18n.__("play.errorSongBlacklisted") });
      }
    } catch (error) {
      logError("[Play] Error creating Song object:", error as Error);
      return handleError(interaction, error as Error);
    }

    // 4) Enqueue the song into the current queue, or create a new queue if none exists.
    if (queue) {
      queue.enqueue(song);
      log(`[Play] Adding song to existing queue: ${song.title}`);
      return (interaction.channel as TextChannel)
        .send({
          content: i18n.__mf("play.queueAdded", {
            title: song.title,
            author: interaction.user.id
          })
        })
        .catch(logError);
    }

    // Create a new music queue if no queue exists.
    log("[Play] Creating new MusicQueue.");
    const newQueue = new MusicQueue({
      interaction,
      textChannel: interaction.channel! as TextChannel,
      connection: joinVoiceChannel({
        channelId: channel.id,
        guildId: channel.guild.id,
        adapterCreator: channel.guild.voiceAdapterCreator as DiscordGatewayAdapterCreator
      })
    });
    bot.queues.set(interaction.guild!.id, newQueue);
    newQueue.enqueue(song);

    log("[Play] Starting playback with new MusicQueue.");
    interaction.deleteReply().catch(logError);
  }
};