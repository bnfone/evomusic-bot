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
import { convertToYouTubeLink } from "../utils/platformUtils";

export default {
  data: new SlashCommandBuilder()
    .setName("playnext")
    .setDescription(i18n.__("playnext.description"))
    .addStringOption((option) =>
      option.setName("song").setDescription("The song you want to play next").setRequired(true)
    ),
  cooldown: 3,
  permissions: [PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.Speak],

  async execute(interaction: ChatInputCommandInteraction) {
    const argSongName = interaction.options.getString("song")!;
    const guildMember = interaction.guild!.members.cache.get(interaction.user.id);
    const { channel } = guildMember!.voice;

    if (!channel) {
      return interaction
        .reply({ content: i18n.__("play.errorNotChannel"), ephemeral: true })
        .catch(console.error);
    }

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

    await interaction.reply("⏳ Loading...");

    // 1) Ist es eine Playlist?
    if (playlistPattern.test(argSongName)) {
      await interaction.editReply("🔗 Link is playlist").catch(console.error);
      return bot.slashCommandsMap.get("playlist")!.execute(interaction);
    }

    // 2) Einzelner Link (AppleMusic, Spotify) => YouTube-Link konvertieren
    let songUrl: string | null = argSongName;

    try {
      songUrl = await convertToYouTubeLink(argSongName);
      if (!songUrl) {
        throw new Error(i18n.__("play.errorNoResults"));
      }
    } catch (error) {
      console.error("[Playnext] Fehler bei der URL-Konvertierung:", error);
      return interaction
        .editReply({ content: i18n.__("play.errorNoResults") })
        .catch(console.error);
    }

    let song: Song;
    try {
      song = await Song.from(songUrl, argSongName);
    } catch (error: any) {
      console.error("[Playnext] Fehler beim Erstellen des Songs:", error);
      return interaction
        .editReply({ content: i18n.__("common.errorCommand") })
        .catch(console.error);
    }

    if (queue) {
      queue.songs.splice(1, 0, song); // Füge den Song an die zweite Position in der Queue
      return interaction
        .editReply({
          content: i18n.__mf("play.queueAdded", { title: song.title, author: interaction.user.id }),
        })
        .catch(console.error);
    }

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
    newQueue.songs.splice(1, 0, song); // Füge den Song an die zweite Position in der Queue
    newQueue.play();
    await interaction.deleteReply().catch(console.error);
  },
};