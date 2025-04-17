// File: utils/applemusic.ts

import axios from "axios";
import { load } from "cheerio";
// Cheerio liefert den Typ "Element", nicht "CheerioElement"
import type { Element } from "cheerio";
// Default‑Import für den Logger
import logger from "./logger";
import { getCacheEntry, updateCacheEntry } from "./cache";

export async function getAppleMusicSongData(
  songUrl: string
): Promise<{ title: string; artist: string; standardizedUrl: string }> {
  try {
    const urlObj = new URL(songUrl);
    const trackId =
      urlObj.searchParams.get("i") || songUrl.match(/\/song\/(\d+)/)?.[1];
    const country = urlObj.pathname.split("/")[1] || "us";
    if (!trackId) throw new Error(`No track ID in URL: ${songUrl}`);

    const standardizedUrl = `https://music.apple.com/${country}/song/${trackId}`;

    const cached = await getCacheEntry(standardizedUrl);
    if (cached?.songName && cached.artist) {
      logger.info(`[AppleMusic] Cache hit for ${standardizedUrl}`);
      return {
        title: cached.songName,
        artist: cached.artist,
        standardizedUrl
      };
    }

    const res = await axios.get(standardizedUrl, { responseType: "text" });
    const $ = load(res.data);
    const jsonLd = $('script[type="application/ld+json"]')
      .first()
      .html();
    const data = jsonLd ? JSON.parse(jsonLd) : null;
    const title = data?.name || "Unknown";
    const artist = data?.byArtist?.name || "Unknown";

    // jetzt alle nötigen Felder liefern:
    await updateCacheEntry(standardizedUrl, {
      songName: title,
      artist,
      // <-- Titelseite verlangt genau "appleMusic"
      platform: "appleMusic",
      youtubeUrl: "",
      // <-- Zahl, kein Date-Objekt
      updatedAt: Date.now()
    });

    return { title, artist, standardizedUrl };
  } catch (e) {
    logger.error(
      `[AppleMusic] Error fetching song data for ${songUrl}`,
      e as Error
    );
    return { title: "Unknown", artist: "Unknown", standardizedUrl: songUrl };
  }
}

export async function getAppleMusicPlaylistData(
  playlistUrl: string
): Promise<{ songs: { title: string; artist: string; url: string }[] }> {
  try {
    const res = await axios.get(playlistUrl, { responseType: "text" });
    const $ = load(res.data);
    const jsonLd = $('script[type="application/ld+json"]')
      .filter((i: number, el: Element) =>
        $(el).html()?.includes("MusicPlaylist")
      )
      .first()
      .html();
    const data = jsonLd ? JSON.parse(jsonLd) : null;
    const tracks = data?.track || [];
    const songs = tracks.map((t: any) => ({
      title: t?.name || "Unknown",
      artist: t?.byArtist?.name || "Unknown",
      url: t?.url || playlistUrl
    }));
    return { songs };
  } catch (e) {
    logger.error(
      `[AppleMusic] Error fetching playlist data for ${playlistUrl}`,
      e as Error
    );
    throw new Error("Failed to retrieve Apple Music playlist data");
  }
}
