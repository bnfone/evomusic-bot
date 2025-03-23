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
  spotifyPattern,
} from "../utils/patterns";
import { getSpotifyTracks } from "../utils/spotifyUtils";
import { processAppleMusicPlaylist } from "../utils/appleMusicUtils";
import { convertToYouTubeLink } from "../utils/platformUtils";
import { isSongBlacklisted } from "../utils/blacklist";

export default {
  data: new SlashCommandBuilder()
    .setName("playlist")
    .setDescription(i18n.__("playlist.description"))
    .addStringOption((option) =>
      option
        .setName("playlist")
        .setDescription(i18n.__("playlist.optionPlaylist"))
        .setRequired(true)
    )
    .addBooleanOption((option) =>
      option
        .setName("shuffle")
        .setDescription(i18n.__("playlist.optionShuffle"))
        .setRequired(false)
    ),
  cooldown: 5,
  permissions: [PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.Speak],

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();

    if (!interaction.guild) {
      await interaction.editReply(i18n.__("playlist.errorNoGuild"));
      return;
    }

    const argPlaylistUrl = interaction.options.getString("playlist") ?? "";
    const doShuffle = interaction.options.getBoolean("shuffle") ?? false;

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

    if (config.DEBUG) {
      console.log(`[Playlist] URL: ${argPlaylistUrl}`);
      console.log(`[Playlist] Shuffle direkt starten? ${doShuffle}`);
    }

    // --- SPOTIFY ---
    if (argPlaylistUrl.includes("spotify.com")) {
      try {
        if (config.DEBUG) console.log("[Playlist] -> Spotify erkannt.");

        const spotifyTrackUrls = await getSpotifyTracks(argPlaylistUrl);
        if (config.DEBUG) {
          console.log(`[Playlist] Anzahl gefundener Spotify-Links: ${spotifyTrackUrls.length}`);
        }

        if (spotifyTrackUrls.length === 0) {
          await interaction.editReply(i18n.__("playlist.errorSpotifyNoSongs"));
          return;
        }

        // 1) Erste zwei Songs synchron abarbeiten
        const firstTwo = spotifyTrackUrls.slice(0, 2);
        for (const spotifyUrl of firstTwo) {
          await processOneSpotifySong(interaction, spotifyUrl, channel);
        }

        // 2) Prüfen, ob Queue existiert und ob Songs drin sind
        const queue = bot.queues.get(interaction.guild.id);
        if (!queue || queue.songs.length === 0) {
          await interaction.followUp(i18n.__("playlist.errorQueueEmpty"));
          return;
        }

        // 3) Rest asynchron
        const remaining = spotifyTrackUrls.slice(2);
        for (const spotifyUrl of remaining) {
          processOneSpotifySong(interaction, spotifyUrl, channel).catch(console.error);
        }

        // 4) Falls Shuffle gewünscht, kleinen Timeout bevor gemischt wird
        if (doShuffle) {
          setTimeout(() => {
            if (queue.songs.length > 1) {
              queue.shuffle();
              interaction.followUp(i18n.__("playlist.shuffleEnabled"));
            }
          }, 2000);
        }

        await interaction.followUp(
          i18n.__mf("playlist.addedSpotifySongs", { count: spotifyTrackUrls.length })
        );

      } catch (error) {
        console.error("[Playlist] Fehler (Spotify):", error);
        await interaction.editReply(i18n.__("playlist.errorSpotifyGeneric"));
      }

    // --- APPLE MUSIC ---
    } else if (argPlaylistUrl.includes("music.apple.com")) {
      try {
        if (config.DEBUG) console.log("[Playlist] -> Apple Music erkannt.");
        await processAppleMusicPlaylist(argPlaylistUrl, interaction);

        // Shuffle erst nachdem processAppleMusicPlaylist() gestartet ist
        // => wir warten einige Sekunden, bis die Songs eingereiht sind
        if (doShuffle) {
          setTimeout(() => {
            const queue = bot.queues.get(interaction.guild!.id);
            if (queue && queue.songs.length > 1) {
              queue.shuffle();
              interaction.followUp(i18n.__("playlist.shuffleEnabled"));
            }
          }, 5000);
        }
      } catch (error) {
        console.error("[Playlist] Fehler (Apple Music):", error);
        await interaction.editReply(i18n.__("playlist.errorAppleGeneric"));
      }

    // --- YOUTUBE / ANDERE PLAYLIST ---
    } else {
      try {
        if (config.DEBUG) console.log("[Playlist] -> YouTube/Andere erkannt.");

        const playlist = await Playlist.from(argPlaylistUrl);
        if (!playlist?.videos?.length) {
          await interaction.editReply(i18n.__("playlist.errorYoutubeNoSongs"));
          return;
        }

        let queue = bot.queues.get(interaction.guild.id);
        if (!queue) {
          if (config.DEBUG) console.log("[Playlist] -> neue Queue erstellen");
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

        // Hier können wir direkt shufflen, weil wir synchron alle Songs haben
        if (doShuffle && queue.songs.length > 1) {
          queue.shuffle();
          await interaction.followUp(i18n.__("playlist.shuffleEnabled"));
        }

        await interaction.followUp(
          i18n.__mf("playlist.addedYoutubeSongs", { count: playlist.videos.length })
        );

      } catch (error) {
        console.error("[Playlist] Fehler (YouTube/Other):", error);
        await interaction.editReply(i18n.__("playlist.errorYoutubeGeneric"));
      }
    }
  },
};

