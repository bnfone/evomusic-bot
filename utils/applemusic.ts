/********************************************
 * utils/applemusic.ts
 *
 * This module provides functions to extract song
 * metadata (title, artist, and a standardized URL) as well as
 * playlist data from Apple Music webpages.
 *
 * It uses Axios to perform HTTP requests and Cheerio to parse
 * the HTML. Detailed logging and error handling is implemented
 * using the project's logger and errorHandler.
 *
 * Additionally, it uses a cache (from utils/cache.ts) to store and
 * retrieve song metadata so that repeated requests for the same song
 * do not trigger additional HTTP requests.
 ********************************************/

import axios from 'axios';
import { load } from 'cheerio';
import { log, error as logError } from './logger';
import { handleError } from './errorHandler';
import { getCacheEntry, updateCacheEntry } from './cache';

/**
 * Extracts song metadata from an Apple Music song URL.
 *
 * Steps:
 * 1. Checks if a query parameter "i" is present. If so, uses that as the song ID
 *    and builds a standardized URL using the country code from the pathname.
 * 2. Otherwise, uses a regex to extract the song ID from the URL path.
 * 3. Checks the cache using the standardized URL as key. If found, returns cached data.
 * 4. If not cached, fetches the HTML content of the song page using Axios (with proper UTF-8 handling),
 *    parses the HTML with Cheerio to find the JSON-LD script, and extracts the song title and artist.
 * 5. Updates the cache with the retrieved metadata.
 *
 * @param songUrl - The Apple Music song URL to process.
 * @returns An object containing the song title, artist, and standardized URL.
 */
export async function getAppleMusicSongData(songUrl: string): Promise<{ title: string; artist: string; standardizedUrl: string }> {
  // Parse the URL for query parameters and pathname.
  const urlObj = new URL(songUrl);
  const songIdFromQuery = urlObj.searchParams.get("i");
  let standardizedUrl: string;

  if (songIdFromQuery) {
    // Use the "i" query parameter as the song ID.
    const pathParts = urlObj.pathname.split("/").filter(part => part);
    const country = pathParts[0] || "us";
    standardizedUrl = `https://music.apple.com/${country}/song/${songIdFromQuery}`;
  } else {
    // Fallback: use regex to extract the song ID from the URL path.
    const songIdRegex = /\/song\/(?:[^\/]+\/)?(\d+)/;
    const match = songUrl.match(songIdRegex);
    if (!match) {
      logError(`[AppleMusic] Could not extract song ID from URL: ${songUrl}`);
      return { title: "Unknown", artist: "Unknown", standardizedUrl: songUrl };
    }
    const songId = match[1];
    standardizedUrl = `https://music.apple.com/de/song/${songId}`;
  }

  // Check the cache for this standardized URL.
  const cachedEntry = await getCacheEntry(standardizedUrl);
  if (cachedEntry && cachedEntry.songName && cachedEntry.artist) {
    log(`[AppleMusic] Cache hit for URL: ${standardizedUrl}`);
    return { title: cachedEntry.songName, artist: cachedEntry.artist, standardizedUrl };
  }

  // Define request headers with a User-Agent to mimic a real browser.
  const headers = { 
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
  };

  try {
    log(`[AppleMusic] Fetching song page: ${standardizedUrl}`);
    // Ensure proper UTF-8 decoding.
    const response = await axios.get<string>(standardizedUrl, { headers, responseType: "text" });
    const $ = load(response.data);
    const jsonScript = $('script#schema\\:song[type="application/ld+json"]').html();

    if (!jsonScript) {
      logError(`[AppleMusic] JSON-LD script not found on page: ${standardizedUrl}`);
      return { title: "Unknown", artist: "Unknown", standardizedUrl };
    }

    // Parse the JSON data.
    const data = JSON.parse(jsonScript);
    const title = data.name || "Unknown";
    let artist = "Unknown";

    // Extract artist information from the "audio.byArtist" property.
    if (data.audio && data.audio.byArtist) {
      if (Array.isArray(data.audio.byArtist) && data.audio.byArtist.length > 0) {
        artist = data.audio.byArtist[0].name || "Unknown";
      } else if (typeof data.audio.byArtist === "object") {
        artist = data.audio.byArtist.name || "Unknown";
      }
    }

    log(`[AppleMusic] Extracted song data - Title: ${title}, Artist: ${artist}`);

    // Update the cache with the new metadata.
    await updateCacheEntry(standardizedUrl, {
      platform: 'appleMusic',
      songName: title,
      artist: artist,
      youtubeUrl: "", // Not set here – will be filled after YouTube search if needed.
      updatedAt: Date.now(),
    });

    return { title, artist, standardizedUrl };
  } catch (err) {
    logError(`[AppleMusic] Error fetching or parsing song data from URL: ${standardizedUrl}`, err as Error);
    handleError(null, err as Error);
    return { title: "Unknown", artist: "Unknown", standardizedUrl };
  }
}

