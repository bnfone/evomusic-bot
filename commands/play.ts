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
import { convertToYouTubeLink } from "../utils/platformUtils";

export default {
  data: new SlashCommandBuilder()
    .setName("play")
    .setDescription(i18n.__("play.description"))
    .addStringOption((option) =>
      option
        .setName("song")
        .setDescription(i18n.__("play.optionSong")) // Lokalisierte Beschreibung
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
      await interaction.editReply(i18n.__("common.loading")).catch(console.error);
    } else {
      await interaction.reply(i18n.__("common.loading"));
    }

    if (config.DEBUG) console.log(`[Play] Verarbeite Song-Name oder Link: ${argSongName}`);

    // 1) Ist es eine Playlist?
    if (playlistPattern.test(argSongName)) {
      if (config.DEBUG) console.log("[Play] Playlist erkannt. Weiterleitung an /playlist Command.");
      await interaction.editReply(i18n.__("play.fetchingPlaylist")).catch(console.error);
      // Leite weiter zum /playlist Command
      return bot.slashCommandsMap.get("playlist")!.execute(interaction);
    }

    // 2) Einzelner Link (AppleMusic oder Spotify) => YouTube-Link konvertieren
    let songUrl: string | null = argSongName;

    if (appleMusicPattern.test(argSongName) || spotifyPattern.test(argSongName)) {
      const platform = appleMusicPattern.test(argSongName) ? "appleMusic" : "spotify";

      try {
        if (config.DEBUG) console.log(`[Play] Erkannt als ${platform}-Link. Konvertiere zu YouTube-Link.`);
        // Konvertiere zu YouTube-Link via platformUtils
        songUrl = await convertToYouTubeLink(argSongName);
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
      if (config.DEBUG) console.log(`[Play] Erstelle Song-Objekt aus URL: ${songUrl}`);
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
      if (config.DEBUG) console.log(`[Play] Füge Song zur bestehenden Queue hinzu: ${song.title}`);
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
    if (config.DEBUG) console.log("[Play] Erstelle neue MusicQueue.");

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

    // "Loading"-Nachricht löschen
    if (config.DEBUG) console.log("[Play] Starte Wiedergabe der Queue.");
    interaction.deleteReply().catch(console.error);
  }
};