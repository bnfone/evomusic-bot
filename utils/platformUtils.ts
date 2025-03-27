/********************************************
 * utils/platformUtils.ts
 ********************************************/
import { spotifyTrackToYoutube } from "./spotify";
import { appleMusicSongToYoutube } from "./appleMusicUtils";
import { config } from "./config";
import { youtubeURLPattern, spotifyPattern, appleMusicPattern } from "./patterns";

/**
 * Erkennt, ob ein Link von Spotify, Apple Music oder YouTube kommt.
 * Falls ja, wird er in einen YouTube-Link konvertiert (sofern noch nicht YouTube).
 */
export async function convertToYouTubeLink(originalUrl: string): Promise<string | null> {
  if (youtubeURLPattern.test(originalUrl)) {
    // Ist bereits ein YouTube-Link
    if (config.DEBUG) console.log("[Platform] Link ist bereits YouTube.");
    return originalUrl;
  }

  if (spotifyPattern.test(originalUrl)) {
    if (config.DEBUG) console.log("[Platform] Erkanne Spotify-Link. Konvertiere...");
    return await spotifyTrackToYoutube(originalUrl);
  }

  if (appleMusicPattern.test(originalUrl)) {
    if (config.DEBUG) console.log("[Platform] Erkanne Apple-Music-Link. Konvertiere...");
    return await appleMusicSongToYoutube(originalUrl);
  }

  return null;
}