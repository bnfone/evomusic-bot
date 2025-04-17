import { MusicQueue } from "../structs/MusicQueue";
import { i18n } from "./i18n";
import logger from '../utils/logger';


/**
 * Shuffles the queue *in place*, preserving die aktuell spielende Song an Index 0.
 */
export function shuffleQueue(queue: MusicQueue): void {
  const songs = queue.songs;
  for (let i = songs.length - 1; i > 1; i--) {
    const j = 1 + Math.floor(Math.random() * i);
    [songs[i], songs[j]] = [songs[j], songs[i]];
  }
  queue.songs = songs;
  logger.info(`Queue shuffled in guild ${queue.interaction.guildId}`);
}

/**
 * Wenn der Benutzer Shuffle für eine große Playlist angefragt hat,
 * wird es nach einer kurzen Verzögerung ausgeführt.
 */
export function scheduleShuffle(queue: MusicQueue, delayMs: number = 2000): void {
  setTimeout(() => {
    if (queue.songs.length > 1) {
      shuffleQueue(queue);
      queue.textChannel
        .send(i18n.__("playlist.shuffleEnabled"))
        .catch(logger.error);
    }
  }, delayMs);
}