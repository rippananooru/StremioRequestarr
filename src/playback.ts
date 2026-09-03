import express from "express";
import fs from "node:fs";
import path from "node:path";

import {
  getRadarrMovieByImdbId,
} from "./radarr.js";

import {
  getSonarrSeriesByImdbId,
  getSonarrEpisodes,
  getSonarrEpisodeFile,
} from "./sonarr.js";

const MEDIA_ROOT = process.env.MEDIA_ROOT || "/media";

export function registerPlaybackRoutes(
  app: express.Application
) {
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
      const episodeNumber =
        Number(req.params.episode);

      try {
        const series =
          await getSonarrSeriesByImdbId(imdbId);

        if (!series) {
          res.status(404).send("Series not found");
          return;
        }

        const episodes =
          await getSonarrEpisodes(series.id);

        const episode = episodes.find(
          (item) =>
            item.seasonNumber === season &&
            item.episodeNumber === episodeNumber
        );

        if (
          !episode?.hasFile ||
          !episode.episodeFileId
        ) {
          res.status(404).send(
            "Episode file not found"
          );
          return;
        }

        const episodeFile =
          await getSonarrEpisodeFile(
            episode.episodeFileId
          );

        if (!episodeFile.path) {
          res.status(404).send(
            "Episode file path not found"
          );
          return;
        }

        const sonarrPath =
          episodeFile.path;

        if (!sonarrPath.startsWith("/tv/")) {
          throw new Error(
            `Unexpected Sonarr TV path: ${sonarrPath}`
          );
        }

        const relativePath =
          sonarrPath.substring("/tv/".length);

        const filePath = path.resolve(
          MEDIA_ROOT,
          "Shows",
          relativePath
        );

        const mediaRoot =
          path.resolve(MEDIA_ROOT);

        if (
          filePath !== mediaRoot &&
          !filePath.startsWith(
            `${mediaRoot}${path.sep}`
          )
        ) {
          console.error(
            `Blocked path traversal: ${filePath}`
          );

          res.status(403).send("Forbidden");
          return;
        }

        console.log(
          `TV playback: ${series.title} S${String(
            season
          ).padStart(
            2,
            "0"
          )}E${String(
            episodeNumber
          ).padStart(
            2,
            "0"
          )} -> ${filePath}`
        );

        const stat =
          await fs.promises.stat(filePath);

        if (!stat.isFile()) {
          res.status(404).send(
            "Episode file not found"
          );
          return;
        }

        const fileSize = stat.size;

        res.setHeader(
          "Content-Type",
          "video/x-matroska"
        );

        res.setHeader(
          "Accept-Ranges",
          "bytes"
        );

        const range =
          req.headers.range;

        if (!range) {
          res.setHeader(
            "Content-Length",
            fileSize
          );

          fs.createReadStream(
            filePath
          ).pipe(res);

          return;
        }

        const match =
          range.match(
            /^bytes=(\d*)-(\d*)$/
          );

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

        const chunkSize =
          end - start + 1;

        res.status(206);

        res.setHeader(
          "Content-Range",
          `bytes ${start}-${end}/${fileSize}`
        );

        res.setHeader(
          "Content-Length",
          chunkSize
        );

        fs.createReadStream(
          filePath,
          {
            start,
            end,
          }
        ).pipe(res);
      } catch (error) {
        console.error(
          "TV playback failed:",
          error
        );

        if (!res.headersSent) {
          res.status(500).send(
            "Unable to play episode"
          );
        }
      }
    }
  );

  /*
   * ============================================================
   * PLAYBACK — MOVIE
   * ============================================================
   */
  app.get(
    "/play/movie/:imdbId",
    async (req, res) => {
      const imdbId =
        req.params.imdbId;

      try {
        const movie =
          await getRadarrMovieByImdbId(
            imdbId
          );

        if (
          !movie ||
          !movie.hasFile ||
          !movie.movieFile?.path
        ) {
          res.status(404).send(
            "Movie file not available"
          );
          return;
        }

        /*
         * Radarr uses /movies inside
         * its container.
         */
        const radarrPath =
          movie.movieFile.path;

        if (
          !radarrPath.startsWith(
            "/movies/"
          )
        ) {
          console.error(
            `Unexpected Radarr movie path: ${radarrPath}`
          );

          res.status(500).send(
            "Invalid movie path"
          );
          return;
        }

        const relativePath =
          radarrPath.substring(
            "/movies/".length
          );

        const filePath =
          path.resolve(
            MEDIA_ROOT,
            "Movies",
            relativePath
          );

        const mediaRoot =
          path.resolve(MEDIA_ROOT);

        /*
         * Prevent path traversal outside
         * the media directory.
         */
        console.log(
          `Movie playback: ${movie.title} -> ${filePath}`
        );
        if (
          filePath !== mediaRoot &&
          !filePath.startsWith(
            `${mediaRoot}${path.sep}`
          )
        ) {
          console.error(
            `Blocked path traversal: ${filePath}`
          );

          res.status(403).send(
            "Forbidden"
          );
          return;
        }

        const stat =
          await fs.promises.stat(
            filePath
          );

        if (!stat.isFile()) {
          res.status(404).send(
            "Movie file not found"
          );
          return;
        }

        const fileSize =
          stat.size;

        const range =
          req.headers.range;

        const ext =
          path.extname(
            filePath
          ).toLowerCase();

        const contentType =
          ext === ".mp4"
            ? "video/mp4"
            : ext === ".mkv"
              ? "video/x-matroska"
              : ext === ".webm"
                ? "video/webm"
                : "application/octet-stream";

        res.setHeader(
          "Content-Type",
          contentType
        );

        res.setHeader(
          "Accept-Ranges",
          "bytes"
        );

        /*
         * No Range header:
         * stream the entire file.
         */
        if (!range) {
          res.setHeader(
            "Content-Length",
            fileSize
          );

          fs.createReadStream(
            filePath
          ).pipe(res);

          return;
        }

        /*
         * Parse a standard single
         * HTTP byte range.
         */
        const match =
          range.match(
            /^bytes=(\d*)-(\d*)$/
          );

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

        const chunkSize =
          end - start + 1;

        res.status(206);

        res.setHeader(
          "Content-Range",
          `bytes ${start}-${end}/${fileSize}`
        );

        res.setHeader(
          "Content-Length",
          chunkSize
        );

        fs.createReadStream(
          filePath,
          {
            start,
            end,
          }
        ).pipe(res);
      } catch (error) {
        console.error(
          "Playback failed:",
          error
        );

        if (!res.headersSent) {
          res.status(500).send(
            "Unable to play movie"
          );
        }
      }
    }
  );
}