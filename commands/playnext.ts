/********************************************
 * commands/playnext.ts
 ********************************************/
import { DiscordGatewayAdapterCreator, joinVoiceChannel } from "@discordjs/voice";
import {
  ChatInputCommandInteraction,
  PermissionsBitField,
  SlashCommandBuilder,
  TextChannel,
} from "discord.js";
import { bot } from "../index";
import { MusicQueue } from "../structs/MusicQueue";
import { Song } from "../structs/Song";
import { i18n } from "../utils/i18n";
import { playlistPattern } from "../utils/patterns";
import { convertToYouTubeLink } from "../utils/platform";
import { isSongBlacklisted } from "../utils/blacklist";

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
    const argSongName = interaction.options.getString("song")!;
    
    // Retrieve the member and voice channel of the user executing the command
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
          content: i18n.__mf("play.errorNotInSameChannel", { user: bot.client.user!.username }),
          ephemeral: true,
        })
        .catch(console.error);
    }

    if (!argSongName) {
      return interaction
        .reply({
          content: i18n.__mf("play.usageReply", { prefix: bot.prefix }),
          ephemeral: true,
        })
        .catch(console.error);
    }

    // Send initial loading message
    await interaction.reply("⏳ Loading...").catch(console.error);

    if (playlistPattern.test(argSongName)) {
      // If the argument is a playlist, forward the command to the playlist command
      await interaction.editReply("🔗 Link is playlist").catch(console.error);
      return bot.slashCommandsMap.get("playlist")!.execute(interaction);
    }

    // Convert AppleMusic/Spotify links to YouTube links if needed
    let songUrl: string | null = argSongName;
    try {
      songUrl = await convertToYouTubeLink(argSongName);
      if (!songUrl) {
        throw new Error(i18n.__("play.errorNoResults"));
      }
    } catch (error) {
      console.error("[Playnext] Error converting URL:", error);
      return interaction
        .editReply({ content: i18n.__("play.errorNoResults") })
        .catch(console.error);
    }

    // Create the Song object and perform the blacklist check
    let song: Song;
try {
  song = await Song.from(songUrl, argSongName);
  // Set the requesterId for statistics logging
  (song as any).requesterId = interaction.user.id;
  if (isSongBlacklisted(song.url)) {
    await interaction.editReply({ content: "This song is blacklisted and cannot be played." });
    return;
  }
} catch (error: any) {
  console.error("[Playnext] Fehler beim Erstellen des Songs:", error);
  return interaction
    .editReply({ content: i18n.__("common.errorCommand") })
    .catch(console.error);
}

    // If a queue already exists, insert the song right after the currently playing song
    if (queue) {
      // Insert the song at index 1 (position after current song)
      queue.songs.splice(1, 0, song);
      return interaction
        .editReply({
          content: i18n.__mf("play.queueAdded", { title: song.title, author: interaction.user.id }),
        })
        .catch(console.error);
    }

    // If no queue exists, create a new MusicQueue and add the song at position 1
    const newQueue = new MusicQueue({
      interaction,
      textChannel: interaction.channel! as TextChannel,
      connection: joinVoiceChannel({
        channelId: channel.id,
        guildId: channel.guild.id,
        adapterCreator: channel.guild.voiceAdapterCreator as DiscordGatewayAdapterCreator,
      }),
    });

    bot.queues.set(interaction.guild!.id, newQueue);
    // Insert song at index 1 (this will work even if queue is empty because index 0 is reserved for current song once playback starts)
    newQueue.songs.splice(1, 0, song);
    newQueue.play();
    await interaction.deleteReply().catch(console.error);
  },
};