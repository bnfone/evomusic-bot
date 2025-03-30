import requests
from bs4 import BeautifulSoup
import json
import re

def get_song_data(song_url):
    """
    Ruft die Song-Seite ab und extrahiert Titel und Künstler aus dem JSON-LD-Script.
    Die Song-ID wird extrahiert, um eine standardisierte URL zu erzeugen.
    """
    # Extrahiere Song-ID aus der URL (optional mit Slug davor)
    match = re.search(r'/song/(?:[^/]+/)?(\d+)', song_url)
    if not match:
        return "Unbekannt", "Unbekannt", song_url

    song_id = match.group(1)
    standardized_url = f"https://music.apple.com/de/song/{song_id}"
    headers = {"User-Agent": "Mozilla/5.0"}
    try:
        r = requests.get(standardized_url, headers=headers)
        r.encoding = 'utf-8'
        s = BeautifulSoup(r.text, "html.parser")
        json_script = s.find("script", {"id": "schema:song", "type": "application/ld+json"})
        if not json_script:
            return "Unbekannt", "Unbekannt", standardized_url

        data = json.loads(json_script.string)
        title = data.get("name", "Unbekannt")
        artist = "Unbekannt"
        # Extrahiere den Künstler aus data["audio"]["byArtist"]
        if "audio" in data and "byArtist" in data["audio"]:
            artists = data["audio"]["byArtist"]
            if isinstance(artists, list) and len(artists) > 0:
                artist = artists[0].get("name", "Unbekannt")
        return title, artist, standardized_url
    except Exception as e:
        print(f"Fehler beim Abrufen von {standardized_url}: {e}")
        return "Unbekannt", "Unbekannt", standardized_url

def get_playlist_data(playlist_url):
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/122.0.0.0 Safari/537.36"
        )
    }
    res = requests.get(playlist_url, headers=headers)
    res.encoding = 'utf-8'
    if res.status_code != 200:
        print("❌ Fehler beim Laden der Playlist-Seite.")
        return

    soup = BeautifulSoup(res.text, "html.parser")

    # Playlist-Titel aus meta[name="apple:title"]
    title_tag = soup.select_one('meta[name="apple:title"]')
    playlist_title = title_tag["content"] if title_tag else "Unbekannter Titel"

    # Playlist-Ersteller direkt aus dem <title>-Tag extrahieren
    title_text = soup.title.get_text(strip=True) if soup.title else ""
    # Entferne eventuelle BOM-Zeichen:
    title_text = title_text.replace("\ufeff", "")
    if " by " in title_text and " - Apple Music" in title_text:
        playlist_creator = title_text.split(" by ")[1].split(" - Apple Music")[0].strip()
    else:
        playlist_creator = "Unbekannter Ersteller"

    url_tag = soup.select_one('meta[property="og:url"]')
    canonical_url = url_tag["content"] if url_tag else playlist_url

    print(f"Playlist Name: {playlist_title}")
    print(f"Playlist Creator: {playlist_creator}")
    print(f"Playlist URL: {canonical_url}")
    print("Playlist Songs:")

    # Sammle alle Song-URLs und zugehörige Tracknummern
    song_tags = soup.find_all("meta", {"property": "music:song"})
    track_tags = soup.find_all("meta", {"property": "music:song:track"})

    if not song_tags or not track_tags:
        print("❗️Keine Songs gefunden.")
        return

    # Erstelle Liste mit Dicts: { "track": Nummer, "url": Song-URL }
    songs = []
    # Wir gehen davon aus, dass die Tags in der richtigen Reihenfolge vorliegen:
    for song_tag, track_tag in zip(song_tags, track_tags):
        song_url = song_tag.get("content", "").split("?")[0]
        try:
            track = int(track_tag.get("content", "0"))
        except ValueError:
            track = 0
        songs.append({"track": track, "url": song_url})

    # Sortiere Songs nach Tracknummer
    songs.sort(key=lambda s: s["track"])

    # Für jeden Song: Daten abrufen und ausgeben (inkl. URL in Klammern)
    for song in songs:
        title, artist, std_url = get_song_data(song["url"])
        print(f"- {title} - {artist} ({std_url})")

if __name__ == "__main__":
    playlist_input = input("Playlist URL: ").strip()
    get_playlist_data(playlist_input)