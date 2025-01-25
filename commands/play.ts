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
import {
  playlistPattern,
  appleMusicPattern,
  spotifyPattern
} from "../utils/patterns";

// Importiere die Cache-gestützte Odesli-Logik
import {
  getOdesliDataWithCache,
  getYouTubeLinkFromOdesliData
} from "../utils/musicLinkConverter";

export default {
  data: new SlashCommandBuilder()
    .setName("play")
    .setDescription(i18n.__("play.description"))
    .addStringOption((option) =>
      option
        .setName("song")
        .setDescription("The song you want to play")
        .setRequired(true)
    ),
  cooldown: 3,
  permissions: [PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.Speak],

  async execute(interaction: ChatInputCommandInteraction) {
    let argSongName = interaction.options.getString("song")!;

    const guildMember = interaction.guild!.members.cache.get(interaction.user.id);
    const { channel } = guildMember!.voice;

    if (!channel) {
      return interaction
        .reply({ content: i18n.__("play.errorNotChannel"), ephemeral: true })
        .catch(console.error);
    }

    // Prüfe, ob schon eine Queue existiert und ob der User im gleichen Kanal ist
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

    if (interaction.replied) {
      await interaction.editReply("⏳ Loading...").catch(console.error);
    } else {
      await interaction.reply("⏳ Loading...");
    }

    // 1) Ist es eine Playlist?
    if (playlistPattern.test(argSongName)) {
      await interaction.editReply("🔗 Link is playlist").catch(console.error);
      // Leite weiter zum /playlist Command
      return bot.slashCommandsMap.get("playlist")!.execute(interaction);
    }

    // 2) Einzelner Link (AppleMusic oder Spotify) => YouTube-Link konvertieren
    let songUrl: string | null = argSongName;

    if (appleMusicPattern.test(argSongName) || spotifyPattern.test(argSongName)) {
      const platform = appleMusicPattern.test(argSongName) ? "appleMusic" : "spotify";

      try {
        // Cache-gestützte Odesli-API nutzen
        const odesliData = await getOdesliDataWithCache(argSongName);
        if (!odesliData) {
          throw new Error(i18n.__("play.errorNoResults"));
        }

        // YouTube-Link aus Odesli-Daten extrahieren
        songUrl = getYouTubeLinkFromOdesliData(odesliData);
        if (!songUrl) {
          throw new Error(i18n.__("play.errorNoResults"));
        }
      } catch (error) {
        console.error(`Fehler bei der Konvertierung von ${platform}-Link:`, error);
        return interaction
          .editReply({ content: i18n.__("play.errorNoResults") })
          .catch(console.error);
      }
    }

    let song: Song;
    try {
      // Song-Objekt aus YouTube-Link erstellen
      song = await Song.from(songUrl!, argSongName);
    } catch (error: any) {
      console.error("Fehler beim Erstellen des Songs:", error);
      return interaction
        .editReply({ content: i18n.__("common.errorCommand") })
        .catch(console.error);
    }

    // 3) Queue befüllen
    if (queue) {
      queue.enqueue(song);

      // Informiere den Channel, dass der Song zur Warteschlange hinzugefügt wurde
      return (interaction.channel as TextChannel)
        .send({
          content: i18n.__mf("play.queueAdded", {
            title: song.title,
            author: interaction.user.id
          })
        })
        .catch(console.error);
    }

    // Noch keine Queue => Neue erstellen
    const newQueue = new MusicQueue({
      interaction,
      textChannel: interaction.channel! as TextChannel,
      connection: joinVoiceChannel({
        channelId: channel.id,
        guildId: channel.guild.id,
        adapterCreator: channel.guild
          .voiceAdapterCreator as DiscordGatewayAdapterCreator
      })
    });

    bot.queues.set(interaction.guild!.id, newQueue);
    newQueue.enqueue(song);

    // "Loading"-Nachricht löschen
    interaction.deleteReply().catch(console.error);
  }
};