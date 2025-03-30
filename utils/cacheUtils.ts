/********************************************
 * utils/cacheUtils.ts
 ********************************************/
import { promises as fs } from "fs";
import path from "path";
import { config } from "./config";

const CACHE_PATH = path.resolve(__dirname, "../cache.json");

/**
 * Lädt den Cache asynchron aus der Datei. Gibt im Fehlerfall ein leeres Objekt zurück.
 */
export async function loadCache(): Promise<Record<string, any>> {
  try {
    // Datei prüfen und ggf. erstellen
    const stats = await fs.stat(CACHE_PATH).catch(() => null);

    if (!stats) {
      await fs.writeFile(CACHE_PATH, JSON.stringify({}), "utf-8");
      if (config.DEBUG) console.log("[Cache] Leere Cache-Datei erzeugt.");
    }

    const rawData = await fs.readFile(CACHE_PATH, "utf-8");
    const jsonData = JSON.parse(rawData);

    if (config.DEBUG) console.log("[Cache] Cache erfolgreich geladen.");
    return jsonData;
  } catch (error) {
    console.error("[Cache] Fehler beim Laden des Caches:", error);
    return {};
  }
}

/**
 * Speichert den Cache asynchron in die Datei.
 */
export async function saveCache(cache: Record<string, any>): Promise<void> {
  try {
    await fs.writeFile(CACHE_PATH, JSON.stringify(cache, null, 2), "utf-8");
    if (config.DEBUG) console.log("[Cache] Cache erfolgreich gespeichert.");
  } catch (error) {
    console.error("[Cache] Fehler beim Speichern des Caches:", error);
  }
}