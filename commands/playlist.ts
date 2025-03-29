/********************************************
 * commands/playlist.ts
 *
 * This command handles the /playlist functionality.
 * It accepts a playlist URL from Spotify, Apple Music, or YouTube/Other sources,
 * processes the playlist accordingly, and enqueues all songs into the music queue.
 *
 * For Spotify playlists, it uses the helper function getSpotifyPlaylistTracks (now in utils/spotify.ts)
 * to retrieve track URLs from the Spotify API. Each track is then processed via processOneSpotifySong().
 *
 * For Apple Music playlists, it uses getAppleMusicPlaylistData to extract the playlist data and then
 * converts each song URL to a YouTube URL before enqueuing.
 *
 * For YouTube/Other playlists, the Playlist struct is used to extract video data.
 *
 * Detailed logging, error handling, and an optional shuffle feature are implemented.
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
import { getAppleMusicPlaylistData } from "../utils/applemusic";
import { convertToYouTubeLink } from "../utils/platform";
import { isSongBlacklisted } from "../utils/blacklist";
import { log, error as logError } from "../utils/logger";
import { getSpotifyPlaylistTracks } from "../utils/spotify"; // Import the helper from utils/spotify
import { getSpotifyAccessToken } from "../utils/spotify"; // In case needed for additional processing
import axios from "axios"; // Only needed in spotify helper which is now in utils/spotify
import { logPlaylistRequested } from "../utils/stats";

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
    // Defer the reply since processing may take some time.
    await interaction.deferReply();

    if (!interaction.guild) {
      await interaction.editReply(i18n.__("playlist.errorNoGuild"));
      return;
    }

    // Retrieve the playlist URL and optional shuffle flag.
    const argPlaylistUrl = interaction.options.getString("playlist") ?? "";
    const doShuffle = interaction.options.getBoolean("shuffle") ?? false;

    // Get the member who invoked the command and check their voice channel.
    const guildMember = interaction.guild.members.cache.get(interaction.user.id);
    const channel =
      guildMember?.voice.channel instanceof VoiceChannel
        ? guildMember.voice.channel
        : null;
    if (!channel) {
      await interaction.editReply({ content: i18n.__("playlist.errorNotChannel") });
      return;
    }

    if (config.DEBUG) {
      log(`[Playlist] Received playlist URL: ${argPlaylistUrl}`);
      log(`[Playlist] Shuffle option: ${doShuffle}`);
    }

    // --- Handling Spotify Playlists ---
    if (argPlaylistUrl.includes("spotify.com")) {
      try {
        log("[Playlist] Detected Spotify playlist URL.");
        const spotifyTrackUrls = await getSpotifyPlaylistTracks(argPlaylistUrl);
        log(`[Playlist] Found ${spotifyTrackUrls.length} Spotify track(s).`);
      
        if (spotifyTrackUrls.length === 0) {
          await interaction.editReply(i18n.__("playlist.errorSpotifyNoSongs"));
          return;
        }
        // Log that the playlist was requested.
        await logPlaylistRequested(interaction.user.id, argPlaylistUrl);

        // Process the first two songs synchronously to kick off playback quickly.
        const firstTwo = spotifyTrackUrls.slice(0, 2);
        for (const spotifyUrl of firstTwo) {
          await processOneSpotifySong(interaction, spotifyUrl, channel);
        }

        // Ensure that a queue exists and contains songs.
        const queue = bot.queues.get(interaction.guild.id);
        if (!queue || queue.songs.length === 0) {
          await interaction.followUp(i18n.__("playlist.errorQueueEmpty"));
          return;
        }

        // Process remaining Spotify tracks asynchronously.
        const remaining = spotifyTrackUrls.slice(2);
        for (const spotifyUrl of remaining) {
          processOneSpotifySong(interaction, spotifyUrl, channel).catch(logError);
        }

        // If shuffling is requested, wait briefly before shuffling.
        if (doShuffle) {
          setTimeout(() => {
            const currentQueue = bot.queues.get(interaction.guild!.id);
            if (currentQueue && currentQueue.songs.length > 1) {
              currentQueue.shuffle();
              interaction.followUp(i18n.__("playlist.shuffleEnabled"));
            }
          }, 2000);
        }

        await interaction.followUp(
          i18n.__mf("playlist.addedSpotifySongs", { count: spotifyTrackUrls.length })
        );
      } catch (error) {
        logError("[Playlist] Error processing Spotify playlist:", error as Error);
        await interaction.editReply(i18n.__("playlist.errorSpotifyGeneric"));
      }

    // --- Handling Apple Music Playlists ---
    } else if (argPlaylistUrl.includes("music.apple.com")) {
      try {
        log("[Playlist] Detected Apple Music playlist URL.");
        const appleData = await getAppleMusicPlaylistData(argPlaylistUrl);
        if (appleData.songs.length === 0) {
          await interaction.editReply(i18n.__("playlist.errorAppleNoSongs"));
          return;
        }
        // Log that the playlist was requested.
        // (Ensure logPlaylistRequested is imported from your stats module.)
        await logPlaylistRequested(interaction.user.id, argPlaylistUrl);
      
        // Process each song from the Apple Music playlist...
        for (const songData of appleData.songs) {
          const youtubeUrl = await convertToYouTubeLink(songData.url);
          if (!youtubeUrl) continue;
          try {
            const song = await Song.from(youtubeUrl, songData.title);
            (song as any).requesterId = interaction.user.id;
            if (isSongBlacklisted(song.url)) continue;
            let queue = bot.queues.get(interaction.guild.id);
            if (!queue) {
              log("[Playlist] Creating new MusicQueue for Apple Music playlist.");
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
            queue.enqueue(song);
          } catch (songError) {
            logError("[Playlist] Error processing a song from Apple Music playlist:", songError as Error);
          }
        }

        // If shuffling is requested, wait briefly before shuffling.
        if (doShuffle) {
          setTimeout(() => {
            const queue = bot.queues.get(interaction.guild!.id);
            if (queue && queue.songs.length > 1) {
              queue.shuffle();
              interaction.followUp(i18n.__("playlist.shuffleEnabled"));
            }
          }, 5000);
        }
        await interaction.followUp(
          i18n.__mf("playlist.addedAppleSongs", { count: appleData.songs.length })
        );
      } catch (error) {
        logError("[Playlist] Error processing Apple Music playlist:", error as Error);
        await interaction.editReply(i18n.__("playlist.errorAppleGeneric"));
      }

    // --- Handling YouTube/Other Playlists ---
    } else {
      try {
        log("[Playlist] Detected YouTube/Other playlist URL.");
        const playlist = await Playlist.from(argPlaylistUrl);
        if (!playlist?.videos?.length) {
          await interaction.editReply(i18n.__("playlist.errorYoutubeNoSongs"));
          return;
        }

        let queue = bot.queues.get(interaction.guild.id);
        if (!queue) {
          log("[Playlist] Creating a new MusicQueue for YouTube/Other playlist.");
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

        if (doShuffle && queue.songs.length > 1) {
          queue.shuffle();
          await interaction.followUp(i18n.__("playlist.shuffleEnabled"));
        }

        await interaction.followUp(
          i18n.__mf("playlist.addedYoutubeSongs", { count: playlist.videos.length })
        );
      } catch (error) {
        logError("[Playlist] Error processing YouTube/Other playlist:", error as Error);
        await interaction.editReply(i18n.__("playlist.errorYoutubeGeneric"));
      }
    }
  },
};

// ------------------------------------------------
// HELPER FUNCTION: Process a single Spotify track
// ------------------------------------------------

/**
 * Processes a single Spotify track:
 * 1. Converts the Spotify track URL to a YouTube URL.
 * 2. Creates a Song object from the YouTube URL.
 * 3. Enqueues the Song in the MusicQueue.
 *
 * @param interaction - The command interaction.
 * @param spotifyUrl - The Spotify track URL.
 * @param voiceChannel - The voice channel of the user.
 */