/**
 * Extracts playlist data from an Apple Music playlist URL.
 *
 * Steps:
 * 1. Fetches the HTML content of the playlist page.
 * 2. Parses the HTML with Cheerio to extract:
 *    - The playlist title (from meta tag "apple:title").
 *    - The playlist creator (heuristically from the <title> tag).
 *    - The canonical URL (from meta tag "og:url").
 *    - All song URLs and track numbers (from meta tags "music:song" and "music:song:track").
 * 3. For each song URL, calls getAppleMusicSongData() to retrieve detailed song metadata.
 * 4. Returns an object containing the playlist information and an array of song data.
 *
 * @param playlistUrl - The Apple Music playlist URL to process.
 * @returns An object with playlistTitle, playlistCreator, canonicalUrl, and an array of songs.
 */
export async function getAppleMusicPlaylistData(playlistUrl: string): Promise<{
  playlistTitle: string;
  playlistCreator: string;
  canonicalUrl: string;
  songs: { track: number; url: string; title: string; artist: string }[];
}> {
  const headers = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
  };

  try {
    log(`[AppleMusic] Fetching playlist page: ${playlistUrl}`);
    const response = await axios.get<string>(playlistUrl, { headers, responseType: "text" });
    const $ = load(response.data);

    const titleTag = $('meta[name="apple:title"]');
    const playlistTitle = titleTag.attr("content") || "Unknown Playlist Title";

    let playlistCreator = "Unknown Creator";
    const titleText = $('title').text().replace("\ufeff", "").trim();
    if (titleText.includes(" by ") && titleText.includes(" - Apple Music")) {
      const parts = titleText.split(" by ");
      if (parts[1]) {
        playlistCreator = parts[1].split(" - Apple Music")[0].trim();
      }
    }

    const urlTag = $('meta[property="og:url"]');
    const canonicalUrl = urlTag.attr("content") || playlistUrl;

    const songTags = $('meta[property="music:song"]').toArray();
    const trackTags = $('meta[property="music:song:track"]').toArray();

    if (songTags.length === 0 || trackTags.length === 0) {
      logError(`[AppleMusic] No songs found in playlist page: ${playlistUrl}`);
      return { playlistTitle, playlistCreator, canonicalUrl, songs: [] };
    }

    let songs: { track: number; url: string; title: string; artist: string }[] = [];
    for (let i = 0; i < songTags.length && i < trackTags.length; i++) {
      const rawSongUrl = $(songTags[i]).attr("content") || "";
      const songUrl = rawSongUrl.split("?")[0]; // Remove any query parameters.
      const trackNumStr = $(trackTags[i]).attr("content") || "0";
      const track = parseInt(trackNumStr, 10) || 0;

      const { title, artist, standardizedUrl } = await getAppleMusicSongData(songUrl);
      songs.push({ track, url: standardizedUrl, title, artist });
    }

    songs.sort((a, b) => a.track - b.track);

    log(`[AppleMusic] Extracted playlist data - Title: ${playlistTitle}, Creator: ${playlistCreator}, Songs found: ${songs.length}`);
    return { playlistTitle, playlistCreator, canonicalUrl, songs };
  } catch (err) {
    logError(`[AppleMusic] Error fetching or parsing playlist data from URL: ${playlistUrl}`, err as Error);
    handleError(null, err as Error);
    return { playlistTitle: "Unknown Playlist Title", playlistCreator: "Unknown Creator", canonicalUrl: playlistUrl, songs: [] };
  }
}