// ------------------------------------------------
// HILFSFUNKTION FÜR EINEN SPOTIFY-TRACK
// ------------------------------------------------
async function processOneSpotifySong(
  interaction: ChatInputCommandInteraction,
  spotifyUrl: string,
  voiceChannel: VoiceChannel
): Promise<void> {
  try {
    if (config.DEBUG) console.log(`[Playlist] -> processOneSpotifySong: ${spotifyUrl}`);

    // 1) Spotify => YouTube
    const youtubeUrl = await convertToYouTubeLink(spotifyUrl);
    if (!youtubeUrl) {
      if (config.DEBUG) console.warn("[Playlist] -> Kein YouTube-Link gefunden");
      return;
    }

    // 2) Song-Objekt
    // 2) Song-Objekt
    const song = await Song.from(youtubeUrl);
    (song as any).requesterId = interaction.user.id; // Set requesterId here
    if (isSongBlacklisted(song.url)) {
      await interaction.editReply({ content: "This song is blacklisted and cannot be played." });
      return;
    }
    if (!song) {
      if (config.DEBUG) console.warn("[Playlist] -> Song.from() schlug fehl");
      return;
    }

    // 3) Queue anlegen oder holen
    let queue = bot.queues.get(interaction.guild!.id);
    if (!queue) {
      if (config.DEBUG) console.log("[Playlist] -> Neue Queue bei Spotify-Song erstellen");
      queue = new MusicQueue({
        interaction,
        textChannel: interaction.channel as TextChannel,
        connection: joinVoiceChannel({
          channelId: voiceChannel.id,
          guildId: voiceChannel.guild.id,
          adapterCreator: voiceChannel.guild
            .voiceAdapterCreator as DiscordGatewayAdapterCreator,
        }),
      });
      bot.queues.set(interaction.guild!.id, queue);
    }

    // 4) Song einreihen
    queue.enqueue(song);

    // 5) Falls nicht spielt, abspielen
    if (!queue.isPlaying) {
      if (config.DEBUG) console.log("[Playlist] -> Spiele Queue jetzt ab");
      queue.play();
    }

    if (config.DEBUG) console.log(`[Playlist] Song hinzugefügt: ${song.title}`);

  } catch (error: any) {
    const errorMsg = error?.message ?? "";

    // Verschiedene Fehlermeldungen
    if (errorMsg.includes("Sign in to confirm your age")) {
      console.warn(`[Spotify-Song] -> Altersbeschränkung bei: ${spotifyUrl}`);
    } else if (errorMsg.includes("Video unavailable")) {
      console.warn(`[Spotify-Song] -> Video gesperrt/geo-blocked: ${spotifyUrl}`);
    } else {
      console.error(`[Spotify-Song] -> Fehler: ${spotifyUrl}`, error);
    }

    if (config.DEBUG) {
      console.error("[Spotify-Song] -> Stacktrace:", error);
    }
  }
}