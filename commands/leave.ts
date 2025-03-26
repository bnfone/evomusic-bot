import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { bot } from "../index";
import { i18n } from "../utils/i18n";
import { canModifyQueue } from "../utils/queue";

export default {
  data: new SlashCommandBuilder().setName("leave").setDescription(i18n.__("leave.description")),
  async execute(interaction: ChatInputCommandInteraction) {
    const guildMember = interaction.guild!.members.cache.get(interaction.user.id);
    const queue = bot.queues.get(interaction.guild!.id);
    
    if (!queue) return interaction.reply({ content: i18n.__("stop.errorNotQueue") }).catch(console.error);

    if (!canModifyQueue(guildMember!)) return i18n.__("common.errorNotChannel");

    queue.stop();

    interaction.reply({ content: i18n.__mf("stop.result", { author: interaction.user.id }) }).catch(console.error);

    queue.connection.destroy();

    bot.queues.delete(interaction.guild!.id);
  }
}