import "dotenv/config";
import { Config } from "../interfaces/Config";

let config: Config;

try {
  config = require("../config.json");
} catch (error) {
  config = {
    TOKEN: process.env.TOKEN || "",
    MAX_PLAYLIST_SIZE: parseInt(process.env.MAX_PLAYLIST_SIZE!) || 10,
    PRUNING: process.env.PRUNING === "true" ? true : false,
    STAY_TIME: parseInt(process.env.STAY_TIME!) || 30,
    DEFAULT_VOLUME: parseInt(process.env.DEFAULT_VOLUME!) || 100,
    LOCALE: process.env.LOCALE || "en",
    SPOTIFY_CLIENT_ID: process.env.SPOTIFY_CLIENT_ID || "",
    SPOTIFY_CLIENT_SECRET: process.env.SPOTIFY_CLIENT_SECRET || "",
    DEBUG: process.env.DEBUG === "true",
    ADVERTISEMENT_INTERVAL: process.env.ADVERTISEMENT_INTERVAL ? parseInt(process.env.ADVERTISEMENT_INTERVAL) : 30,
    pipedApiUrl: process.env.PIPED_API_URL || "",
    usePipedFallback: process.env.USE_PIPED_FALLBACK === "false",
    USE_METADATA_EXTRACTION: process.env.USE_METADATA_EXTRACTION === "true"
  };
}

export { config };
