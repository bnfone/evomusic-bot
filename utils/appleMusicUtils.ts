/********************************************
 * utils/appleMusicUtils.ts
 ********************************************/
import { load } from "cheerio";
import axios from "axios";
import { config } from "./config";
import { getOdesliLink } from "./odesliUtils";
import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  GuildMember,
  VoiceChannel,
  TextChannel
} from "discord.js";

import { joinVoiceChannel, DiscordGatewayAdapterCreator } from "@discordjs/voice";
import { Song } from "../structs/Song";
import { MusicQueue } from "../structs/MusicQueue";
import { bot } from "../index";

/**
 * Extrahiert alle Song-Links (Apple Music Song-URLs) aus dem HTML einer Playlist.
 */
export async function getAppleMusicLinks(playlistUrl: string): Promise<string[]> {
  if (config.DEBUG) {
    console.log(`[AppleMusic] Starte Parsing der Playlist: ${playlistUrl}`);
  }

  try {
    const { data: html } = await axios.get<string>(playlistUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      },
    });

    const $ = load(html);
    const metaTags = $('meta[property="music:song"]').toArray();
    const links = metaTags.map((el) => $(el).attr("content") || "").filter(Boolean);

    if (config.DEBUG) {
      console.log(`[AppleMusic] Gefundene Links: ${JSON.stringify(links, null, 2)}`);
    }

    return links;
  } catch (error) {
    console.error("[AppleMusic] Fehler beim Abrufen der Playlist-URL:", error);
    return [];
  }
}

/**
 * Konvertiert eine Apple-Music-Song-URL direkt in eine YouTube-URL via Odesli.
 */
export async function appleMusicSongToYoutube(appleMusicLink: string): Promise<string | null> {
  // Übergebe den vollständigen Link an Odesli
  const odesliUrl = await getOdesliLink(appleMusicLink);
  return odesliUrl; // Kann direkt die YouTube-URL sein
}

/**
 * Verarbeitet eine komplette Apple Music Playlist.
 */
export async function processAppleMusicPlaylist(
  url: string,
  interaction: ChatInputCommandInteraction
): Promise<void> {
  const links = await getAppleMusicLinks(url).catch((error) => {
    console.error(`Fehler beim Abrufen der Links für ${url}:`, error);
    return [];
  });

  if (!links || links.length === 0) {
    await sendEmptyPlaylistMessage(interaction, url);
    return;
  }

  // Nachricht an den Benutzer senden, dass die Playlist erkannt wurde
  await interaction.editReply({
    content: `🎵 Playlist erkannt! Verarbeite **${links.length} Songs**...`,
  });

  try {
    // Ersten Song synchron
    const firstSongLink = links[0];
    await processSong(firstSongLink, 0, interaction);

    // Nachricht senden, dass die Wiedergabe gestartet wurde
    await interaction.followUp({
      content: `✅ Die Wiedergabe wurde gestartet! Die restlichen Songs werden verarbeitet.`,
    });

    // Restliche Songs asynchron verarbeiten
    const remainingSongs = links.slice(1);
    remainingSongs.forEach(async (link, index) => {
      try {
        await processSong(link, index + 1, interaction);
      } catch (err) {
        console.error(`Fehler beim Verarbeiten des Songs an Position ${index + 1}:`, err);
      }
    });
  } catch (error) {
    if (error instanceof Error) {
      console.error(`Fehler beim Verarbeiten der Playlist: ${error.message}`);
    } else {
      console.error(`Unbekannter Fehler beim Verarbeiten der Playlist:`, error);
    }
  }
}

/**
 * Sendet eine Nachricht, wenn keine Songs gefunden wurden.
 */
async function sendEmptyPlaylistMessage(
  interaction: ChatInputCommandInteraction,
  url: string
) {
  const playlistEmbed = new EmbedBuilder()
    .setTitle(url)
    .setDescription("Keine Lieder in der Playlist gefunden.")
    .setColor("#F8AA2A")
    .setTimestamp();

  await interaction.editReply({
    content: "Die Playlist wurde verarbeitet, aber es wurden keine Songs gefunden.",
    embeds: [playlistEmbed],
  });
}

/**
 * Verarbeitet einen einzelnen Apple-Music-Song-Link (ganze URL).
 * Holt den entsprechenden YouTube-Link via Odesli.
 */
async function processSong(
  appleMusicLink: string,
  index: number,
  interaction: ChatInputCommandInteraction
): Promise<void> {
  // 1) Vollständigen Apple-Music-Link an Odesli geben
  const youtubeUrl = await getOdesliLink(appleMusicLink);

  if (!youtubeUrl) {
    console.warn(`Kein YouTube-Link für AppleMusic-Link: ${appleMusicLink}. Überspringe...`);
    await interaction.followUp({
      content: `⚠️ **${appleMusicLink}** konnte nicht in einen YouTube-Link umgewandelt werden. Überspringe...`,
    });
    return;
  }

  try {
    // 2) Song-Objekt erstellen
    const song = await Song.from(youtubeUrl, youtubeUrl);
    if (!interaction.guild) return;

    let queue = bot.queues.get(interaction.guild.id);
    const member = interaction.member as GuildMember;

    // 3) Member-Check
    if (!member.voice.channel) {
      console.warn("Nutzer ist nicht in einem Voice-Channel. Breche ab.");
      return;
    }

    // 4) Falls keine Queue existiert => Neue erstellen
    if (!queue) {
      const channel = member.voice.channel as VoiceChannel;
      queue = new MusicQueue({
        interaction,
        textChannel: interaction.channel as TextChannel,
        connection: joinVoiceChannel({
          channelId: channel.id,
          guildId: interaction.guild.id,
          adapterCreator: channel.guild.voiceAdapterCreator as DiscordGatewayAdapterCreator,
        }),
      });
      bot.queues.set(interaction.guild.id, queue);
    }

    // 5) Song in die Queue stecken
    queue.enqueue(song);

    // 6) Falls Queue noch nicht spielt oder wir am Anfang sind: play()
    if ("play" in queue) {
      if (index < 2 || !queue.isPlaying) {
        queue.play();
      }
    }
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes("Video unavailable")) {
        console.error(`Video nicht verfügbar für Song: ${appleMusicLink}. Überspringe...`);
        await interaction.followUp({
          content: `❌ Das YouTube-Video für den Song **${appleMusicLink}** ist nicht verfügbar. Überspringe...`,
        });
      } else {
        console.error(`Fehler beim Verarbeiten des Songs ${appleMusicLink}: ${error.message}`);
        await interaction.followUp({
          content: `⚠️ Ein Fehler ist beim Verarbeiten von **${appleMusicLink}** aufgetreten: ${error.message}. Überspringe...`,
        });
      }
    } else {
      console.error(`Unbekannter Fehler beim Verarbeiten des Songs: ${appleMusicLink}`, error);
      await interaction.followUp({
        content: `⚠️ Ein unbekannter Fehler ist beim Verarbeiten von **${appleMusicLink}** aufgetreten. Überspringe...`,
      });
    }
  }
}