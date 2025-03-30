/********************************************
 * utils/spotifyUtils.ts
 ********************************************/
import axios from "axios";
import { config } from "./config";
import { getOdesliLink } from "./odesliUtils";

/**
 * Typ für die Rückgabe von parseSpotifyLinkType()
 */
interface SpotifyLinkTypeResult {
  type: "album" | "playlist" | "track" | "unknown";
  id: string | null;
}

/**
 * Ermittelt das Spotify-Access-Token via Client Credentials Flow.
 */
export async function getSpotifyAccessToken(): Promise<string> {
  if (config.DEBUG) console.log("[Spotify] Fordere Access-Token an...");

  try {
    const { data } = await axios.post(
      "https://accounts.spotify.com/api/token",
      "grant_type=client_credentials",
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${Buffer.from(
            `${config.SPOTIFY_CLIENT_ID}:${config.SPOTIFY_CLIENT_SECRET}`
          ).toString("base64")}`,
        },
      }
    );

    if (config.DEBUG) console.log("[Spotify] Access-Token erfolgreich erhalten.");
    return data.access_token;
  } catch (error) {
    console.error("[Spotify] Fehler beim Abrufen des Access-Tokens:", error);
    throw error;
  }
}

/**
 * Parst die Spotify-URL und erkennt, ob sie ein Album, eine Playlist oder ein Track ist.
 * Beispiel: https://open.spotify.com/playlist/XYZ?si=...
 *           https://open.spotify.com/album/XYZ?si=...
 *           https://open.spotify.com/track/XYZ?si=...
 */
export function parseSpotifyLinkType(spotifyUrl: string): SpotifyLinkTypeResult {
  try {
    const url = new URL(spotifyUrl);
    // Pfad in Teile splitten => [ 'playlist', '<ID>' ] | [ 'album', '<ID>' ] | [ 'track', '<ID>' ]
    const parts = url.pathname.split("/").filter(Boolean);

    if (!parts[0] || !parts[1]) {
      return { type: "unknown", id: null };
    }

    const typeStr = parts[0];
    const id = parts[1].split("?")[0];

    if (typeStr === "playlist") {
      return { type: "playlist", id };
    } else if (typeStr === "album") {
      return { type: "album", id };
    } else if (typeStr === "track") {
      return { type: "track", id };
    }
    return { type: "unknown", id: null };
  } catch (error) {
    return { type: "unknown", id: null };
  }
}

/**
 * Hilfsfunktion, lädt alle Tracks aus einer Spotify-Playlist (mit Pagination).
 */
async function fetchSpotifyPlaylistTracks(
  playlistId: string,
  accessToken: string
): Promise<string[]> {
  let tracks: string[] = [];
  let nextUrl = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100`;

  while (nextUrl) {
    if (config.DEBUG) console.log(`[Spotify] Lade Playlist-Tracks von: ${nextUrl}`);
    const { data } = await axios.get(nextUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    // 'items' enthält die Einträge. item.track.external_urls.spotify => Song-Link
    const newTracks = data.items
      .map((item: any) => item.track?.external_urls?.spotify)
      .filter(Boolean);

    tracks.push(...newTracks);
    nextUrl = data.next; // data.next enthält die URL für die nächste Seite oder null
  }

  return tracks;
}

/**
 * Hilfsfunktion, lädt alle Tracks aus einem Spotify-Album (mit Pagination).
 */
async function fetchSpotifyAlbumTracks(
  albumId: string,
  accessToken: string
): Promise<string[]> {
  let tracks: string[] = [];
  let nextUrl = `https://api.spotify.com/v1/albums/${albumId}/tracks?limit=50`;

  while (nextUrl) {
    if (config.DEBUG) console.log(`[Spotify] Lade Album-Tracks von: ${nextUrl}`);
    const { data } = await axios.get(nextUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    // data.items[] => each track has external_urls.spotify
    const newTracks = data.items
      .map((track: any) => track.external_urls?.spotify)
      .filter(Boolean);

    tracks.push(...newTracks);
    nextUrl = data.next;
  }

  return tracks;
}

/**
 * Hauptfunktion: Bekommt eine beliebige Spotify-URL (Playlist oder Album),
 * lädt alle enthaltenen Songs, und gibt deren Spotify-Links als Array zurück.
 *
 * Falls es ein Track-Link ist, kannst du das Array leer zurückgeben
 * oder direkt [spotifyUrl] zurückgeben - je nachdem, was dein Bot tun soll.
 *
 * Standard: Track => wird nicht als 'Playlist' behandelt
 * -> Dann return []
 */
export async function getSpotifyTracks(spotifyUrl: string): Promise<string[]> {
  const accessToken = await getSpotifyAccessToken();
  const { type, id } = parseSpotifyLinkType(spotifyUrl);

  if (!id) {
    if (config.DEBUG) console.log("[Spotify] Keine gültige ID erkannt.");
    return [];
  }

  try {
    if (type === "playlist") {
      // Richtige Playlist => via /v1/playlists/ID/tracks
      if (config.DEBUG) console.log(`[Spotify] Lade Playlist: ${id}`);
      return await fetchSpotifyPlaylistTracks(id, accessToken);
    } else if (type === "album") {
      // Album => verhalte dich wie Playlist => /v1/albums/ID/tracks
      if (config.DEBUG) console.log(`[Spotify] Lade Album (als Playlist): ${id}`);
      return await fetchSpotifyAlbumTracks(id, accessToken);
    } else if (type === "track") {
      // EINZELNER TRACK. Du könntest hier => return [spotifyUrl];
      // oder => return [] (falls du es gar nicht hier behandeln willst)
      if (config.DEBUG) console.log("[Spotify] URL ist ein Track-Link. Gebe leer zurück oder handle anders.");
      return [];
    } else {
      if (config.DEBUG) console.log("[Spotify] Unbekannter Link-Typ. Gebe leer zurück.");
      return [];
    }
  } catch (error) {
    console.error("[Spotify] Fehler beim Abrufen der Tracks:", error);
    return [];
  }
}

/**
 * Konvertiert einen Spotify-Track-URL via Odesli in eine YouTube-URL (Einzeltitel).
 */
export async function spotifyTrackToYoutube(spotifyUrl: string): Promise<string | null> {
  if (config.DEBUG) console.log(`[Spotify] Konvertiere Track zu YouTube: ${spotifyUrl}`);
  const youtubeUrl = await getOdesliLink(spotifyUrl);
  return youtubeUrl;
}