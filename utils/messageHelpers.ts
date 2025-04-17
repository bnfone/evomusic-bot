import {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    APIEmbedField
  } from 'discord.js';
  
  // A simple interface for embed options
  type EmbedOptions = {
    title: string;
    description?: string;
    color?: number;
    fields?: APIEmbedField[];
    timestamp?: boolean;
  };
  
  // A definition for button options
  type ButtonOptions = {
    customId: string;
    label: string;
    style?: ButtonStyle;
    url?: string;       // only for LINK buttons
    emoji?: string;
    disabled?: boolean;
  };
  
  /**
   * Creates a standardized EmbedBuilder with provided options.
   * @param opts Embed options (title, description, color, fields, timestamp)
   */
  export function createEmbed(opts: EmbedOptions): EmbedBuilder {
    const embed = new EmbedBuilder();
    embed.setTitle(opts.title);
    if (opts.description) embed.setDescription(opts.description);
    if (opts.color !== undefined) embed.setColor(opts.color);
    if (opts.fields && opts.fields.length) embed.addFields(opts.fields);
    if (opts.timestamp) embed.setTimestamp();
    return embed;
  }
  
  /**
   * Creates an ActionRowBuilder filled with ButtonBuilders based on an array of ButtonOptions.
   * @param buttons Array of button option definitions
   */
  export function createButtonRow(
    buttons: ButtonOptions[]
  ): ActionRowBuilder<ButtonBuilder> {
    const row = new ActionRowBuilder<ButtonBuilder>();
    for (const btn of buttons) {
      const builder = new ButtonBuilder()
        .setCustomId(btn.customId)
        .setLabel(btn.label)
        .setStyle(btn.style ?? ButtonStyle.Secondary);
  
      if (btn.url && builder.data.style === ButtonStyle.Link) {
        builder.setURL(btn.url);
      }
      if (btn.emoji) {
        builder.setEmoji(btn.emoji);
      }
      if (btn.disabled) {
        builder.setDisabled(true);
      }
  
      row.addComponents(builder);
    }
    return row;
  }
  