// File: commands/playlist.ts

import {
  DiscordGatewayAdapterCreator,
  joinVoiceChannel
} from "@discordjs/voice";
import {
  ChatInputCommandInteraction,
  PermissionsBitField,
  SlashCommandBuilder,
  TextChannel,
  VoiceChannel
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
import {
  getAppleMusicPlaylistData
} from "../utils/applemusic";
import { convertToYouTubeLink } from "../utils/platform";
import { isSongBlacklisted } from "../utils/blacklist";
import { getSpotifyPlaylistTracks } from "../utils/spotify";
import { logPlaylistRequested } from "../utils/stats";
// <-- Default‑Import
import logger from "../utils/logger";
import { scheduleShuffle } from "../utils/playlistHelper";

async function fetchTrackSourceList(
  url: string,
  userId: string
): Promise<string[]> {
  if (spotifyPattern.test(url)) {
    logger.info(`[Playlist] Spotify playlist detected: ${url}`);
    const tracks = await getSpotifyPlaylistTracks(url);
    await logPlaylistRequested(userId, url);
    return tracks;
  }

  if (appleMusicPattern.test(url)) {
    logger.info(`[Playlist] Apple Music playlist detected: ${url}`);
    const data = await getAppleMusicPlaylistData(url);
    await logPlaylistRequested(userId, url);
    return data.songs.map((s) => s.url);
  }

  if (playlistPattern.test(url)) {
    logger.info(`[Playlist] YouTube playlist detected: ${url}`);
    const pl = await Playlist.from(url);
    return pl.videos.map((v) => v.url);
  }

  throw new Error(i18n.__("playlist.errorInvalidUrl"));
}

export default {
  data: new SlashCommandBuilder()
    .setName("playlist")
    .setDescription(i18n.__("playlist.description"))
    .addStringOption((opt) =>
      opt
        .setName("playlist")
        .setDescription(i18n.__("playlist.optionPlaylist"))
        .setRequired(true)
    )
    .addBooleanOption((opt) =>
      opt
        .setName("shuffle")
        .setDescription(i18n.__("playlist.optionShuffle"))
    ),
  cooldown: 5,
  permissions: [
    PermissionsBitField.Flags.Connect,
    PermissionsBitField.Flags.Speak
  ],

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply().catch((e) => logger.error(`Error deferring reply`, e));

    if (!interaction.guild) {
      return interaction
        .editReply(i18n.__("playlist.errorNoGuild"))
        .catch((e) => logger.error(`Error editing reply`, e));
    }

    const url = interaction.options.getString("playlist", true);
    const doShuffle = interaction.options.getBoolean("shuffle") ?? false;

    const member = interaction.guild.members.cache.get(interaction.user.id);
    const voiceChannel =
      member?.voice.channel instanceof VoiceChannel
        ? member.voice.channel
        : null;
    if (!voiceChannel) {
      return interaction
        .editReply(i18n.__("playlist.errorNotChannel"))
        .catch((e) => logger.error(`Error editing reply`, e));
    }

    try {
      const sources = await fetchTrackSourceList(url, interaction.user.id);
      if (sources.length === 0) {
        return interaction
          .editReply(i18n.__("playlist.errorNoSongs"))
          .catch((e) => logger.error(`Error editing reply`, e));
      }

      const guildId = interaction.guild.id;
      let queue = bot.queues.get(guildId);
      if (!queue) {
        queue = new MusicQueue({
          interaction,
          textChannel: interaction.channel! as TextChannel,
          connection: joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId,
            adapterCreator:
              voiceChannel.guild
                .voiceAdapterCreator as DiscordGatewayAdapterCreator
          })
        });
        bot.queues.set(guildId, queue);
      }

      const firstSource = sources.shift()!;
      let firstPlayable = firstSource;

      if (appleMusicPattern.test(url)) {
        try {
          const yt = await convertToYouTubeLink(firstSource);
          firstPlayable = yt || firstSource;
        } catch (e) {
          logger.error(`[Playlist] First conversion failed for ${firstSource}`, e as Error);
        }
      }

      try {
        const firstSong = await Song.from(firstPlayable, firstPlayable);
        if (!isSongBlacklisted(firstSong.url)) {
          queue.enqueue(firstSong);
        }
      } catch (e) {
        logger.error(`[Playlist] Error enqueueing first track`, e as Error);
      }

      await interaction
        .editReply(i18n.__mf("play.startedPlaying", { title: queue.songs[0]?.title ?? "Unknown" }))
        .catch((e) => logger.error(`Error editing reply`, e));

      (async () => {
        for (const src of sources) {
          let playable = src;
          if (appleMusicPattern.test(url)) {
            try {
              const yt = await convertToYouTubeLink(src);
              playable = yt || src;
            } catch (e) {
              logger.error(`[Playlist] Conversion failed for ${src}`, e as Error);
              continue;
            }
          }

          try {
            const song = await Song.from(playable, playable);
            if (!isSongBlacklisted(song.url)) queue.enqueue(song);
          } catch (e) {
            logger.error(`[Playlist] Error enqueueing ${playable}`, e as Error);
          }
        }

        if (doShuffle) scheduleShuffle(queue!);
      })().catch((e) => logger.error(`[Playlist] Background processing error`, e as Error));
    } catch (err) {
      logger.error("[Playlist] Processing error:", err as Error);
      await interaction
        .editReply(i18n.__("playlist.errorGeneric"))
        .catch((e) => logger.error(`Error editing reply`, e));
    }
  }
};
