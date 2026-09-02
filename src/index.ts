
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { addonBuilder, getRouter } from "stremio-addon-sdk";
import express from "express";

import {
  getRadarrMovieByImdbId,
  addMovieToRadarr,
  getRadarrQueueForMovie,
} from "./radarr.js";

import {
  getSonarrSeries,
  getSonarrSeriesByImdbId,
  getSonarrEpisodes,
  getSonarrQueueForSeries,
  getSonarrEpisodeFile,
  addSeriesToSonarr,
} from "./sonarr.js";

const manifest = {
  id: "com.nooru.stremiorequestarr",
  version: "0.1.0",
  name: "StremioRequestarr",
  description: "Request movies and TV shows from Stremio using the Arr stack.",
  resources: [
    "catalog",
    "meta",
    {
      name: "stream",
      types: ["movie", "series"],
      idPrefixes: ["tt"],
    },
  ],
  types: ["movie", "series"],
  catalogs: [
    {
      type: "series",
      id: "local-series",
      name: "Local Series",
    },
  ],
};

const builder = new addonBuilder(manifest);

/*
 * Sonarr local-series catalog
 */
builder.defineCatalogHandler(async ({ type, id }) => {
  console.log(`Catalog request: ${type} ${id}`);

  if (type !== "series" || id !== "local-series") {
    return {
      metas: [],
    };
  }

  const series = await getSonarrSeries();

  return {
    metas: series.map((item) => ({
      id: item.imdbId ?? `sonarr-${item.id}`,
      type: "series",
      name: item.title,
    })),
  };
});

/*
 * Sonarr metadata
 */
builder.defineMetaHandler(async ({ type, id }) => {
  console.log(`Meta request: ${type} ${id}`);

  if (type !== "series") {
    return {
      meta: null,
    };
  }

  const series = await getSonarrSeriesByImdbId(id);

  if (!series) {
    return {
      meta: null,
    };
  }

  const episodes = await getSonarrEpisodes(series.id);

  return {
    meta: {
      id,
      type: "series",
      name: series.title,
      videos: episodes.map((episode) => ({
        id: `${id}:${episode.seasonNumber}:${episode.episodeNumber}`,
        title: episode.title,
        season: episode.seasonNumber,
        number: episode.episodeNumber,
      })),
    },
  };
});
/*
 * Stremio stream handler
 *
 * Determines the current Radarr/Sonarr status
 * and returns the appropriate Stremio stream option.
 */
