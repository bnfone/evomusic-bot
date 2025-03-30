import requests
from bs4 import BeautifulSoup
import json
from urllib.parse import urlparse, parse_qs

def scrape_song_info_from_jsonld(url: str):
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
            " AppleWebKit/537.36 (KHTML, like Gecko)"
            " Chrome/111.0.0.0 Safari/537.36"
        )
    }

    # 1. Seite abrufen
    resp = requests.get(url, headers=headers)
    if resp.status_code != 200:
        print(f"Fehler: {resp.status_code}")
        return None, None, None

    soup = BeautifulSoup(resp.text, "html.parser")

    # 2. JSON-LD-Script finden
    script_tag = soup.find("script", {"id": "schema:song", "type": "application/ld+json"})
    if not script_tag:
        print("JSON-LD-Script nicht gefunden.")
        return None, None, None

    # 3. JSON laden
    try:
        data = json.loads(script_tag.string)
    except json.JSONDecodeError as e:
        print("Fehler beim Parsen von JSON:", e)
        return None, None, None

    # 4. Songtitel extrahieren
    song_title = data.get("name")

    # 5. Künstler extrahieren
    artist = None
    audio = data.get("audio")
    if isinstance(audio, dict):
        by_artist = audio.get("byArtist")
        if isinstance(by_artist, list) and len(by_artist) > 0:
            artist_data = by_artist[0]
            if isinstance(artist_data, dict):
                artist = artist_data.get("name")

    # 6. Song-Link konvertieren
    parsed_url = urlparse(url)
    query = parse_qs(parsed_url.query)
    song_id = query.get("i", [None])[0]

    if song_id:
        # Baue URL nach gewünschtem Format: /<country>/song/<id>
        country_code = parsed_url.path.split("/")[1] if len(parsed_url.path.split("/")) > 1 else "us"
        song_url = f"https://music.apple.com/{country_code}/song/{song_id}"
    else:
        song_url = url  # Falls keine ID vorhanden ist

    return song_title, artist, song_url

def main():
    url = input("Song-URL eingeben:\n> ").strip()
    title, artist, new_url = scrape_song_info_from_jsonld(url)

    print("\n----- ERGEBNIS -----")
    print("Songtitel:", title if title else "(nicht gefunden)")
    print("Künstler:", artist if artist else "(nicht gefunden)")
    print("Song-Link:", new_url if new_url else "(nicht gefunden)")

if __name__ == "__main__":
    main()