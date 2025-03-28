/********************************************
 * commands/play.ts
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
    let argSongName = interaction.options.getString("song")!;

    // Get the member who invoked the command and check their voice channel
    const guildMember = interaction.guild!.members.cache.get(interaction.user.id);
    const { channel } = guildMember!.voice;

    if (!channel) {
      return interaction
        .reply({ content: i18n.__("play.errorNotChannel"), ephemeral: true })
        .catch(console.error);
    }

    // Check if a queue already exists and if the user is in the same voice channel as the bot
    const queue = bot.queues.get(interaction.guild!.id);
    if (queue && channel.id !== queue.connection.joinConfig.channelId) {
      return interaction
        .reply({
          content: i18n.__mf("play.errorNotInSameChannel", {
            user: bot.client.user!.username
          }),
          ephemeral: true
        })
        .catch(console.error);
    }

    if (!argSongName) {
      return interaction
        .reply({
          content: i18n.__mf("play.usageReply", { prefix: bot.prefix }),
          ephemeral: true
        })
        .catch(console.error);
    }

    // Send a loading message to the user
    if (interaction.replied) {
      await interaction.editReply(i18n.__("common.loading")).catch(console.error);
    } else {
      await interaction.reply(i18n.__("common.loading"));
    }

    if (config.DEBUG) console.log(`[Play] Processing song name or link: ${argSongName}`);

    // 1) Check if the input is a playlist URL
    if (playlistPattern.test(argSongName)) {
      if (config.DEBUG) console.log("[Play] Playlist recognized. Redirecting to /playlist command.");
      await interaction.editReply(i18n.__("play.fetchingPlaylist")).catch(console.error);
      // Redirect to the /playlist command
      return bot.slashCommandsMap.get("playlist")!.execute(interaction);
    }

    // 2) For single links (AppleMusic or Spotify), convert to a YouTube link
    let songUrl: string | null = argSongName;
    if (appleMusicPattern.test(argSongName) || spotifyPattern.test(argSongName)) {
      const platform = appleMusicPattern.test(argSongName) ? "appleMusic" : "spotify";

      try {
        if (config.DEBUG) console.log(`[Play] Recognized as ${platform} link. Converting to YouTube link.`);
        songUrl = await convertToYouTubeLink(argSongName);
        if (!songUrl) {
          throw new Error(i18n.__("play.errorNoResults"));
        }
      } catch (error) {
        console.error(`Error converting ${platform} link:`, error);
        // Use unified error handler for conversion errors
        return handleError(interaction, error as Error);
      }
    }

    let song: Song;
    try {
      if (config.DEBUG) console.log(`[Play] Creating song object from URL: ${songUrl}`);
      // Create a Song object from the YouTube link
      song = await Song.from(songUrl!, argSongName);
      // Set the requesterId for accurate statistics logging
      (song as any).requesterId = interaction.user.id;
      // Check if the song is blacklisted
      if (isSongBlacklisted(song.url)) {
        return interaction.editReply({ content: i18n.__("play.errorSongBlacklisted") });
      }
    } catch (error) {
      console.error("Error creating song object:", error);
      return handleError(interaction, error as Error);
    }

    // 3) Populate the queue
    if (queue) {
      queue.enqueue(song);
      if (config.DEBUG) console.log(`[Play] Adding song to existing queue: ${song.title}`);
      return (interaction.channel as TextChannel)
        .send({
          content: i18n.__mf("play.queueAdded", {
            title: song.title,
            author: interaction.user.id
          })
        })
        .catch(console.error);
    }

    // No existing queue: Create a new MusicQueue
    if (config.DEBUG) console.log("[Play] Creating new MusicQueue.");
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

    if (config.DEBUG) console.log("[Play] Starting queue playback.");
    interaction.deleteReply().catch(console.error);
  }
};