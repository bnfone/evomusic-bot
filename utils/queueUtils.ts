import { bot } from '../index';
import { log } from './logger';
import { i18n } from './i18n';

/**
 * Schedules a shuffle of the music queue after a delay.
 * @param guildId - The guild ID whose queue to shuffle.
 * @param delayMs - Delay in milliseconds before shuffling.
 * @param interaction - The interaction to follow up on.
 */
export function scheduleShuffle(guildId: string, delayMs: number, interaction: any): void {
  setTimeout(() => {
    const queue = bot.queues.get(guildId);
    if (queue && queue.songs.length > 1) {
      queue.shuffle();
      interaction.followUp(i18n.__('playlist.shuffleEnabled'));
      log(`[QueueUtils] Shuffled queue for guild ${guildId}`);
    }
  }, delayMs);
}