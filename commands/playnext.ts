/********************************************
 * commands/playnext.ts
 *
 * This command behaves similarly to the /play command,
 * but instead of appending a song to the end of the queue,
 * it inserts the song directly after the currently playing song.
 *
 * If a playlist URL is provided, it redirects the request
 * to the /playlist command.
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
import { playlistPattern, appleMusicPattern, spotifyPattern, isURL } from "../utils/patterns";
import { convertToYouTubeLink } from "../utils/platform";
import { isSongBlacklisted } from "../utils/blacklist";
import { handleError } from "../utils/errorHandler";
import { log, error as logError } from "../utils/logger";
import { logSongRequested } from "../utils/stats";

export default {
  data: new SlashCommandBuilder()
    .setName("playnext")
    .setDescription(i18n.__("playnext.description"))
    .addStringOption((option) =>
      option
        .setName("song")
        .setDescription("The song you want to play next")
        .setRequired(true)
    ),
  cooldown: 3,
  permissions: [PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.Speak],

  async execute(interaction: ChatInputCommandInteraction) {
    // Retrieve the song argument.
    const argSongName = interaction.options.getString("song")!;
    
    // Retrieve the member and voice channel of the user executing the command.
    const guildMember = interaction.guild!.members.cache.get(interaction.user.id);
    const { channel } = guildMember!.voice;
    if (!channel) {
      return interaction
        .reply({ content: i18n.__("play.errorNotChannel"), ephemeral: true })
        .catch(logError);
    }

    // Check if a queue already exists and if the user is in the same voice channel as the bot.
    const queue = bot.queues.get(interaction.guild!.id);
    if (queue && channel.id !== queue.connection.joinConfig.channelId) {
      return interaction
        .reply({
          content: i18n.__mf("play.errorNotInSameChannel", { user: bot.client.user!.username }),
          ephemeral: true,
        })
        .catch(logError);
    }

    if (!argSongName) {
      return interaction
        .reply({
          content: i18n.__mf("play.usageReply", { prefix: bot.prefix }),
          ephemeral: true,
        })
        .catch(logError);
    }

    // Log command usage for statistics.
    logSongRequested(interaction.user.id, argSongName).catch(logError);

    // Send an initial loading message.
    await interaction.reply("⏳ Loading...").catch(logError);

    // If the argument is a playlist URL, forward to the /playlist command.
    if (playlistPattern.test(argSongName)) {
      log("[Playnext] Playlist recognized. Redirecting to /playlist command.");
      await interaction.editReply(i18n.__("play.fetchingPlaylist")).catch(logError);
      return bot.slashCommandsMap.get("playlist")!.execute(interaction);
    }

    // Determine if the provided argument is a URL.
    let songUrl: string | null;
    if (isURL.test(argSongName)) {
      // If it's a URL, check if it's an Apple Music or Spotify link.
      if (appleMusicPattern.test(argSongName) || spotifyPattern.test(argSongName)) {
        const platform = appleMusicPattern.test(argSongName) ? "appleMusic" : "spotify";
        try {
          log(`[Playnext] Recognized as ${platform} link. Converting to YouTube link.`);
          songUrl = await convertToYouTubeLink(argSongName);
          if (!songUrl) {
            throw new Error(i18n.__("play.errorNoResults"));
          }
        } catch (error) {
          logError(`[Playnext] Error converting ${platform} link:`, error as Error);
          return interaction.editReply({ content: i18n.__("play.errorNoResults") }).catch(logError);
        }
      } else {
        // Otherwise, assume it's a valid YouTube URL.
        songUrl = argSongName;
      }
    } else {
      // If it's not a URL, treat it as a search query.
      songUrl = argSongName;
    }

    // Create the Song object.
    let song: Song;
    try {
      log(`[Playnext] Creating Song object from URL/search query: ${songUrl}`);
      song = await Song.from(songUrl!, argSongName);
      // Set the requesterId for statistics tracking.
      (song as any).requesterId = interaction.user.id;
      if (isSongBlacklisted(song.url)) {
        await interaction.editReply({ content: i18n.__("play.errorSongBlacklisted") });
        return;
      }
    } catch (error: any) {
      logError("[Playnext] Error creating Song object:", error as Error);
      return interaction.editReply({ content: i18n.__("common.errorCommand") }).catch(logError);
    }

    // If a queue exists, insert the song at index 1 (after the current song).
    if (queue) {
      queue.songs.splice(1, 0, song);
      log(`[Playnext] Added song to existing queue: ${song.title}`);
      return (interaction.channel as TextChannel)
        .send({
          content: i18n.__mf("play.queueAdded", { title: song.title, author: interaction.user.id }),
        })
        .catch(logError);
    }

    // If no queue exists, create a new MusicQueue, add the song at index 1, and start playback.
    log("[Playnext] Creating new MusicQueue.");
    const newQueue = new MusicQueue({
      interaction,
      textChannel: interaction.channel as TextChannel,
      connection: joinVoiceChannel({
        channelId: channel.id,
        guildId: channel.guild.id,
        adapterCreator: channel.guild.voiceAdapterCreator as DiscordGatewayAdapterCreator,
      }),
    });
    bot.queues.set(interaction.guild!.id, newQueue);
    newQueue.songs.splice(1, 0, song);
    newQueue.play();
    await interaction.deleteReply().catch(logError);
  },
};