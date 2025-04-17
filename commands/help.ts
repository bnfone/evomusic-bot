import { CommandInteraction, SlashCommandBuilder } from "discord.js";
import { createEmbed } from "../utils/messageHelpers";
import { i18n } from "../utils/i18n";
import { bot } from "../index";

export default {
  data: new SlashCommandBuilder()
    .setName("help")
    .setDescription(i18n.__("help.description")),

  async execute(interaction: CommandInteraction) {
    // Prepare fields for each command
    const fields = Array.from(bot.slashCommandsMap.values()).map(cmd => ({
      name: `/${cmd.data.name}`,
      value: cmd.data.description || i18n.__("common.noDescription"),
      inline: true,
    }));

    // Create the embed using our helper
    const helpEmbed = createEmbed({
      title: i18n.__mf("help.embedTitle", { botname: interaction.client.user!.username }),
      description: i18n.__("help.embedDescription"),
      color: 0xF8AA2A,
      fields,
      timestamp: true,
    });

    return interaction.reply({ embeds: [helpEmbed] }).catch(console.error);
  }
};
