# StremioRequestarr

```
services:
  stremio-requestarr:
    build:
      context: https://github.com/rippananooru/StremioRequestarr.git
    container_name: stremio-requestarr
    ports:
      - 7000:7000
    environment:
      - RADARR_URL=${RADARR_URL}
      - RADARR_API_KEY=${RADARR_API_KEY}
      - RADARR_QUALITY_PROFILE_ID=${RADARR_QUALITY_PROFILE_ID}
      - SONARR_URL=${SONARR_URL}
      - SONARR_API_KEY=${SONARR_API_KEY}
      - SONARR_QUALITY_PROFILE_ID=${SONARR_QUALITY_PROFILE_ID}
      - BASE_URL=${BASE_URL}
    volumes:
      - ${MOVIE}:/media/movies:ro
      - ${TV}:/media/tv:ro
    restart: unless-stopped
networks: {}
```