async function processOneSpotifySong(
  interaction: ChatInputCommandInteraction,
  spotifyUrl: string,
  voiceChannel: VoiceChannel
): Promise<void> {
  try {
    log(`[Playlist] Processing Spotify track: ${spotifyUrl}`);

    // Convert the Spotify URL to a YouTube URL using the platform conversion logic.
    const youtubeUrl = await convertToYouTubeLink(spotifyUrl);
    if (!youtubeUrl) {
      log("[Playlist] No YouTube link found for the given Spotify URL.");
      return;
    }

    // Create a Song object from the YouTube URL.
    const song = await Song.from(youtubeUrl);
    (song as any).requesterId = interaction.user.id; // Set the requester ID.
    if (isSongBlacklisted(song.url)) {
      await interaction.editReply({ content: "This song is blacklisted and cannot be played." });
      return;
    }
    if (!song) {
      log("[Playlist] Song.from() failed to create a Song object.");
      return;
    }

    // Retrieve or create the music queue.
    let queue = bot.queues.get(interaction.guild!.id);
    if (!queue) {
      log("[Playlist] Creating a new MusicQueue for the Spotify track.");
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

    // Enqueue the song.
    queue.enqueue(song);

    // If playback is not already in progress, start it.
    if (!queue.isPlaying) {
      log("[Playlist] Starting playback for the newly updated queue.");
      queue.play();
    }

    log(`[Playlist] Successfully added song: ${song.title}`);
  } catch (error: any) {
    const errorMsg = error?.message ?? "";
    if (errorMsg.includes("Sign in to confirm your age")) {
      log(`[Playlist] Age restriction encountered for Spotify URL: ${spotifyUrl}`);
    } else if (errorMsg.includes("Video unavailable")) {
      log(`[Playlist] Video unavailable or geo-blocked for Spotify URL: ${spotifyUrl}`);
    } else {
      logError(`[Playlist] Error processing Spotify track: ${spotifyUrl}`, error as Error);
    }
    if (config.DEBUG) {
      console.error("[Playlist] Stacktrace:", error);
    }
  }
}