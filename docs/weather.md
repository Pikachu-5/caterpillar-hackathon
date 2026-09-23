# Demo and live weather

Mode is selected per active session through the environment API. Demo mode uses explicit values; live mode fetches Open-Meteo for a configured geographic location. The dashboard must show requested mode, provider, observed_at/fetched_at and freshness. The site map remains local meters and has no implicit GPS position.

Use current temperature_2m, precipitation, wind_speed_10m and weather_code with explicit unit parameters (Celsius, mm, km/h) and timezone=UTC. Normalize provider timestamps into RFC3339 UTC. Fetch server-side at most once per location per 10 minutes; cap retries/timeouts and reuse cached data. No browser secret is needed for the noncommercial endpoint. Credit Open-Meteo and its data sources in the UI; check current terms when implementing.

Classification for the limited historical labels: precipitation >0 → Rainy; otherwise configured wind threshold reached → Windy; otherwise clear/mainly-clear weather codes (0/1) → Sunny; overcast/partly-cloudy (2/3) → Cloudy; unsupported/snow/fog/storm conditions → Unknown with raw weather_code retained. Unknown live categories must not be silently mapped into a trained historical class; show out-of-distribution/limited ETA when necessary.

Soil type and moisture remain explicit demo/operator inputs in v1 and are labeled separately. Regional rain does not establish excavator-site soil moisture. Weather fetch failure yields stale last-known values, or null/unavailable when no cache exists; never fabricate Sunny weather. Changing modes creates a new immutable environment_id and broadcasts settings to the publisher/dashboard.

References: [API](https://open-meteo.com/en/docs), [terms](https://open-meteo.com/en/terms).
