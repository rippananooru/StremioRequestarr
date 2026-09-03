import express from "express";

import {
  getRadarrMovieByImdbId,
  getRadarrQueueForMovie,
} from "./radarr.js";

import {
  getSonarrSeriesByImdbId,
  getSonarrEpisodes,
  getSonarrQueueForSeries,
  getSonarrEpisodeFile,
} from "./sonarr.js";

export function registerStatusRoutes(app: express.Application) {
/*
 * ============================================================
 * STATUS — MOVIE
 * ============================================================
 */
app.get(
  "/status/movie/:imdbId",
  async (req, res) => {
    const imdbId = req.params.imdbId;

    try {
      const movie =
        await getRadarrMovieByImdbId(imdbId);

      /*
       * Movie does not exist in Radarr yet.
       */
      if (!movie) {
        res.json({
          status: "NOT REQUESTED",
          message: "",
          done: true,
        });

        return;
      }

      /*
       * Movie has been successfully imported.
       */
      if (movie.hasFile) {
        const quality =
          movie.movieFile?.quality?.quality?.name ?? "";

        let status = "AVAILABLE";

        if (quality.includes("2160")) {
          status = "AVAILABLE • 2160p";
        } else if (quality.includes("1080")) {
          status = "AVAILABLE • 1080p";
        } else if (quality.includes("720")) {
          status = "AVAILABLE • 720p";
        }

        res.json({
          status,
          message: "Download complete.",
          done: true,
        });

        return;
      }

      const queueItem =
        await getRadarrQueueForMovie(movie.id);

      /*
       * Radarr is waiting to import or currently importing.
       */
      if (
        queueItem?.trackedDownloadState ===
        "importPending" ||
        queueItem?.trackedDownloadState ===
        "importing"
      ) {
        res.json({
          status: "IMPORTING",
          message:
            queueItem.trackedDownloadState ===
              "importPending"
              ? "Waiting for Radarr to import the movie..."
              : "Radarr is importing the movie...",
          done: false,
        });

        return;
      }

      /*
       * Movie is actively downloading.
       */
      if (
        queueItem?.trackedDownloadState ===
        "downloading"
      ) {
        const progress =
          queueItem.size > 0
            ? Math.round(
              ((queueItem.size -
                queueItem.sizeleft) /
                queueItem.size) *
              100
            )
            : 0;

        res.json({
          status: `DOWNLOADING • ${progress}%`,
          message: queueItem.timeleft
            ? `Time remaining: ${queueItem.timeleft}`
            : "Downloading...",
          done: false,
        });

        return;
      }

      /*
       * Movie exists in Radarr but is not
       * currently downloading.
       */
      res.json({
        status: "QUEUED",
        message:
          "Waiting for download to start...",
        done: false,
      });
    } catch (error) {
      console.error(
        "Status check failed:",
        error
      );

      res.status(500).json({
        status: "ERROR",
        message: "Unable to check Radarr.",
        done: false,
      });
    }
  }
);

/*
 * ============================================================
 * STATUS — TV
 * ============================================================
 */
app.get(
  "/status/tv/:imdbId/:season/:episode",
  async (req, res) => {
    const imdbId = req.params.imdbId;
    const season = Number(req.params.season);
    const episodeNumber =
      Number(req.params.episode);

    try {
      const series =
        await getSonarrSeriesByImdbId(imdbId);

      /*
       * Series does not exist in Sonarr yet.
       */
      if (!series) {
        res.json({
          status: "NOT REQUESTED",
          message: "",
          done: true,
        });

        return;
      }

      const episodes =
        await getSonarrEpisodes(series.id);

      const episode = episodes.find(
        (item) =>
          item.seasonNumber === season &&
          item.episodeNumber === episodeNumber
      );

      /*
       * Episode has been successfully imported.
       */
      if (
        episode?.hasFile &&
        episode.episodeFileId
      ) {
        const episodeFile =
          await getSonarrEpisodeFile(
            episode.episodeFileId
          );

        const quality =
          episodeFile.quality?.quality?.name ?? "";

        let status = "AVAILABLE";

        if (quality.includes("2160")) {
          status = "AVAILABLE • 2160p";
        } else if (quality.includes("1080")) {
          status = "AVAILABLE • 1080p";
        } else if (quality.includes("720")) {
          status = "AVAILABLE • 720p";
        }

        res.json({
          status,
          message: "Download complete.",
          done: true,
        });

        return;
      }

      const queueItems =
        await getSonarrQueueForSeries(series.id);

      const queueItem = queueItems.find(
        (item) =>
          item.episodeId === episode?.id
      );

      /*
       * Sonarr is waiting to import or
       * currently importing.
       */
      if (
        queueItem?.trackedDownloadState ===
        "importPending" ||
        queueItem?.trackedDownloadState ===
        "importing"
      ) {
        res.json({
          status: "IMPORTING",
          message:
            queueItem.trackedDownloadState ===
              "importPending"
              ? "Waiting for Sonarr to import the episode..."
              : "Sonarr is importing the episode...",
          done: false,
        });

        return;
      }

      /*
       * Episode is actively downloading.
       */
      if (
        queueItem?.trackedDownloadState ===
        "downloading"
      ) {
        const progress =
          queueItem.size > 0
            ? Math.round(
              ((queueItem.size -
                queueItem.sizeleft) /
                queueItem.size) *
              100
            )
            : 0;

        res.json({
          status: `DOWNLOADING • ${progress}%`,
          message: queueItem.timeleft
            ? `Time remaining: ${queueItem.timeleft}`
            : "Downloading...",
          done: false,
        });

        return;
      }

      /*
       * Episode exists in Sonarr but is not
       * currently downloading.
       */
      res.json({
        status: "QUEUED",
        message:
          "Waiting for download to start...",
        done: false,
      });
    } catch (error) {
      console.error(
        "TV status check failed:",
        error
      );

      res.status(500).json({
        status: "ERROR",
        message: "Unable to check Sonarr.",
        done: false,
      });
    }
  }
);
}