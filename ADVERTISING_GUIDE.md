# Advertising Guide

This guide explains how to configure and use the advertisement functionality in your Discord bot. The system allows you to define multiple advertisement configurations (ads) that include an embed, buttons, a priority, and associated audio files. When an ad is played, both the visual embed (with interactive buttons) and an audio file from the same ad configuration are used.

## A Personal Note on Advertising

Before we dive into the technical details, I want to take a moment to share the idea behind this feature.

I'm not a big fan of traditional advertising. It's often disruptive, profit-driven, and not something I'd usually want in a music bot. So why did I add an ad system?

The motivation came from a simple but powerful thought: Too often, people expect software to just work — instantly, for free, and forever — without thinking about the humans behind it. Especially when it comes to small, independent projects maintained by people in their free time (like me — hi 👋). I wanted to change that mindset, even if just a little.

This system was created **not to sell products** or make money, but to gently remind users that this bot is open source, built with care, and actually maintained by someone. A small message after an hour of music — maybe suggesting a GitHub star, a small donation, or just spreading some awareness — can go a long way in supporting this work.

I’ve also made the system flexible so that I can share things I care about: open-source contributions, environmental efforts, human rights, or other **meaningful projects**. I believe this might even be a new kind of “advertising” — one that doesn’t just sell, but inspires and informs.

That’s why the `ADVERTISEMENT_INTERVAL` should be kept reasonably high — I suggest no more than once per hour, for around 20 to 40 seconds max. The goal isn’t to annoy people — it’s to plant a seed.

**Please don’t misuse this feature**. I trust the community to use it with the same intention it was built: with thoughtfulness, purpose, and a bit of heart.

Thanks for reading. Now let’s get into the details!


---

## Overview

The advertisement system is implemented in the `utils/advertisements.ts` module. Its key features include:

- **Multiple Ad Configurations:**  
  Define several ads in a single JSON file.

- **Weighted Random Selection:**  
  Ads are selected based on a weighted random algorithm using the `priority` property. Higher priority values increase the likelihood of selection.

- **Consistent Ad Playback:**  
  When an ad is chosen, both its embed/buttons and one of its associated audio files are played together.


## Configuration

The advertisement configurations are stored in a JSON file located at `data/advertisements/advertisements.json`. This file should contain an array of advertisement configurations. Each configuration has the following structure:

- **embed:**  
  Contains the title, description, and color (in hex) for the embed.

- **buttons:**  
  An array of button objects. Each button has a label, style, and optionally a URL (for LINK buttons), a custom ID, and an emoji.

- **priority:**  
  A numeric value that determines the chance of this ad being selected. Higher numbers mean higher priority.

- **audioFiles:**  
  An array of strings, where each string is a filename of an audio file associated with this ad.

### Example Configuration

```json
[
  {
    "embed": {
      "title": "🎶 Enjoying the vibes?",
      "description": "This bot is fully open source and made with way too much love (and caffeine).\n👉 Drop a ⭐ on the GitHub repo to support it!\n💸 Feeling generous? Donations help with updates & server costs!\nEvery click fuels the music… and prevents one developer meltdown 😌❤️",
      "color": "#F8AA2A"
    },
    "buttons": [
      {
        "label": "Star on GitHub",
        "style": "LINK",
        "url": "https://github.com/bnfone/discord-bot-evomusic"
      },
      {
        "label": "Donate",
        "style": "LINK",
        "url": "https://bnf.one/devdonations"
      },
      {
        "label": "Skip Ad",
        "emoji": "🤝",
        "custom_id": "ad_skip",
        "style": "SECONDARY"
      }
    ],
    "priority": 1,
    "audioFiles": [
      "ad_01.mp3",
      "ad_02.mp3",
      "ad_03.mp3",
      "ad_04.mp3",
      "ad_05.mp3",
      "ad_06.mp3",
      "ad_08.mp3",
      "ad_09.mp3",
      "ad_10.mp3",
      "ad_11.mp3",
      "ad_12.mp3",
      "ad_13.mp3",
      "ad_14.mp3",
      "ad_15.mp3",
      "ad_16.mp3",
      "ad_17.mp3",
      "ad_18.mp3",
      "ad_19.mp3"
    ]
  },
  {
    "embed": {
      "title": "🔥 Hot Deal!",
      "description": "Check out our latest hot deal on premium products. Don't miss out!",
      "color": "#FF4500"
    },
    "buttons": [
      {
        "label": "Learn More",
        "style": "LINK",
        "url": "https://example.com/deal"
      },
      {
        "label": "Skip Ad",
        "style": "PRIMARY",
        "custom_id": "ad_skip",
        "emoji": "⏭️"
      }
    ],
    "priority": 1,
    "audioFiles": [
      "hot_deal_ad_01.mp3",
      "hot_deal_ad_02.mp3"
    ]
  },
  {
    "embed": {
      "title": "🎉 Special Offer!",
      "description": "Enjoy exclusive offers and discounts when you sign up today.",
      "color": "#00FF7F"
    },
    "buttons": [
      {
        "label": "Sign Up",
        "style": "LINK",
        "url": "https://example.com/signup"
      },
      {
        "label": "Skip Ad",
        "style": "PRIMARY",
        "custom_id": "ad_skip",
        "emoji": "🤝"
      }
    ],
    "priority": 2,
    "audioFiles": [
      "special_offer_ad_01.mp3"
    ]
  }
]
```


## How It Works

1. **Loading Configurations:**  
   The module reads the JSON file and parses the array of ad configurations. If loading fails, it falls back to a default configuration.

2. **Weighted Random Selection:**  
   The function `getWeightedRandomAdConfig` selects an ad configuration using the `priority` value. This means that ads with higher priority are more likely to be chosen.

3. **Consistent Ad Playback:**  
   Once an ad configuration is selected, the embed (with its buttons) is sent to the text channel using the `sendAdvertisementEmbed` function. This function returns both the sent message and the ad configuration.  
   The function `getRandomAudioFileForAd` is then used to select one audio file from the chosen ad's `audioFiles` array. This ensures that the audio played is associated with the same ad as the embed.


---

## Troubleshooting

- **No Audio File Found:**  
  Ensure that each ad configuration has at least one valid audio file path in its `audioFiles` array. If the file is missing, the ad embed may be sent without corresponding audio.

- **Priority Weighting:**  
  Adjust the `priority` values to control the likelihood of an ad being selected. A higher priority increases the chance that the ad will be played.

- **Button Interactions:**  
  Verify that the `custom_id` for the "Skip Ad" button is set correctly (typically `"ad_skip"`), so that the interaction collector can properly identify and handle the skip action.
