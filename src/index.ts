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

const manifest = {
  id: "com.nooru.stremiorequestarr",
  version: "0.1.0",
  name: "StremioRequestarr",
  description: "Request movies and TV shows from Stremio using the Arr stack.",
  resources: [
    {
      name: "stream",
      types: ["movie"],
      idPrefixes: ["tt"],
    },
  ],
  types: ["movie", "series"],
  catalogs: [],
};

const builder = new addonBuilder(manifest);

/*
 * Stremio stream handler
 *
 * Determines the current Radarr status and displays it
 * as a Stremio stream option.
 */
builder.defineStreamHandler(async ({ type, id }) => {
  console.log(`Stream request: ${type} ${id}`);

  const movie = await getRadarrMovieByImdbId(id);

  let title = "NOT REQUESTED";

  if (movie?.hasFile) {
    const quality = movie.movieFile?.quality?.quality?.name ?? "";

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
    const queueItem = await getRadarrQueueForMovie(movie.id);

    if (
      queueItem?.trackedDownloadState === "importPending" ||
      queueItem?.trackedDownloadState === "importing"
    ) {
      title = "IMPORTING";
    } else if (queueItem?.trackedDownloadState === "downloading") {
      const progress =
        queueItem.size > 0
          ? Math.round(
              ((queueItem.size - queueItem.sizeleft) / queueItem.size) * 100
            )
          : 0;

      title = `DOWNLOADING • ${progress}%`;
    } else if (movie.monitored) {
      title = "QUEUED";
    }
  }

  const stream = {
    name: "StremioRequestarr",
    title,
    ...(movie?.hasFile
      ? {
          url: `${PUBLIC_BASE_URL}/play/movie/${id}`,
        }
      : {
          externalUrl: `${PUBLIC_BASE_URL}/request/movie/${id}`,
        }),
  };

  return {
    streams: [stream],
  };
});

const port = Number(process.env.PORT) || 7000;

