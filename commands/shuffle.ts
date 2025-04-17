import {
  ChatInputCommandInteraction,
  GuildMember,
  SlashCommandBuilder
} from "discord.js";
import { bot } from "../index";
import { i18n } from "../utils/i18n";
import { canModifyQueue } from "../utils/queue";
import { safeReply } from "../utils/safeReply";
import { shuffleQueue } from "../utils/playlistHelper";
import logger from '../utils/logger';


export default {
  data: new SlashCommandBuilder()
    .setName("shuffle")
    .setDescription(i18n.__("shuffle.description")),

  async execute(interaction: ChatInputCommandInteraction) {
    try {
      const queue = bot.queues.get(interaction.guildId!);
      if (!queue) {
        return interaction.reply({
          content: i18n.__("shuffle.errorNotQueue"),
          ephemeral: true
        });
      }

      // Stelle sicher, dass wir einen echten GuildMember haben
      let member = interaction.member;
      if (!(member instanceof GuildMember)) {
        member = await interaction.guild!.members.fetch(interaction.user.id);
      }

      if (!canModifyQueue(member)) {
        return interaction.reply({
          content: i18n.__("common.errorNotChannel"),
          ephemeral: true
        });
      }

      shuffleQueue(queue);
      safeReply(
        interaction,
        i18n.__mf("shuffle.result", { author: interaction.user.id })
      );
      logger.info(`User ${interaction.user.id} shuffled queue in ${interaction.guildId}`);
    } catch (err) {
      logger.error("[Shuffle] Execution error:", err as Error);
      interaction
        .reply({ content: i18n.__("common.errorCommand"), ephemeral: true })
        .catch(logger.error);
    }
  }
};