builder.defineStreamHandler(async ({ type, id }) => {
  console.log(`Stream request: ${type} ${id}`);

  /*
   * ============================================================
   * TV / SERIES
   * ============================================================
   */
  if (type === "series") {
    const parts = id.split(":");

    if (parts.length !== 3) {
      return {
        streams: [],
      };
    }

    const [imdbId, seasonText, episodeText] = parts;

    const season = Number(seasonText);
    const episodeNumber = Number(episodeText);

    const series =
      await getSonarrSeriesByImdbId(imdbId);

    /*
     * Series is not in Sonarr yet.
     */
    if (!series) {
      return {
        streams: [
          {
            name: "StremioRequestarr",
            title: "NOT REQUESTED",
            externalUrl:
              `${PUBLIC_BASE_URL}/request/tv/${imdbId}/${season}/${episodeNumber}`,
          },
        ],
      };
    }

    const episodes =
      await getSonarrEpisodes(series.id);

    const episode = episodes.find(
      (item) =>
        item.seasonNumber === season &&
        item.episodeNumber === episodeNumber
    );

    if (!episode) {
      return {
        streams: [],
      };
    }

    /*
     * Episode is available.
     */
    if (episode.hasFile && episode.episodeFileId) {
      const episodeFile =
        await getSonarrEpisodeFile(
          episode.episodeFileId
        );

      const quality =
        episodeFile.quality?.quality?.name ?? "";

      let title = "AVAILABLE";

      if (quality.includes("2160")) {
        title = "AVAILABLE • 2160p";
      } else if (quality.includes("1080")) {
        title = "AVAILABLE • 1080p";
      } else if (quality.includes("720")) {
        title = "AVAILABLE • 720p";
      }

      return {
        streams: [
          {
            name: "StremioRequestarr",
            title,
            url:
              `${PUBLIC_BASE_URL}/play/tv/${imdbId}/${season}/${episodeNumber}`,
          },
        ],
      };
    }

    const queueItems =
      await getSonarrQueueForSeries(series.id);

    const queueItem = queueItems.find(
      (item) =>
        item.episodeId === episode.id
    );

    /*
     * Episode is importing.
     */
    if (
      queueItem?.trackedDownloadState ===
      "importPending" ||
      queueItem?.trackedDownloadState ===
      "importing"
    ) {
      return {
        streams: [
          {
            name: "StremioRequestarr",
            title: "IMPORTING",
            externalUrl:
              `${PUBLIC_BASE_URL}/request/tv/${imdbId}/${season}/${episodeNumber}`,
          },
        ],
      };
    }

    /*
     * Episode is downloading.
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

      return {
        streams: [
          {
            name: "StremioRequestarr",
            title:
              `DOWNLOADING • ${progress}%`,
            externalUrl:
              `${PUBLIC_BASE_URL}/request/tv/${imdbId}/${season}/${episodeNumber}`,
          },
        ],
      };
    }

    /*
     * Episode is queued.
     */
    return {
      streams: [
        {
          name: "StremioRequestarr",
          title: "QUEUED",
          externalUrl:
            `${PUBLIC_BASE_URL}/request/tv/${imdbId}/${season}/${episodeNumber}`,
        },
      ],
    };
  }

  /*
   * ============================================================
   * MOVIE
   * ============================================================
   */
  const movie =
    await getRadarrMovieByImdbId(id);

  let title = "NOT REQUESTED";

  if (movie?.hasFile) {
    const quality =
      movie.movieFile?.quality?.quality?.name ?? "";

    if (quality.includes("2160")) {
      title = "AVAILABLE • 2160p";
    } else if (quality.includes("1080")) {
      title = "AVAILABLE • 1080p";
    } else if (quality.includes("720")) {
      title = "AVAILABLE • 720p";
    } else {
      title = "AVAILABLE";
    }
  } else if (movie) {
    const queueItem =
      await getRadarrQueueForMovie(movie.id);

    if (
      queueItem?.trackedDownloadState ===
      "importPending" ||
      queueItem?.trackedDownloadState ===
      "importing"
    ) {
      title = "IMPORTING";
    } else if (
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

      title =
        `DOWNLOADING • ${progress}%`;
    } else if (movie.monitored) {
      title = "QUEUED";
    }
  }

  const stream = {
    name: "StremioRequestarr",
    title,
    ...(movie?.hasFile
      ? {
        url:
          `${PUBLIC_BASE_URL}/play/movie/${id}`,
      }
      : {
        externalUrl:
          `${PUBLIC_BASE_URL}/request/movie/${id}`,
      }),
  };

  return {
    streams: [stream],
  };
});
/*
 * Shared request/status HTML page.
 *
 * The page itself is user-facing.
 * It polls the JSON status endpoint every 3 seconds.
 */
