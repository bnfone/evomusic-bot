/********************************************
 * utils/odesliUtils.ts
 ********************************************/
import axios from "axios";
import { loadCache, saveCache } from "./cacheUtils";
import { config } from "./config";

/**
 * Interface für die Odesli API Antwort
 */
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

/**
 * In-Memory Cache, um Race Conditions zu vermeiden
 */
let cache: { [key: string]: { updatedAt: number; youtubeUrl: string | null } } = {};

/**
 * Lade den Cache einmal beim Initialisieren des Moduls
 */
(async () => {
  cache = await loadCache();
  if (config.DEBUG) {
    console.log(`[Odesli] Cache geladen. Anzahl Einträge: ${Object.keys(cache).length}`);
  }
})();

/**
 * Rate-Limit Tracking Variablen
 */
let requestsSinceCooldown = 0;   // Anzahl Requests seit letztem Cooldown
let isCooldownActive = false;    // Flag, ob gerade ein Cooldown läuft

/**
 * Queue-Mechanismus, um getOdesliLink Anfragen seriell zu verarbeiten
 */
let isProcessing = false;
let pendingPromises: Array<() => void> = [];

async function enqueue() {
  return new Promise<void>((resolve) => {
    pendingPromises.push(resolve);
    if (!isProcessing) {
      isProcessing = true;
      processQueue();
    }
  });
}

async function processQueue() {
  while (pendingPromises.length > 0) {
    const resolve = pendingPromises.shift();
    if (resolve) resolve();
    // Warte auf den nächsten Tick
    await new Promise((r) => setImmediate(r));
  }
  isProcessing = false;
}

/**
 * Ruft die Odesli-API auf und nutzt den In-Memory Cache.
 * Bei mehr als 8 Requests seit letztem Cooldown oder bei einem 429-Fehler wird 90 Sekunden gewartet.
 * Jeder Eintrag wird im Cache gespeichert, auch wenn kein YouTube-Link gefunden wurde.
 */
export async function getOdesliLink(originalUrl: string): Promise<string | null> {
  await enqueue(); // Sicherstellen, dass nur eine Anfrage gleichzeitig verarbeitet wird

  // 1) Prüfen, ob im Cache vorhanden => Sofort zurückgeben
  if (cache[originalUrl]?.youtubeUrl !== undefined) { // Auch null erlaubt
    if (config.DEBUG) {
      console.log(`[Odesli] Cache-Hit: ${originalUrl}`);
    }
    return cache[originalUrl].youtubeUrl;
  }

  // 2) Prüfen, ob eine Pause erforderlich ist (nach 8 Requests)
  if (requestsSinceCooldown >= 8 && !isCooldownActive) {
    if (config.DEBUG) {
      console.warn(`[Odesli] Erreichte 8 Requests seit letztem Cooldown. Warte 90 Sekunden...`);
    }
    isCooldownActive = true;
    // 90 Sekunden warten
    await new Promise((resolve) => setTimeout(resolve, 90_000));
    requestsSinceCooldown = 0;
    isCooldownActive = false;
  }

  // Request-Zähler erhöhen
  requestsSinceCooldown++;

  // 3) Anfrage an Odesli senden
  if (config.DEBUG) {
    console.log(`[Odesli] Anfrage für URL: ${originalUrl}`);
  }

  try {
    const resp = await axios.get<OdesliResponse>("https://api.song.link/v1-alpha.1/links", {
      params: { url: originalUrl },
    });

    const youtubeUrl = resp.data.linksByPlatform?.youtube?.url || null;

    // 4) Ergebnis im Cache speichern (auch wenn youtubeUrl null ist)
    cache[originalUrl] = {
      updatedAt: Date.now(),
      youtubeUrl,
    };
    await saveCache(cache); // Sofort speichern

    if (config.DEBUG) {
      console.log(`[Odesli] Ergebnis: ${youtubeUrl ? youtubeUrl : "Kein YouTube-Link gefunden"}`);
    }

    return youtubeUrl;
  } catch (error: any) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;

      if (status === 429) {
        console.warn("[Odesli] Fehler 429 (Too Many Requests) – Wir wurden rate-limitiert.");

        // Sofort 90 Sekunden warten bei 429
        if (!isCooldownActive) {
          if (config.DEBUG) {
            console.warn("[Odesli] Warte 90 Sekunden aufgrund 429...");
          }
          isCooldownActive = true;
          await new Promise((resolve) => setTimeout(resolve, 90_000));
          requestsSinceCooldown = 0;
          isCooldownActive = false;
        }

        // Ergebnis im Cache mit youtubeUrl: null speichern
        cache[originalUrl] = {
          updatedAt: Date.now(),
          youtubeUrl: null,
        };
        await saveCache(cache); // Speichern trotz Fehler

      } else {
        // Andere HTTP-Fehler (z. B. 404, 500)
        console.error("[Odesli] HTTP-Fehler:", status, error.message);

        // Ergebnis im Cache mit youtubeUrl: null speichern
        cache[originalUrl] = {
          updatedAt: Date.now(),
          youtubeUrl: null,
        };
        await saveCache(cache); // Speichern trotz Fehler
      }
    } else {
      // Netzwerkfehler oder andere Fehler
      console.error("[Odesli] Unbekannter Fehler:", error);

      // Ergebnis im Cache mit youtubeUrl: null speichern
      cache[originalUrl] = {
        updatedAt: Date.now(),
        youtubeUrl: null,
      };
      await saveCache(cache); // Speichern trotz Fehler
    }
    return null;
  }
}