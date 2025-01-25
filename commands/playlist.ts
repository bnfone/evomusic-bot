/********************************************
 * commands/playlist.ts
 ********************************************/
import {
  DiscordGatewayAdapterCreator,
  joinVoiceChannel,
} from "@discordjs/voice";
import {
  ChatInputCommandInteraction,
  EmbedBuilder,
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
import { processAppleMusicPlaylist } from "../utils/appleMusicUtils";
import { Config } from "../interfaces/Config";  // falls du das brauchst
import { config } from "../utils/config";       // falls du das brauchst

import axios from "axios";
import {
  getOdesliDataWithCache,
  getYouTubeLinkFromOdesliData,
} from "../utils/musicLinkConverter"; // <-- Neu importiert

// Falls du die Spotify-Client-Daten brauchst:
const spotifyClientId = config.SPOTIFY_CLIENT_ID;
const spotifyClientSecret = config.SPOTIFY_CLIENT_SECRET;

async function getSpotifyAccessToken(): Promise<string> {
  const tokenResponse = await axios.post(
    "https://accounts.spotify.com/api/token",
    "grant_type=client_credentials",
    {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(
          spotifyClientId + ":" + spotifyClientSecret
        ).toString("base64")}`,
      },
    }
  );
  return tokenResponse.data.access_token;
}

async function extractSongDetailsFromSpotifyPlaylist(
  playlistUrl: string,
  accessToken: string
): Promise<{ title: string; artist: string; spotifyUrl: string }[]> {
  const playlistId = playlistUrl.split("/").pop()?.split("?")[0];
  if (!playlistId) return [];
  const headers = { Authorization: `Bearer ${accessToken}` };
  const response = await axios.get(
    `https://api.spotify.com/v1/playlists/${playlistId}/tracks`,
    { headers }
  );
  const items = response.data.items;

  return items.map((item: any) => {
    const track = item.track;
    return {
      title: track.name,
      artist: track.artists.map((a: any) => a.name).join(", "),
      spotifyUrl: track.external_urls.spotify,
    };
  });
}

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

    if (argPlaylistUrl.includes("spotify.com")) {
      // Spotify
      const accessToken = await getSpotifyAccessToken();
      const spotifySongDetails = await extractSongDetailsFromSpotifyPlaylist(
        argPlaylistUrl,
        accessToken
      );

      // Ersten Song "synchron" abarbeiten
      if (spotifySongDetails.length === 0) {
        await interaction.editReply("Keine Spotify-Songs gefunden.");
        return;
      }

      // Warte auf die ersten 2 Songs, füge sie der Queue hinzu
      const firstTwo = spotifySongDetails.slice(0, 2);
      for (const detail of firstTwo) {
        await processOneSpotifySong(interaction, detail, channel);
      }

      // Prüfe, ob schon was in der Queue liegt
      const queue = bot.queues.get(interaction.guild.id);
      if (!queue || queue.songs.length === 0) {
        await interaction.followUp({
          content: "Keine Songs konnten zur Warteschlange hinzugefügt werden.",
        });
        return;
      }

      // Rest asynchron
      const remaining = spotifySongDetails.slice(2);
      for (const detail of remaining) {
        processOneSpotifySong(interaction, detail, channel).catch(console.error);
      }

      await interaction.followUp(
        `Füge **${spotifySongDetails.length}** Spotify-Songs hinzu ...`
      );
    } else if (argPlaylistUrl.includes("music.apple.com")) {
      // Apple-Music-Playlist
      await processAppleMusicPlaylist(argPlaylistUrl, interaction);
    } else {
      // Evtl. noch YouTube-Playlist, Deezer usw.
      // -> Da existiert vermutlich schon Code, z.B. "Playlist.from(...)"
      const playlist = await Playlist.from(argPlaylistUrl);
      if (!playlist?.videos?.length) {
        await interaction.editReply("Keine Songs in der YouTube-Playlist gefunden");
        return;
      }

      let queue = bot.queues.get(interaction.guild.id);
      if (!queue) {
        queue = new MusicQueue({
          interaction,
          textChannel: interaction.channel as TextChannel,
          connection: joinVoiceChannel({
            channelId: channel.id,
            guildId: channel.guild.id,
            adapterCreator: channel.guild
              .voiceAdapterCreator as DiscordGatewayAdapterCreator,
          }),
        });
        bot.queues.set(interaction.guild.id, queue);
      }
      queue.enqueue(...playlist.videos);
      await interaction.followUp(
        `YouTube-Playlist mit **${playlist.videos.length}** Songs hinzugefügt!`
      );
    }
  },
};

/**
 * Verarbeitet einen einzigen Spotify-Track-Eintrag (Titel, Artist, spotifyUrl).
 * Sucht den YouTube-Link via getOdesliDataWithCache() + getYouTubeLinkFromOdesliData().
 */
async function processOneSpotifySong(
  interaction: ChatInputCommandInteraction,
  detail: { title: string; artist: string; spotifyUrl: string },
  voiceChannel: VoiceChannel
) {
  try {
    // 1) Odesli-Daten holen (cachebasiert)
    const data = await getOdesliDataWithCache(detail.spotifyUrl);
    if (!data) {
      console.warn("Keine Odesli-Daten empfangen für:", detail.spotifyUrl);
      return;
    }

    // 2) YouTube-Link extrahieren
    const youtubeLink = getYouTubeLinkFromOdesliData(data);
    if (!youtubeLink) {
      console.warn("Kein YouTube-Link gefunden für:", detail.spotifyUrl);
      return;
    }

    // 3) Song-Objekt erstellen und zur Queue hinzufügen
    const song = new Song({
      title: `${detail.title} - ${detail.artist}`,
      url: youtubeLink,
      duration: 0, // Optional, falls du es später aus ytdl etc. holst
    });

    let queue = bot.queues.get(interaction.guild!.id);
    if (!queue) {
      queue = new MusicQueue({
        interaction,
        textChannel: interaction.channel as TextChannel,
        connection: joinVoiceChannel({
          channelId: voiceChannel.id,
          guildId: voiceChannel.guild.id,
          adapterCreator:
            voiceChannel.guild
              .voiceAdapterCreator as DiscordGatewayAdapterCreator,
        }),
      });
      bot.queues.set(interaction.guild!.id, queue);
    }

    queue.enqueue(song);
  } catch (error) {
    console.error(`Fehler beim Spotify-Song ${detail.title}`, error);
  }
}