/********************************************
 * utils/appleMusicUtils.ts
 ********************************************/
import axios from "axios";
import { load } from "cheerio";
import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  TextChannel,
  GuildMember,
  VoiceChannel,
} from "discord.js";
import { bot } from "../index";
import { MusicQueue } from "../structs/MusicQueue";
import { Song } from "../structs/Song";
import { joinVoiceChannel, DiscordGatewayAdapterCreator } from "@discordjs/voice";
import fs from "fs";
import path from "path";

/**
 * Pfad zum Cache-File
 */
const CACHE_FILE_PATH = path.resolve(__dirname, "../cache.json");

/**
 * Lädt den Cache aus der Datei.
 */
function loadCache(): any {
  if (!fs.existsSync(CACHE_FILE_PATH)) {
    fs.writeFileSync(CACHE_FILE_PATH, JSON.stringify({}));
  }
  const rawData = fs.readFileSync(CACHE_FILE_PATH, "utf-8");
  return JSON.parse(rawData);
}

/**
 * Speichert den Cache in die Datei.
 */
function saveCache(cache: any): void {
  fs.writeFileSync(CACHE_FILE_PATH, JSON.stringify(cache, null, 2), "utf-8");
}

/**
 * Extrahiert die Song-ID aus einem Apple Music Link.
 */
function getSongId(appleMusicLink: string): string | null {
  //console.log(`Extrahiere Song ID aus dem Link: ${appleMusicLink}`);
  try {
    const parsedUrl = new URL(appleMusicLink);

    // Prüfen, ob die URL den Pfad "/song/" enthält
    if (parsedUrl.pathname.includes("song")) {
      const songId = parsedUrl.pathname.split("/").pop() || null;
      //console.log(`Extrahierte Song ID: ${songId}`);
      return songId;
    } else {
      // Fallback: ID aus Query-Parameter "i"
      const songId = parsedUrl.searchParams.get("i");
      //console.log(`Extrahierte alternative Song ID: ${songId}`);
      return songId;
    }
  } catch (error) {
    console.error(`Fehler beim Parsen der Apple-Music-URL: ${error}`);
    return null;
  }
}

/**
 * Ruft alle Apple-Music-Song-Links aus dem HTML einer Playlist ab.
 */
async function getLinks(url: string): Promise<string[]> {
  //console.log(`Abrufen der Links aus der Playlist-URL: ${url}`);
  try {
    const response = await axios.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      },
    });

    if (response.status !== 200) {
      console.error(
        `Unerwarteter Statuscode für ${url}: ${response.status} ${response.statusText}`
      );
      return [];
    }

    const html = response.data;
    if (typeof html !== "string") {
      console.error("Erhaltene Daten sind kein HTML-String:", typeof html);
      return [];
    }

    const $ = load(html);

    // Nach Meta-Tags mit property="music:song" suchen
    const appleLinks = $('meta[property="music:song"]').toArray();
    if (appleLinks.length === 0) {
      console.warn(
        "Keine <meta property='music:song'>-Tags gefunden. Struktur hat sich evtl. geändert."
      );
      return [];
    }

    const links = appleLinks.map((element) => $(element).attr("content") || "");
    console.log(`Gefundene Apple-Music-Links: ${links.join(", ")}`);
    return links;
  } catch (error) {
    console.error(`Fehler beim Anfordern der URL ${url}:`, error);
    return [];
  }
}

/**
 * Ruft die Odesli-API auf, um für eine Apple-Music-Song-ID alle relevanten Links (inkl. YouTube) zu erhalten.
 */
async function getOdesliLink(songId: string): Promise<string | null> {
  //console.log(`Abrufen des YouTube-Links für Apple-Song-ID: ${songId}`);
  const cache = loadCache();

  // Überprüfe, ob die Daten bereits im Cache vorhanden sind
  if (cache[songId] && cache[songId].youtubeUrl) {
    console.log(`YouTube-Link aus dem Cache: ${cache[songId].youtubeUrl}`);
    return cache[songId].youtubeUrl;
  }

  try {
    // Konstruiere die korrekte Anfrage an die Odesli-API
    const apiUrl = "https://api.song.link/v1-alpha.1/links";
    const params = {
      id: songId,
      platform: "appleMusic",
      type: "song",
    };

    const response = await axios.get(apiUrl, { params });

    // Überprüfe, ob die API gültige Daten liefert
    if (response.status === 200 && response.data?.linksByPlatform?.youtube) {
      const youtubeUrl = response.data.linksByPlatform.youtube.url;
      //console.log(`Gefundener YouTube-Link: ${youtubeUrl}`);

      // Aktualisiere den Cache
      cache[songId] = cache[songId] || {};
      cache[songId].youtubeUrl = youtubeUrl;
      saveCache(cache);

      return youtubeUrl;
    }

    console.warn(`Kein YouTube-Link gefunden für Song-ID ${songId}.`);
    return null;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error(
        `Fehler beim Abrufen des Odesli-Links für Song-ID ${songId}:`,
        error.response?.data || error.message
      );
    } else {
      console.error(`Unbekannter Fehler beim Abrufen des Odesli-Links:`, error);
    }
    return null;
  }
}

