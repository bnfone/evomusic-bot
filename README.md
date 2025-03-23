<p align="center">
  <img src="/.github/_imgages/evomusic.png" height="90px" />
</p>

<h1 align="center"> EvoMusic - A Discord Music Bot</h1>

> This is a fork of the original [EvoBot](https://github.com/eritislami/evobot), a Discord Music Bot built with TypeScript, discord.js & uses Command Handler from [discordjs.guide](https://discordjs.guide). This version includes enhancements and additional features to improve user experience and functionality.

[![Publish Docker Image](https://github.com/bnfone/discord-bot-evomusic/actions/workflows/publish-docker.yml/badge.svg)](https://github.com/bnfone/discord-bot-evomusic/actions/workflows/publish-docker.yml)


## 🌟 Quickstart & Support

Thank you for your support in helping us develop and maintain this bot. We greatly appreciate your understanding and contributions.

If you like this project, consider making a donation.
[Donate 💖](https://bnf.one/devdonations)

You can still choose the amount you wish to donate; every contribution is welcome and appreciated. Thank you for your generosity!

## ⚠️ Known Issues & Alternative Solution

EvoMusic relies on several external dependencies to function correctly, and occasionally, these dependencies may cause issues that temporarily disrupt the bot's functionality. While we actively work to resolve these issues, we understand the inconvenience this may cause.

#### 🛠️ Alternative Music Bot Solution

As an alternative, we recommend trying our lightweight music bot, [Alastor](https://github.com/bnfone/discord-bot-alastor/pkgs/container/discord-bot-alastor). This bot streams music directly from public web-radio streams, ensuring reliable playback without the need for additional integrations.

You can find more details and usage instructions here: [Alastor on GitHub](https://github.com/bnfone/discord-bot-alastor/pkgs/container/discord-bot-alastor).

Feel free to switch between EvoMusic and Alastor depending on your needs!

## 📋 Requirements

1. Discord Bot Token **[Guide](https://discordjs.guide/preparations/setting-up-a-bot-application.html#creating-your-bot)**  
   1.1. Enable 'Message Content Intent' in Discord Developer Portal
2. Spotify Client ID & Secret *-> can be requested at [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
3. Node.js 16.11.0 or newer

## 🛠️ Getting Started

```sh
git clone https://github.com/bnfone/discord-bot-evomusic  # Clone the forked repository
cd discord-bot-evomusic
npm install
```

After installation finishes, follow the configuration instructions and then run `npm run start` to start the bot.

## ⚙️ Configuration

Copy or Rename `config.json.example` to `config.json` and fill out the values:

⚠️ **Note: Never commit or share your token or api keys publicly** ⚠️

```json
{
  "TOKEN": "",  // Your Discord Bot Token
  "SPOTIFY_CLIENT_ID": "",   // Your Spotify Client ID
  "SPOTIFY_CLIENT_SECRET": "", // Your Spotify Client Secret
  "MAX_PLAYLIST_SIZE": 10,
  "PRUNING": false,
  "LOCALE": "en",
  "DEFAULT_VOLUME": 100,
  "STAY_TIME": 30
}
```

## 🐳 Docker Configuration

For those who would prefer to use our Docker container, you may provide values from `config.json` as environment variables.

```shell
docker run -e TOKEN=your_discord_bot_token -e SPOTIFY_CLIENT_ID=your_spotify_client_id -e SPOTIFY_CLIENT_SECRET=your_spotify_client_secret ghcr.io/bnfone/discord-bot-evomusic:latest -d
```

**Docker Compose**

```yml
version: '3.8'

services:
  discord_music_bot:
    image: ghcr.io/bnfone/discord-bot-evomusic:latest
    container_name: discord_music_bot
    environment:
      - TOKEN=your_discord_bot_token
      - SPOTIFY_CLIENT_ID=your_spotify_client_id
      - SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
    restart: always
```

## 📝 Features & Commands

- 🎶 Play music from YouTube, Spotify, and Apple Music via URL
- 🔎 Play music using search queries
- 📃 Play YouTube, Spotify, and Apple Music playlists via URL
- 🔎 Search and select music to play
- 🎛️ Volume control, queue system, loop/repeat, shuffle, and more
- 🎤 Display lyrics for the playing song
- ⏸️ Pause, resume, skip, and stop music playback
- 📱 Media Controls via Buttons
- 🌍 Supports multiple locales

![Preview](/.github/_images/bot-chat.png)

> **Note:** For Spotify and Apple Music integration, the bot converts the provided links to YouTube links before playing, ensuring compatibility and a broader range of music availability. The [Odesli.co API](https://odesli.co) is used for that.


## 🌎 Locales

This fork supports additional locales. For a complete list, please refer to the original repository. If you want to contribute by adding new locales, please check the contributing section.

## 🤝 Contributing to This Fork

1. Clone your fork: `git clone https://github.com/bnfone/discord-bot-evomusic.git`
2. Create your feature branch: `git checkout -b my-new-feature`
3. Commit your changes: `cz` OR `npm run commit` (Avoid using `git commit` directly)
4. Push to the branch: `git push origin my-new-feature`
5. Submit a pull request to the original repository and mention that it's for the forked version.

--- 
**Note:** This fork is maintained separately from the original  [EvoBot](https://github.com/eritislami/evobot). For changes specific to this fork, ensure to target the correct repository when submitting pull requests or issues.




---
ADs:


> Hey there! Quick shoutout — this bot’s open source on GitHub!
If you’re vibin’ with it, hit that ⭐️ on the repo — it really helps out.

Wanna go the extra mile? Type /donate to chip in for server costs.

Keeping this bot running takes time and money, so every bit of support means the world.

You rock — thanks for being here! 

--


Hey! Just a quick shoutout — this bot is open source on GitHub!
If you like the vibes, drop a star on the repo — it helps a lot.

Wanna support the project even more? Type slash donate to help cover server costs.

Building and running this thing takes time and money, so every bit means the world.

Thanks for being awesome!


--

Yo! Real quick — this bot’s open source on GitHub!
If you’re diggin’ it, drop a star on the repo — every bit counts.

Feelin’ extra cool? Type slash donate to help keep the servers alive.

Takes time and cash to keep this thing running, so any support’s super appreciated.

You’re the best — thanks for hangin’ out!

--

Hey hey! Just so you know — this bot’s fully open source on GitHub!
If you’re feelin’ the tunes, go smash that star — helps more than you think.

Wanna show some extra love? Hit up slash donate and keep the lights on.

Servers ain’t free and coding takes time, so any support is mad appreciated.

Y’all are legends — thanks for the vibes! 