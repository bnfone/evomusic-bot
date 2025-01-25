/********************************************
 * utils/musicLinkConverter.ts
 ********************************************/
import axios from "axios";
import fs from "fs";
import path from "path";

// --- Odesli Datenstruktur ---
interface OdesliResponse {
  entityUniqueId: string;
  userCountry: string;
  pageUrl: string;
  linksByPlatform: {
    [key: string]: {
      url: string;
      nativeAppUriMobile?: string;
      nativeAppUriDesktop?: string;
      entityUniqueId: string;
    };
  };
}

// --- Cache-Datentyp ---
interface OdesliCacheEntry {
  updatedAt: number;       // Timestamp (ms) des letzten Updates
  data: OdesliResponse;    // Vollständiges Odesli-Response-Objekt
}

// Cache wird als Map (key: Original-URL) gehalten
const linkCache: Record<string, OdesliCacheEntry> = {};

// Pfad zur Cache-Datei
const CACHE_PATH = path.join(__dirname, "../cache.json");

// Gültigkeitsdauer (ms) - hier 30 Tage
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Cache beim Start laden (falls bereits vorhanden).
 */
function loadCacheFromFile(): void {
  try {
    if (fs.existsSync(CACHE_PATH)) {
      const raw = fs.readFileSync(CACHE_PATH, "utf8");
      const data = JSON.parse(raw) as Record<string, OdesliCacheEntry>;
      for (const [originalUrl, entry] of Object.entries(data)) {
        linkCache[originalUrl] = entry;
      }
    }
  } catch (error) {
    console.error("Fehler beim Laden des Odesli-Caches:", error);
  }
}

/**
 * Cache bei Bedarf speichern.
 */
function saveCacheToFile(): void {
  try {
    fs.writeFileSync(CACHE_PATH, JSON.stringify(linkCache, null, 2), "utf8");
  } catch (error) {
    console.error("Fehler beim Speichern des Odesli-Caches:", error);
  }
}

/**
 * Ruft Odesli-API auf, um alle Links für eine bestimmte URL zu bekommen
 * (Spotify, Apple Music, Deezer, etc.) und nutzt den Cache.
 */
export async function getOdesliDataWithCache(
  originalUrl: string
): Promise<OdesliResponse | null> {
  // 1) Cache-Hit prüfen
  const cacheEntry = linkCache[originalUrl];
  if (cacheEntry) {
    const isNotExpired = Date.now() - cacheEntry.updatedAt < THIRTY_DAYS_MS;
    if (isNotExpired) {
      return cacheEntry.data; // Direkt zurückgeben
    }
  }

  // 2) Odesli aufrufen
  try {
    const resp = await axios.get<OdesliResponse>(
      "https://api.song.link/v1-alpha.1/links",
      {
        params: {
          url: originalUrl,
        },
      }
    );

    // 3) Daten in Cache ablegen
    linkCache[originalUrl] = {
      updatedAt: Date.now(),
      data: resp.data,
    };
    saveCacheToFile();

    // 4) Ergebnis zurückgeben
    return resp.data;
  } catch (error) {
    console.error("Fehler beim Anfragen der Odesli-API:", error);
    return null;
  }
}

/**
 * Extrahiert explizit den YouTube-Link aus einem Odesli-Response-Objekt.
 */
export function getYouTubeLinkFromOdesliData(odesli: OdesliResponse): string | null {
  if (odesli?.linksByPlatform?.youtube) {
    return odesli.linksByPlatform.youtube.url;
  }
  return null;
}

/**
 * Wrapper-Funktion: Konvertiert einen Musik-Link (Apple Music, Spotify, etc.)
 * in einen YouTube-Link, indem Odesli und der Cache genutzt werden.
 */
export async function convertToYouTubeLink(
  originalUrl: string,
  platform: "spotify" | "appleMusic"
): Promise<string | null> {
  try {
    // 1) Odesli-Daten aus dem Cache oder neu laden
    const odesliData = await getOdesliDataWithCache(originalUrl);
    if (!odesliData) {
      console.error(`Keine Odesli-Daten für ${platform}-URL: ${originalUrl}`);
      return null;
    }

    // 2) YouTube-Link extrahieren
    const youtubeLink = getYouTubeLinkFromOdesliData(odesliData);
    if (!youtubeLink) {
      console.warn(`Kein YouTube-Link für ${platform}-URL: ${originalUrl}`);
      return null;
    }

    return youtubeLink;
  } catch (error) {
    console.error(`Fehler beim Konvertieren von ${platform}-Link:`, error);
    return null;
  }
}

// --- Am Ende einmal beim Laden des Bots den Cache initial einlesen ---
loadCacheFromFile();