function requestStatusPage(options: {
  title: string;
  statusUrl: string;
  initialStatus: string;
  initialMessage: string;
}) {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">

        <title>StremioRequestarr</title>

        <style>
          * {
            box-sizing: border-box;
          }

          body {
            margin: 0;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;

            background: #111;
            color: #fff;

            font-family:
              -apple-system,
              BlinkMacSystemFont,
              "Segoe UI",
              Roboto,
              sans-serif;

            text-align: center;
          }

          .container {
            width: 90%;
            max-width: 600px;
            padding: 40px 30px;
          }

          .logo {
            font-size: 18px;
            font-weight: 600;
            opacity: 0.6;
            margin-bottom: 35px;
          }

          #status {
            margin: 0 0 20px;
            font-size: 32px;
            font-weight: 700;
          }

          .title {
            font-size: 20px;
            font-weight: 500;
            margin-bottom: 14px;
          }

          #message {
            margin: 0;
            font-size: 16px;
            opacity: 0.6;
          }

          .loading {
            width: 28px;
            height: 28px;
            margin: 30px auto 0;

            border: 3px solid rgba(255,255,255,0.15);
            border-top-color: rgba(255,255,255,0.8);
            border-radius: 50%;

            animation: spin 1s linear infinite;
          }

          @keyframes spin {
            to {
              transform: rotate(360deg);
            }
          }

          @media (max-width: 600px) {
            #status {
              font-size: 26px;
            }

            .title {
              font-size: 18px;
            }
          }
        </style>
      </head>

      <body>
        <div class="container">

          <div class="logo">
            StremioRequestarr
          </div>

          <h1 id="status">
            ${options.initialStatus}
          </h1>

          <div class="title">
            ${options.title}
          </div>

          <p id="message">
            ${options.initialMessage}
          </p>

          <div class="loading" id="loading"></div>

        </div>

        <script>
          async function updateStatus() {
            try {
              const response = await fetch(
                "${options.statusUrl}",
                { cache: "no-store" }
              );

              const data = await response.json();

              document.getElementById("status").textContent =
                data.status;

              document.getElementById("message").textContent =
                data.message;

              if (data.done) {
                document.getElementById("loading").style.display = "none";
                clearInterval(timer);
              }

            } catch (error) {
              console.error("Status update failed:", error);

              document.getElementById("message").textContent =
                "Unable to check status.";
            }
          }

          updateStatus();

          const timer = setInterval(updateStatus, 3000);
        </script>
      </body>
    </html>
  `;
}

const port = Number(process.env.PORT) || 7000;

const app = express();

const MEDIA_ROOT = "/media/movies";
const PUBLIC_BASE_URL =
  process.env.BASE_URL || "http://127.0.0.1:7000";

/*
 * ============================================================
 * PLAYBACK — TV
 * ============================================================
 */
app.get(
  "/play/tv/:imdbId/:season/:episode",
  async (req, res) => {
    const imdbId = req.params.imdbId;
    const season = Number(req.params.season);
    const episodeNumber = Number(req.params.episode);

    try {
      const series = await getSonarrSeriesByImdbId(imdbId);

      if (!series) {
        res.status(404).send("Series not found");
        return;
      }

      const episodes = await getSonarrEpisodes(series.id);

      const episode = episodes.find(
        (item) =>
          item.seasonNumber === season &&
          item.episodeNumber === episodeNumber
      );

      if (!episode?.hasFile || !episode.episodeFileId) {
        res.status(404).send("Episode file not found");
        return;
      }

      const episodeFile = await getSonarrEpisodeFile(
        episode.episodeFileId
      );

      if (!episodeFile.path) {
        res.status(404).send("Episode file path not found");
        return;
      }

      const sonarrPath = episodeFile.path;

      if (!sonarrPath) {
        throw new Error("Sonarr episode file has no path");
      }

      if (!sonarrPath.startsWith("/tv/")) {
        throw new Error(`Unexpected Sonarr TV path: ${sonarrPath}`);
      }

      const relativePath = sonarrPath.substring("/tv/".length);
      const filePath = path.resolve("/media/tv", relativePath);

      console.log(
        `TV playback: ${series.title} S${String(season).padStart(
          2,
          "0"
        )}E${String(episodeNumber).padStart(
          2,
          "0"
        )} -> ${filePath}`
      );

      const stat = await fs.promises.stat(filePath);
      const fileSize = stat.size;

      res.setHeader("Content-Type", "video/x-matroska");
      res.setHeader("Accept-Ranges", "bytes");

      const range = req.headers.range;

      if (!range) {
        res.setHeader("Content-Length", fileSize);

        fs.createReadStream(filePath).pipe(res);

        return;
      }

      const match = range.match(/bytes=(\d*)-(\d*)/);

      if (!match) {
        res.status(416).end();
        return;
      }

      const start = match[1]
        ? Number(match[1])
        : fileSize - Number(match[2]);

      const end = match[2]
        ? Number(match[2])
        : fileSize - 1;

      if (
        start < 0 ||
        start >= fileSize ||
        end < start ||
        end >= fileSize
      ) {
        res.status(416).end();
        return;
      }

      res.status(206);

      res.setHeader(
        "Content-Range",
        `bytes ${start}-${end}/${fileSize}`
      );

      res.setHeader(
        "Content-Length",
        end - start + 1
      );

      fs.createReadStream(filePath, {
        start,
        end,
      }).pipe(res);
    } catch (error) {
      console.error("TV playback failed:", error);

      res.status(500).send("Unable to play episode");
    }
  }
);

/*
 * ============================================================
 * PLAYBACK — MOVIE
 * ============================================================
 */
app.get("/play/movie/:imdbId", async (req, res) => {
  const imdbId = req.params.imdbId;

  try {
    const movie = await getRadarrMovieByImdbId(imdbId);

    if (!movie || !movie.hasFile || !movie.movieFile?.path) {
      res.status(404).send("Movie file not available");
      return;
    }

    /*
     * Radarr uses /movies inside its container.
     * StremioRequestarr uses /media/movies.
     */
    const radarrPath = movie.movieFile.path;

    if (!radarrPath.startsWith("/movies/")) {
      console.error(
        `Unexpected Radarr movie path: ${radarrPath}`
      );

      res.status(500).send("Invalid movie path");
      return;
    }

    const relativePath =
      radarrPath.substring("/movies/".length);

    const filePath = path.resolve(
      MEDIA_ROOT,
      relativePath
    );

    const mediaRoot = path.resolve(MEDIA_ROOT);

    /*
     * Prevent path traversal outside the media directory.
     */
    if (
      filePath !== mediaRoot &&
      !filePath.startsWith(`${mediaRoot}${path.sep}`)
    ) {
      console.error(
        `Blocked path traversal: ${filePath}`
      );

      res.status(403).send("Forbidden");
      return;
    }

    const stat = await fs.promises.stat(filePath);

    if (!stat.isFile()) {
      res.status(404).send("Movie file not found");
      return;
    }

    const fileSize = stat.size;
    const range = req.headers.range;

    const ext = path.extname(filePath).toLowerCase();

    const contentType =
      ext === ".mp4"
        ? "video/mp4"
        : ext === ".mkv"
          ? "video/x-matroska"
          : ext === ".webm"
            ? "video/webm"
            : "application/octet-stream";

    res.setHeader("Content-Type", contentType);
    res.setHeader("Accept-Ranges", "bytes");

    /*
     * No Range header:
     * stream the entire file.
     */
    if (!range) {
      res.setHeader("Content-Length", fileSize);

      fs.createReadStream(filePath).pipe(res);

      return;
    }

    /*
     * Parse a standard single HTTP byte range.
     *
     * Example:
     * bytes=1000000-
     */
    const match =
      range.match(/^bytes=(\d*)-(\d*)$/);

    if (!match) {
      res.status(416).setHeader(
        "Content-Range",
        `bytes */${fileSize}`
      );

      res.end();
      return;
    }

    const start = match[1]
      ? Number(match[1])
      : 0;

    const requestedEnd = match[2]
      ? Number(match[2])
      : fileSize - 1;

    const end = Math.min(
      requestedEnd,
      fileSize - 1
    );

    if (
      start < 0 ||
      start >= fileSize ||
      end < start
    ) {
      res.status(416).setHeader(
        "Content-Range",
        `bytes */${fileSize}`
      );

      res.end();
      return;
    }

    const chunkSize = end - start + 1;

    res.status(206);

    res.setHeader(
      "Content-Range",
      `bytes ${start}-${end}/${fileSize}`
    );

    res.setHeader(
      "Content-Length",
      chunkSize
    );

    fs.createReadStream(filePath, {
      start,
      end,
    }).pipe(res);
  } catch (error) {
    console.error("Playback failed:", error);

    if (!res.headersSent) {
      res.status(500).send("Unable to play movie");
    }
  }
});

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

/*
 * ============================================================
 * REQUEST — MOVIE
 * ============================================================
 */
app.get(
  "/request/movie/:imdbId",
  async (req, res) => {
    const imdbId = req.params.imdbId;

    try {
      const existingMovie =
        await getRadarrMovieByImdbId(imdbId);

      /*
       * Movie already exists in Radarr.
       */
      if (existingMovie) {
        /*
         * Already available.
         */
        if (existingMovie.hasFile) {
          const quality =
            existingMovie.movieFile?.quality?.quality?.name ??
            "";

          let qualityText = "AVAILABLE";

          if (quality.includes("2160")) {
            qualityText = "AVAILABLE • 2160p";
          } else if (quality.includes("1080")) {
            qualityText = "AVAILABLE • 1080p";
          } else if (quality.includes("720")) {
            qualityText = "AVAILABLE • 720p";
          }

          res.send(
            requestStatusPage({
              title: existingMovie.title,
              statusUrl:
                `/status/movie/${imdbId}`,
              initialStatus: qualityText,
              initialMessage:
                "Download complete.",
            })
          );

          return;
        }

        /*
         * Movie exists but is not available yet.
         */
        res.send(
          requestStatusPage({
            title: existingMovie.title,
            statusUrl:
              `/status/movie/${imdbId}`,
            initialStatus: "CHECKING...",
            initialMessage:
              "Checking Radarr status...",
          })
        );

        return;
      }

      /*
       * Movie does not exist in Radarr.
       *
       * Add it and start the search.
       */
      const movie =
        await addMovieToRadarr(imdbId);

      res.send(
        requestStatusPage({
          title: movie.title,
          statusUrl:
            `/status/movie/${imdbId}`,
          initialStatus: "QUEUED",
          initialMessage:
            "Added to Radarr and search started.",
        })
      );
    } catch (error) {
      console.error(
        "Request failed:",
        error
      );

      res.status(500).send(`
        <html>
          <body>
            <h1>ERROR</h1>
            <p>Failed to request movie.</p>
          </body>
        </html>
      `);
    }
  }
);

/*
 * ============================================================
 * REQUEST — TV
 * ============================================================
 */
app.get(
  "/request/tv/:imdbId/:season/:episode",
  async (req, res) => {
    const imdbId = req.params.imdbId;
    const season = Number(req.params.season);
    const episodeNumber =
      Number(req.params.episode);

    try {
      const existingSeries =
        await getSonarrSeriesByImdbId(imdbId);

      /*
       * Series already exists in Sonarr.
       */
      if (existingSeries) {
        const episodes =
          await getSonarrEpisodes(
            existingSeries.id
          );

        const episode = episodes.find(
          (item) =>
            item.seasonNumber === season &&
            item.episodeNumber === episodeNumber
        );

        /*
         * Episode already available.
         */
        if (episode?.hasFile) {
          res.send(
            requestStatusPage({
              title:
                `${existingSeries.title} • S${String(
                  season
                ).padStart(
                  2,
                  "0"
                )}E${String(
                  episodeNumber
                ).padStart(
                  2,
                  "0"
                )}`,
              statusUrl:
                `/status/tv/${imdbId}/${season}/${episodeNumber}`,
              initialStatus: "AVAILABLE",
              initialMessage:
                "Episode available.",
            })
          );

          return;
        }

        /*
         * Series exists but episode is not
         * available yet.
         */
        res.send(
          requestStatusPage({
            title:
              `${existingSeries.title} • S${String(
                season
              ).padStart(
                2,
                "0"
              )}E${String(
                episodeNumber
              ).padStart(
                2,
                "0"
              )}`,
            statusUrl:
              `/status/tv/${imdbId}/${season}/${episodeNumber}`,
            initialStatus: "CHECKING...",
            initialMessage:
              "Checking Sonarr status...",
          })
        );

        return;
      }

      /*
       * Series does not exist in Sonarr.
       *
       * Add the series and start the search.
       */
      const series =
        await addSeriesToSonarr(imdbId);

      res.send(
        requestStatusPage({
          title:
            `${series.title} • S${String(
              season
            ).padStart(
              2,
              "0"
            )}E${String(
              episodeNumber
            ).padStart(
              2,
              "0"
            )}`,
          statusUrl:
            `/status/tv/${imdbId}/${season}/${episodeNumber}`,
          initialStatus: "QUEUED",
          initialMessage:
            "Added to Sonarr and search started.",
        })
      );
    } catch (error) {
      console.error(
        "TV request failed:",
        error
      );

      res.status(500).send(`
        <html>
          <body>
            <h1>ERROR</h1>
            <p>Failed to request episode.</p>
          </body>
        </html>
      `);
    }
  }
);

/*
 * ============================================================
 * STREMIO ADDON ROUTES
 * ============================================================
 */
app.use(
  getRouter(builder.getInterface())
);

/*
 * ============================================================
 * START SERVER
 * ============================================================
 */
app.listen(port, () => {
  console.log(
    `StremioRequestarr running on port ${port}`
  );
});
