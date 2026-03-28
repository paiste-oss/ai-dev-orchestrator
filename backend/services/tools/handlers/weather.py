"""Handler für Wetter-Tools via OpenWeatherMap API."""
from __future__ import annotations
from typing import Any


async def _handle_weather(tool_name: str, tool_input: dict) -> Any:
    import httpx
    from core.config import settings

    api_key = settings.OPENWEATHER_API_KEY
    if not api_key:
        return {"error": "OPENWEATHER_API_KEY nicht konfiguriert"}

    if tool_name == "get_current_weather":
        city = tool_input.get("city", "").strip()
        units = tool_input.get("units", "metric")
        lang = tool_input.get("lang", "de")

        if not city:
            return {"error": "Stadt fehlt"}

        url = "https://api.openweathermap.org/data/2.5/weather"
        params = {"q": city, "appid": api_key, "units": units, "lang": lang}

        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(url, params=params)

        if r.status_code == 404:
            return {"error": f"Stadt '{city}' nicht gefunden"}
        if not r.is_success:
            return {"error": f"OpenWeather Fehler {r.status_code}"}

        d = r.json()
        unit_symbol = "°C" if units == "metric" else "°F" if units == "imperial" else "K"
        wind_unit = "m/s" if units != "imperial" else "mph"

        return {
            "city": d["name"],
            "country": d["sys"]["country"],
            "condition": d["weather"][0]["description"],
            "temperature": f"{round(d['main']['temp'])}{unit_symbol}",
            "feels_like": f"{round(d['main']['feels_like'])}{unit_symbol}",
            "temp_min": f"{round(d['main']['temp_min'])}{unit_symbol}",
            "temp_max": f"{round(d['main']['temp_max'])}{unit_symbol}",
            "humidity": f"{d['main']['humidity']}%",
            "wind_speed": f"{d['wind']['speed']} {wind_unit}",
            "wind_direction_deg": d["wind"].get("deg"),
            "visibility_km": round(d.get("visibility", 0) / 1000, 1),
            "cloudiness": f"{d['clouds']['all']}%",
            "sunrise": _fmt_unix(d["sys"]["sunrise"], d["timezone"]),
            "sunset": _fmt_unix(d["sys"]["sunset"], d["timezone"]),
        }

    if tool_name == "get_weather_forecast":
        city = tool_input.get("city", "").strip()
        days = min(int(tool_input.get("days", 3)), 5)
        units = tool_input.get("units", "metric")
        lang = tool_input.get("lang", "de")

        if not city:
            return {"error": "Stadt fehlt"}

        url = "https://api.openweathermap.org/data/2.5/forecast"
        params = {"q": city, "appid": api_key, "units": units, "lang": lang, "cnt": days * 8}

        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(url, params=params)

        if r.status_code == 404:
            return {"error": f"Stadt '{city}' nicht gefunden"}
        if not r.is_success:
            return {"error": f"OpenWeather Fehler {r.status_code}"}

        d = r.json()
        unit_symbol = "°C" if units == "metric" else "°F" if units == "imperial" else "K"

        # Gruppiere nach Tag (Mittagszeit bevorzugt)
        by_day: dict[str, dict] = {}
        for item in d["list"]:
            from datetime import datetime, timezone
            dt = datetime.fromtimestamp(item["dt"], tz=timezone.utc)
            day_key = dt.strftime("%Y-%m-%d")
            hour = dt.hour
            # bevorzuge 12:00-15:00 Uhr Eintrag für den Tag
            if day_key not in by_day or abs(hour - 12) < abs(by_day[day_key]["_hour"] - 12):
                by_day[day_key] = {
                    "_hour": hour,
                    "date": day_key,
                    "condition": item["weather"][0]["description"],
                    "temp": f"{round(item['main']['temp'])}{unit_symbol}",
                    "temp_min": f"{round(item['main']['temp_min'])}{unit_symbol}",
                    "temp_max": f"{round(item['main']['temp_max'])}{unit_symbol}",
                    "humidity": f"{item['main']['humidity']}%",
                    "wind_speed": f"{item['wind']['speed']} m/s",
                    "rain_prob": f"{round(item.get('pop', 0) * 100)}%",
                }

        forecast = []
        for entry in list(by_day.values())[:days]:
            entry.pop("_hour", None)
            forecast.append(entry)

        return {
            "city": d["city"]["name"],
            "country": d["city"]["country"],
            "forecast": forecast,
        }

    return {"error": f"Unbekanntes Tool: {tool_name}"}


def _fmt_unix(ts: int, tz_offset: int) -> str:
    from datetime import datetime, timezone, timedelta
    dt = datetime.fromtimestamp(ts, tz=timezone(timedelta(seconds=tz_offset)))
    return dt.strftime("%H:%M")