/**
 * Verarbeitet eine komplette Apple Music Playlist.
 */
export async function processAppleMusicPlaylist(
  url: string,
  interaction: ChatInputCommandInteraction
): Promise<void> {
  // Schritt 1: Playlist abrufen
  const links = await getLinks(url).catch((error) => {
    console.error(`Fehler beim Abrufen der Links für ${url}:`, error);
    return [];
  });

  if (!links || links.length === 0) {
    await sendEmptyPlaylistMessage(interaction, url);
    return;
  }

  // Schritt 2: Nachricht an den Benutzer senden, dass die Playlist verarbeitet wird
  await interaction.editReply({
    content: `🎵 Playlist erkannt! Verarbeite **${links.length} Songs**...`,
  });

  // Schritt 3: Starte die Wiedergabe mit dem ersten Song sofort
  try {
    const firstSongLink = links[0];
    await processSong(firstSongLink, 0, interaction);

    // Nachricht senden, dass die Wiedergabe gestartet wurde
    await interaction.followUp({
      content: `✅ Die Wiedergabe wurde gestartet! Die restlichen Songs werden verarbeitet.`,
    });

    // Restliche Songs parallel verarbeiten
    const remainingSongs = links.slice(1);
    remainingSongs.forEach(async (link, index) => {
      try {
        await processSong(link, index + 1, interaction);
      } catch (err) {
        console.error(
          `Fehler beim Verarbeiten des Songs an Position ${index + 1}:`,
          err
        );
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
 * Verarbeitet einen einzelnen Song-Link.
 */
async function processSong(
  link: string,
  index: number,
  interaction: ChatInputCommandInteraction
): Promise<void> {
  const songId = getSongId(link);
  if (!songId) {
    console.warn(`Keine Song-ID für Link ${link} gefunden. Überspringe...`);
    return;
  }

  const youtubeUrl = await getOdesliLink(songId);
  if (!youtubeUrl) {
    console.warn(`Kein YouTube-Link für Song-ID ${songId}. Überspringe...`);
    await interaction.followUp({
      content: `⚠️ Song-ID **${songId}** konnte nicht in einen YouTube-Link umgewandelt werden. Überspringe...`,
    });
    return;
  }

  try {
    const song = await Song.from(youtubeUrl, youtubeUrl);
    if (!interaction.guild) return;

    let queue = bot.queues.get(interaction.guild.id);

    if (
      !(interaction.member instanceof GuildMember) ||
      !interaction.member.voice.channel
    ) {
      console.warn("Nutzer ist nicht in einem Voice-Channel. Breche ab.");
      return;
    }

    if (!queue) {
      const channel = interaction.member.voice.channel as VoiceChannel;
      queue = new MusicQueue({
        interaction,
        textChannel: interaction.channel as TextChannel,
        connection: joinVoiceChannel({
          channelId: channel.id,
          guildId: interaction.guild.id,
          adapterCreator: channel.guild
            .voiceAdapterCreator as DiscordGatewayAdapterCreator,
        }),
      });
      bot.queues.set(interaction.guild.id, queue);
    }

    queue.enqueue(song);

    if ("play" in queue) {
      if (index < 2 || !queue.isPlaying) {
        queue.play();
      }
    }
  } catch (error) {
    if (error instanceof Error) {
      // Spezifische Behandlung von "Video unavailable"
      if (error.message.includes("Video unavailable")) {
        console.error(`Video nicht verfügbar für Song ${link}. Überspringe...`);
        await interaction.followUp({
          content: `❌ Das YouTube-Video für den Song **${link}** ist nicht verfügbar. Überspringe...`,
        });
      } else {
        console.error(`Fehler beim Verarbeiten des Songs ${link}: ${error.message}`);
        await interaction.followUp({
          content: `⚠️ Ein Fehler ist beim Verarbeiten des Songs **${link}** aufgetreten: ${error.message}. Überspringe...`,
        });
      }
    } else {
      console.error(`Unbekannter Fehler beim Verarbeiten des Songs ${link}:`, error);
      await interaction.followUp({
        content: `⚠️ Ein unbekannter Fehler ist beim Verarbeiten des Songs **${link}** aufgetreten. Überspringe...`,
      });
    }
  }
}