import axios from "axios";
import { load } from "cheerio"; // <--- WICHTIG: der empfohlene Import bei neueren Cheerio-Versionen
import { Song } from "../structs/Song";
import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  TextChannel,
  GuildMember,
} from "discord.js";
import { bot } from "../index";
import { MusicQueue } from "../structs/MusicQueue";
import { joinVoiceChannel, DiscordGatewayAdapterCreator } from "@discordjs/voice";

/**
 * Extrahiert die Song-ID aus einem Apple Music Link.
 */
function getSongId(appleMusicLink: string): string | null {
  console.log(`Extrahiere Song ID aus dem Link: ${appleMusicLink}`);
  try {
    const parsedUrl = new URL(appleMusicLink);

    // Prüfen, ob die URL den Pfad "/song/" enthält
    if (parsedUrl.pathname.includes("song")) {
      const songId = parsedUrl.pathname.split("/").pop() || null;
      console.log(`Extrahierte Song ID: ${songId}`);
      return songId;
    } else {
      // Fallback: ID aus Query-Parameter "i"
      const songId = parsedUrl.searchParams.get("i");
      console.log(`Extrahierte alternative Song ID: ${songId}`);
      return songId;
    }
  } catch (error) {
    console.error(`Fehler beim Parsen der Apple-Music-URL: ${error}`);
    return null;
  }
}

/**
 * Ruft alle Apple-Music-Song-Links aus der Playlist-HTML ab.
 */
async function getLinks(url: string): Promise<string[]> {
  console.log(`Abrufen der Links aus der Playlist-URL: ${url}`);
  let response;

  try {
    // Setze einen User-Agent, damit Apple Music nicht eine Fehlerseite liefert:
    response = await axios.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      },
    });
  } catch (error) {
    console.error(`Fehler beim Anfordern der URL ${url}:`, error);
    return [];
  }

  if (response.status !== 200) {
    console.error(
      `Unerwarteter Statuscode für ${url}: ${response.status} ${response.statusText}`
    );
    return [];
  }

  const html = response.data;
  if (!html) {
    console.error("Keine HTML-Daten empfangen.");
    return [];
  }

  // Zusätzliche Debug-Ausgabe, um sicherzugehen, dass wir hier wirklich HTML haben
  if (typeof html !== "string") {
    console.error("Erhaltene Daten sind kein HTML-String:", typeof html);
    return [];
  }

  // Neuer Import -> load(html) statt cheerio.load(html)
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
}

/**
 * Nutzt die Odesli API, um für eine Apple Music Song-ID
 * eine (mögliche) YouTube-URL zu bekommen.
 */
async function getOdesliLink(songId: string): Promise<string | null> {
  console.log(`Abrufen des YouTube-Links für Song ID: ${songId}`);
  if (!songId) {
    console.log("Song ID ist null, überspringe die Anfrage.");
    return null;
  }

  try {
    const apiUrl = `https://api.song.link/v1-alpha.1/links?id=${songId}&platform=appleMusic&type=song`;
    const response = await axios.get(apiUrl);

    if (response.status === 200 && response.data) {
      const data = response.data;
      if (!data.linksByPlatform?.youtube) {
        console.warn(
          `Kein YouTube-Link für Song ID ${songId} gefunden (linksByPlatform.youtube fehlt).`
        );
        return null;
      }
      const youtubeUrl = data.linksByPlatform.youtube?.url || null;
      console.log(`Gefundener YouTube-Link: ${youtubeUrl}`);
      return youtubeUrl;
    } else {
      console.error(
        `Fehler beim Abrufen der Daten für Song ID ${songId}: ${response.status} ${response.statusText}`,
        response.data
      );
      return null;
    }
  } catch (error) {
    console.error(
      `Fehler beim Abrufen des YouTube-Links für Apple Music Song ID ${songId}:`,
      error
    );
    return null;
  }
}

/**
 * Verarbeitet eine komplette Apple Music Playlist:
 * 1) Ruft die Song-Links ab.
 * 2) Lädt für die ersten 2 Songs synchron YouTube-Links via Odesli.
 * 3) Fügt sie in die Warteschlange ein und startet ggf. die Wiedergabe.
 * 4) Den Rest der Songs lädt er asynchron.
 */
export async function processAppleMusicPlaylist(
  url: string,
  interaction: ChatInputCommandInteraction
): Promise<void> {
  const links = await getLinks(url).catch((error) => {
    console.error(`Fehler beim Abrufen der Links für ${url}:`, error);
    return [];
  });

  if (!links || links.length === 0) {
    sendEmptyPlaylistMessage(interaction, url);
    return;
  }

  // Verarbeite die ersten beiden Songs direkt (synchrone Warteschlange)
  const firstTwoSongs = links.slice(0, 2);

  try {
    await Promise.all(
      firstTwoSongs.map((link, index) => processSong(link, index, interaction))
    );
  } catch (error) {
    console.error("Fehler beim Verarbeiten der ersten zwei Songs:", error);
  }

  // Nach den ersten zwei Songs schauen wir, ob eine Warteschlange existiert
  const queue = bot.queues.get(interaction.guild!.id);
  if (!queue || queue.songs.length === 0) {
    sendEmptyPlaylistMessage(interaction, url);
    return;
  }

  // Restliche Songs asynchron verarbeiten
  const remainingSongs = links.slice(2);
  remainingSongs.forEach(async (link, index) => {
    try {
      await processSong(link, index + 2, interaction);
    } catch (error) {
      console.error(`Fehler beim Verarbeiten des Songs an Position ${index + 2}:`, error);
    }
  });
}

/**
 * Sendet eine Embed-Nachricht, wenn keine Songs gefunden wurden.
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
 * Verarbeitet einen einzelnen Apple-Music-Link:
 * 1) Extrahiert die Song-ID
 * 2) Ruft den YouTube-Link via Odesli ab
 * 3) Erstellt ein `Song`-Objekt und legt es in die Warteschlange
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
    return;
  }

  try {
    // Song.from( url, url ) => Link + Link => Titel etc. wird ggf. via ytdl geholt
    const song = await Song.from(youtubeUrl, youtubeUrl);

    if (!interaction.guild) return;

    let queue = bot.queues.get(interaction.guild.id);

    // Sicherstellen, dass interaction.member ein GuildMember ist
    if (!(interaction.member instanceof GuildMember) || !interaction.member.voice.channel) {
      console.warn("Nutzer ist nicht in einem Voice-Channel. Breche ab.");
      return;
    }

    if (!queue) {
      // Neue Queue erstellen
      const channel = interaction.member.voice.channel;
      queue = new MusicQueue({
        interaction,
        textChannel: interaction.channel as TextChannel,
        connection: joinVoiceChannel({
          channelId: channel.id,
          guildId: interaction.guild.id,
          adapterCreator: interaction.guild.voiceAdapterCreator as DiscordGatewayAdapterCreator,
        }),
      });
      bot.queues.set(interaction.guild.id, queue);
    }

    // Neuen Song in die Warteschlange einfügen
    queue.enqueue(song);

    // Prüfen, ob queue eine play()-Methode hat und ggf. abspielen
    if ("play" in queue) {
      // Starte Wiedergabe nur bei den ersten beiden Songs oder wenn keine Wiedergabe läuft
      if (index < 2 || !queue.isPlaying) {
        queue.play();
      }
    }
  } catch (error) {
    console.error(`Fehler beim Verarbeiten des Songs ${link}:`, error);
  }
}