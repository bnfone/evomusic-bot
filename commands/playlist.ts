/********************************************
 * commands/playlist.ts
 ********************************************/
import {
  DiscordGatewayAdapterCreator,
  joinVoiceChannel,
} from "@discordjs/voice";
import {
  ChatInputCommandInteraction,
  PermissionsBitField,
  SlashCommandBuilder,
  TextChannel,
  VoiceChannel,
} from "discord.js";
import { bot } from "../index";
import { MusicQueue } from "../structs/MusicQueue";
import { Song } from "../structs/Song";
import { i18n } from "../utils/i18n";
import { Playlist } from "../structs/Playlist";
import { config } from "../utils/config";
import {
  playlistPattern,
  appleMusicPattern,
  spotifyPattern
} from "../utils/patterns";
import { getSpotifyTracks } from "../utils/spotifyUtils";
import { processAppleMusicPlaylist } from "../utils/appleMusicUtils";
import { convertToYouTubeLink } from "../utils/platformUtils";

export default {
  data: new SlashCommandBuilder()
    .setName("playlist")
    .setDescription(i18n.__("playlist.description"))
    .addStringOption((option) =>
      option
        .setName("playlist")
        .setDescription("Playlist name or link")
        .setRequired(true)
    ),
  cooldown: 5,
  permissions: [PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.Speak],

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();

    if (!interaction.guild) {
      await interaction.editReply(
        "Dieser Befehl kann nicht außerhalb eines Servers verwendet werden."
      );
      return;
    }

    const argPlaylistUrl = interaction.options.getString("playlist") ?? "";
    const guildMember = interaction.guild.members.cache.get(interaction.user.id);
    const channel =
      guildMember?.voice.channel instanceof VoiceChannel
        ? guildMember.voice.channel
        : null;

    if (!channel) {
      await interaction.editReply({
        content: i18n.__("playlist.errorNotChannel"),
      });
      return;
    }

    if (config.DEBUG) console.log(`[Playlist] Verarbeite Playlist-URL: ${argPlaylistUrl}`);

    if (argPlaylistUrl.includes("spotify.com")) {
      // Spotify-Playlist (oder Album)
      try {
        if (config.DEBUG) console.log("[Playlist] Spotify-Playlist erkannt.");
    
        const spotifyTrackUrls = await getSpotifyTracks(argPlaylistUrl);
        if (config.DEBUG) console.log(`[Playlist] Gefundene Spotify-Track-URLs: ${spotifyTrackUrls}`);
    
        if (spotifyTrackUrls.length === 0) {
          await interaction.editReply("Keine Spotify-Songs gefunden.");
          return;
        }

        // Erste zwei Songs synchron abarbeiten
        const firstTwo = spotifyTrackUrls.slice(0, 2);
        for (const spotifyUrl of firstTwo) {
          await processOneSpotifySong(interaction, spotifyUrl, channel);
        }

        // Prüfe, ob schon etwas in der Queue liegt
        const queue = bot.queues.get(interaction.guild.id);
        if (!queue || queue.songs.length === 0) {
          await interaction.followUp({
            content: "Keine Songs konnten zur Warteschlange hinzugefügt werden.",
          });
          return;
        }

        // Rest asynchron abarbeiten
        const remaining = spotifyTrackUrls.slice(2);
        for (const spotifyUrl of remaining) {
          processOneSpotifySong(interaction, spotifyUrl, channel).catch(console.error);
        }

        await interaction.followUp(
          `Füge **${spotifyTrackUrls.length}** Spotify-Songs hinzu ...`
        );
      } catch (error) {
        console.error("[Playlist] Fehler beim Verarbeiten der Spotify-Playlist:", error);
        await interaction.editReply("Es gab ein Problem beim Verarbeiten der Spotify-Playlist.");
      }
    } else if (argPlaylistUrl.includes("music.apple.com")) {
      // Apple-Music-Playlist
      try {
        if (config.DEBUG) console.log("[Playlist] Apple-Music-Playlist erkannt.");
        await processAppleMusicPlaylist(argPlaylistUrl, interaction);
      } catch (error) {
        console.error("[Playlist] Fehler beim Verarbeiten der Apple-Music-Playlist:", error);
        await interaction.editReply("Es gab ein Problem beim Verarbeiten der Apple-Music-Playlist.");
      }
    } else {
      // YouTube-Playlist oder andere Plattform
      try {
        if (config.DEBUG) console.log("[Playlist] YouTube-Playlist oder andere Plattform erkannt.");

        const playlist = await Playlist.from(argPlaylistUrl);
        if (!playlist?.videos?.length) {
          await interaction.editReply("Keine Songs in der YouTube-Playlist gefunden");
          return;
        }

        let queue = bot.queues.get(interaction.guild.id);
        if (!queue) {
          if (config.DEBUG) console.log("[Playlist] Erstelle neue MusicQueue.");
          queue = new MusicQueue({
            interaction,
            textChannel: interaction.channel as TextChannel,
            connection: joinVoiceChannel({
              channelId: channel.id,
              guildId: channel.guild.id,
              adapterCreator: channel.guild.voiceAdapterCreator as DiscordGatewayAdapterCreator,
            }),
          });
          bot.queues.set(interaction.guild.id, queue);
        }
        queue.enqueue(...playlist.videos);
        await interaction.followUp(
          `YouTube-Playlist mit **${playlist.videos.length}** Songs hinzugefügt!`
        );
      } catch (error) {
        console.error("[Playlist] Fehler beim Verarbeiten der YouTube-Playlist:", error);
        await interaction.editReply("Es gab ein Problem beim Verarbeiten der YouTube-Playlist.");
      }
    }
  },
};

