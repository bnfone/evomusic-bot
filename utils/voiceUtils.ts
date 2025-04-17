/********************************************
 * utils/voiceUtils.ts
 *
 * This module provides functionality to track users'
 * voice channel join times and accumulate listening time.
 *
 * It also automatically disconnects the bot from a voice channel
 * (and stops the corresponding queue) if no human user remains in that
 * specific voice channel (where the bot is active) for more than 1 minute.
 * Additionally, it sends i18n notifications:
 * - When the disconnect countdown starts.
 * - When the bot actually leaves the voice channel.
 *
 * All events are logged using the project's logger, and listening time
 * is updated via the stats module.
 ********************************************/

import { Client, VoiceState } from "discord.js";
import { MusicQueue } from "../structs/MusicQueue";
import logger from '../utils/logger';
import { logListeningTime } from "./stats";
import { i18n } from "./i18n";
import { config } from "./config";

/**
 * Auto‑disconnect: if VC empty for STAY_TIME seconds,
 * also logging the listening time.
 */
export function registerVoiceListeners(
  client: Client,
  queues: Map<string, MusicQueue>
): void {
  const joinTimestamps = new Map<string, number>();
  const disconnectTimers = new Map<string, NodeJS.Timeout>();

  client.on("voiceStateUpdate", (oldState: VoiceState, newState: VoiceState) => {
    const userId = newState.id;
    if (newState.member?.user.bot) return;

    const guildId = newState.guild!.id;
    const queue = queues.get(guildId);

    // user joins bots VC ---
    if (
      newState.channelId === queue?.connection.joinConfig.channelId &&
      oldState.channelId !== newState.channelId
    ) {
      joinTimestamps.set(userId, Date.now());
      if (disconnectTimers.has(guildId)) {
        clearTimeout(disconnectTimers.get(guildId)!);
        disconnectTimers.delete(guildId);
      }
    }

    // user leaves bots VC ---
    if (
      oldState.channelId === queue?.connection.joinConfig.channelId &&
      newState.channelId !== oldState.channelId
    ) {
      // log listening time
      const start = joinTimestamps.get(userId);
      if (start) {
        const minutes = (Date.now() - start) / 60000;
        logListeningTime(userId, minutes).catch(logger.error);
        joinTimestamps.delete(userId);
      }

      // If VC empty, Disconnect-Countdown
      const channel = oldState.channel;
      const humanCount = channel?.members.filter(m => !m.user.bot).size ?? 0;
      if (humanCount === 0 && queue) {
        const seconds = config.STAY_TIME;
        queue.textChannel
          .send(i18n.__mf("voice.inactivityCountdown", { time: seconds }))
          .catch(logger.error);

        if (!disconnectTimers.has(guildId)) {
          logger.info(`[VoiceUtils] Scheduling disconnect in ${seconds}s for guild ${guildId}`);
          const timer = setTimeout(() => {
            queue.textChannel
              .send(i18n.__("voice.leftDueToInactivity"))
              .catch(logger.error);
            queue.stop();
            queues.delete(guildId);
            disconnectTimers.delete(guildId);
          }, seconds * 1000);
          disconnectTimers.set(guildId, timer);
        }
      }
    }
  });
}