const app = express();

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
      console.error(`Unexpected Radarr movie path: ${radarrPath}`);
      res.status(500).send("Invalid movie path");
      return;
    }

    const relativePath = radarrPath.substring("/movies/".length);

    const filePath = path.resolve(MEDIA_ROOT, relativePath);
    const mediaRoot = path.resolve(MEDIA_ROOT);

    /*
     * Prevent path traversal outside the media directory.
     */
    if (
      filePath !== mediaRoot &&
      !filePath.startsWith(`${mediaRoot}${path.sep}`)
    ) {
      console.error(`Blocked path traversal: ${filePath}`);
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

    res.setHeader("Content-Type", "video/x-matroska");
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
    const match = range.match(/^bytes=(\d*)-(\d*)$/);

    if (!match) {
      res.status(416).setHeader(
        "Content-Range",
        `bytes */${fileSize}`
      );
      res.end();
      return;
    }

    const start = match[1] ? Number(match[1]) : 0;
    const requestedEnd = match[2]
      ? Number(match[2])
      : fileSize - 1;

    const end = Math.min(requestedEnd, fileSize - 1);

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

    res.setHeader("Content-Length", chunkSize);

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

const MEDIA_ROOT = "/media/movies";
const PUBLIC_BASE_URL =
  process.env.BASE_URL || "http://127.0.0.1:7000";
/*
 * Live status endpoint
 *
 * The request page polls this endpoint every 3 seconds.
 */
app.get("/status/movie/:imdbId", async (req, res) => {
  const imdbId = req.params.imdbId;

  try {
    const movie = await getRadarrMovieByImdbId(imdbId);

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

    const queueItem = await getRadarrQueueForMovie(movie.id);

    /*
     * Radarr is waiting to import or currently importing.
     *
     * This is important because during the transition from
     * downloading -> importing, Radarr may temporarily report
     * that the movie is no longer downloading.
     */
    if (
      queueItem?.trackedDownloadState === "importPending" ||
      queueItem?.trackedDownloadState === "importing"
    ) {
      res.json({
        status: "IMPORTING",
        message:
          queueItem.trackedDownloadState === "importPending"
            ? "Waiting for Radarr to import the movie..."
            : "Radarr is importing the movie...",
        done: false,
      });

      return;
    }

    /*
     * Movie is actively downloading.
     */
    if (queueItem?.trackedDownloadState === "downloading") {
      const progress =
        queueItem.size > 0
          ? Math.round(
              ((queueItem.size - queueItem.sizeleft) /
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
     * Movie exists in Radarr but is not currently downloading.
     */
    res.json({
      status: "QUEUED",
      message: "Waiting for download to start...",
      done: false,
    });
  } catch (error) {
    console.error("Status check failed:", error);

    res.status(500).json({
      status: "ERROR",
      message: "Unable to check Radarr.",
      done: false,
    });
  }
});

/*
 * Request page
 *
 * This page is opened when the user clicks the
 * StremioRequestarr stream option.
 */
app.get("/request/movie/:imdbId", async (req, res) => {
  const imdbId = req.params.imdbId;

  try {
    const existingMovie = await getRadarrMovieByImdbId(imdbId);

    /*
     * Movie already exists in Radarr.
     */
    if (existingMovie) {
      /*
       * Already available.
       */
      if (existingMovie.hasFile) {
        const quality =
          existingMovie.movieFile?.quality?.quality?.name ?? "";

        let qualityText = "AVAILABLE";

        if (quality.includes("2160")) {
          qualityText = "AVAILABLE • 2160p";
        } else if (quality.includes("1080")) {
          qualityText = "AVAILABLE • 1080p";
        } else if (quality.includes("720")) {
          qualityText = "AVAILABLE • 720p";
        }

        res.send(`
          <html>
            <body>
              <h1 id="status">${qualityText}</h1>
              <p>${existingMovie.title}</p>
              <p id="message">Download complete.</p>
            </body>
          </html>
        `);

        return;
      }

      /*
       * Movie is not available yet.
       *
       * Show the current state and start polling.
       */
      res.send(`
        <html>
          <body>
            <h1 id="status">CHECKING...</h1>
            <p>${existingMovie.title}</p>
            <p id="message">Checking Radarr status...</p>

            <script>
              async function updateStatus() {
                try {
                  const response = await fetch(
                    "/status/movie/${imdbId}",
                    { cache: "no-store" }
                  );

                  const data = await response.json();

                  document.getElementById("status").textContent =
                    data.status;

                  document.getElementById("message").textContent =
                    data.message;

                  if (data.done) {
                    clearInterval(timer);
                  }
                } catch (error) {
                  console.error("Status update failed:", error);
                }
              }

              updateStatus();

              const timer = setInterval(updateStatus, 3000);
            </script>
          </body>
        </html>
      `);

      return;
    }

    /*
     * Movie does not exist in Radarr.
     *
     * Add it and start the search.
     */
    const movie = await addMovieToRadarr(imdbId);

    res.send(`
      <html>
        <body>
          <h1 id="status">QUEUED</h1>
          <p>${movie.title}</p>
          <p id="message">Added to Radarr and search started.</p>

          <script>
            async function updateStatus() {
              try {
                const response = await fetch(
                  "/status/movie/${imdbId}",
                  { cache: "no-store" }
                );

                const data = await response.json();

                document.getElementById("status").textContent =
                  data.status;

                document.getElementById("message").textContent =
                  data.message;

                if (data.done) {
                  clearInterval(timer);
                }
              } catch (error) {
                console.error("Status update failed:", error);
              }
            }

            updateStatus();

            const timer = setInterval(updateStatus, 3000);
          </script>
        </body>
      </html>
    `);
  } catch (error) {
    console.error("Request failed:", error);

    res.status(500).send(`
      <html>
        <body>
          <h1>ERROR</h1>
          <p>Failed to request movie.</p>
        </body>
      </html>
    `);
  }
});

/*
 * Stremio addon routes
 */
app.use(getRouter(builder.getInterface()));

/*
 * Start server
 */
app.listen(port, () => {
  console.log(`StremioRequestarr running on port ${port}`);
});