/**
 * Verarbeitet einen einzigen Spotify-Track-Eintrag (Spotify-URL).
 * Sucht den YouTube-Link via platformUtils.convertToYouTubeLink().
 */
/**
 * Verarbeitet einen einzigen Spotify-Track-Eintrag (Spotify-URL).
 * Sucht den YouTube-Link via platformUtils.convertToYouTubeLink().
 */
async function processOneSpotifySong(
  interaction: ChatInputCommandInteraction,
  spotifyUrl: string,
  voiceChannel: VoiceChannel
): Promise<void> {
  try {
    if (config.DEBUG) console.log(`[Playlist] Verarbeite Spotify-URL: ${spotifyUrl}`);

    // Konvertiere Spotify-URL zu YouTube-URL
    const youtubeUrl = await convertToYouTubeLink(spotifyUrl);
    if (!youtubeUrl) {
      if (config.DEBUG) console.warn(`[Playlist] Kein YouTube-Link gefunden für Spotify-URL: ${spotifyUrl}`);
      console.warn("Kein YouTube-Link gefunden für:", spotifyUrl);
      return;
    }

    if (config.DEBUG) console.log(`[Playlist] Gefundene YouTube-URL: ${youtubeUrl}`);

    // Song-Objekt erstellen und zur Queue hinzufügen
    const song = await Song.from(youtubeUrl);
    if (!song) {
      if (config.DEBUG) console.warn(`[Playlist] Fehler beim Erstellen des Songs von YouTube-URL: ${youtubeUrl}`);
      console.warn("Fehler beim Erstellen des Songs von:", youtubeUrl);
      return;
    }

    let queue = bot.queues.get(interaction.guild!.id);
    if (!queue) {
      if (config.DEBUG) console.log("[Playlist] Erstelle neue MusicQueue in processOneSpotifySong.");
      queue = new MusicQueue({
        interaction,
        textChannel: interaction.channel as TextChannel,
        connection: joinVoiceChannel({
          channelId: voiceChannel.id,
          guildId: voiceChannel.guild.id,
          adapterCreator: voiceChannel.guild.voiceAdapterCreator as DiscordGatewayAdapterCreator,
        }),
      });
      bot.queues.set(interaction.guild!.id, queue);
    }

    queue.enqueue(song);

    if (!queue.isPlaying) {
      if (config.DEBUG) console.log("[Playlist] Starte die Wiedergabe der Warteschlange.");
      queue.play();
    }

    if (config.DEBUG) console.log(`[Playlist] Song hinzugefügt: ${song.title}`);
  } catch (error: any) {
    // Verschiedene Fehlermeldungen abfangen
    const errorMsg = (error && error.message) ? error.message : "";

    if (errorMsg.includes("Sign in to confirm your age")) {
      console.warn(`[Spotify-Song] Altersbeschränkung (Age Restriction) bei: ${spotifyUrl}`);
    } else if (errorMsg.includes("Video unavailable")) {
      console.warn(`[Spotify-Song] Video nicht verfügbar (Geo-/Blocking) bei: ${spotifyUrl}`);
    } else {
      // Generische Fehlermeldung
      console.error(`Fehler beim Spotify-Song ${spotifyUrl}`, error);
    }

    // Optional: Falls du im Debug-Modus doch den ganzen Stacktrace willst
    if (config.DEBUG) {
      console.error(`[Spotify-Song] Komplettes Error-Objekt:`, error);
    }
  }
}