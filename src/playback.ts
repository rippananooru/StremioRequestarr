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

const MEDIA_ROOT =
    process.env.MEDIA_ROOT || "/media";

/*
 * ============================================================
 * COMMON HELPERS
 * ============================================================
 */

function getContentType(
    filePath: string
): string {
    const ext =
        path.extname(filePath).toLowerCase();

    switch (ext) {
        case ".mp4":
            return "video/mp4";

        case ".mkv":
            return "video/x-matroska";

        case ".webm":
            return "video/webm";

        case ".avi":
            return "video/x-msvideo";

        case ".mov":
            return "video/quicktime";

        default:
            return "application/octet-stream";
    }
}

function isPathInside(
    filePath: string,
    rootPath: string
): boolean {
    const resolvedFile =
        path.resolve(filePath);

    const resolvedRoot =
        path.resolve(rootPath);

    return (
        resolvedFile === resolvedRoot ||
        resolvedFile.startsWith(
            `${resolvedRoot}${path.sep}`
        )
    );
}

function parseRange(
    range: string | undefined,
    fileSize: number
): {
    start: number;
    end: number;
} | null {
    if (!range) {
        return {
            start: 0,
            end: fileSize - 1,
        };
    }

    const match =
        range.match(
            /^bytes=(\d*)-(\d*)$/
        );

    if (!match) {
        return null;
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
        return null;
    }

    return {
        start,
        end,
    };
}

/*
 * ============================================================
 * LOCAL FILE STREAMING
 * ============================================================
 *
 * This is the only actual media streaming logic.
 *
 * Files must already have been imported by Radarr/Sonarr.
 *
 * No qBittorrent interaction happens here.
 * No downloading happens here.
 */

async function streamLocalFile(
    req: express.Request,
    res: express.Response,
    filePath: string
): Promise<void> {
    let stat: fs.Stats;

    try {
        stat =
            await fs.promises.stat(
                filePath
            );
    } catch {
        res.status(404).send(
            "Media file not found"
        );
        return;
    }

    if (!stat.isFile()) {
        res.status(404).send(
            "Media file not found"
        );
        return;
    }

    const fileSize =
        stat.size;

    if (fileSize <= 0) {
        res.status(404).send(
            "Media file is empty"
        );
        return;
    }

    const range =
        parseRange(
            req.headers.range,
            fileSize
        );

    if (!range) {
        res.status(416).setHeader(
            "Content-Range",
            `bytes */${fileSize}`
        );

        res.end();
        return;
    }

    const {
        start,
        end,
    } = range;

    const chunkSize =
        end - start + 1;

    res.setHeader(
        "Content-Type",
        getContentType(filePath)
    );

    res.setHeader(
        "Accept-Ranges",
        "bytes"
    );

    res.setHeader(
        "Cache-Control",
        "no-cache"
    );

    /*
     * --------------------------------------------------------
     * NORMAL RESPONSE
     * --------------------------------------------------------
     */

    if (!req.headers.range) {
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
     * --------------------------------------------------------
     * RANGE RESPONSE
     * --------------------------------------------------------
     */

    res.status(206);

    res.setHeader(
        "Content-Range",
        `bytes ${start}-${end}/${fileSize}`
    );

    res.setHeader(
        "Content-Length",
        chunkSize
    );

    const fileStream =
        fs.createReadStream(
            filePath,
            {
                start,
                end,
            }
        );

    fileStream.on(
        "error",
        (error) => {
            console.error(
                "Media file stream error:",
                error
            );

            if (!res.headersSent) {
                res.status(500).send(
                    "Unable to read media file"
                );
            } else {
                res.destroy(error);
            }
        }
    );

    fileStream.pipe(res);
}

/*
 * ============================================================
 * PLAYBACK — TV / ANIME
 * ============================================================
 */

export function registerPlaybackRoutes(
    app: express.Application
) {
    app.get(
        "/play/tv/:imdbId/:season/:episode",
        async (req, res) => {
            const imdbId =
                req.params.imdbId;

            const season =
                Number(
                    req.params.season
                );

            const episodeNumber =
                Number(
                    req.params.episode
                );

            if (
                !Number.isInteger(season) ||
                season < 0 ||
                !Number.isInteger(episodeNumber) ||
                episodeNumber <= 0
            ) {
                res.status(400).send(
                    "Invalid season or episode"
                );

                return;
            }

            try {
                /*
                 * ------------------------------------------------
                 * FIND SERIES IN SONARR
                 * ------------------------------------------------
                 */

                const series =
                    await getSonarrSeriesByImdbId(
                        imdbId
                    );

                if (!series) {
                    res.status(404).send(
                        "Series not found"
                    );

                    return;
                }

                /*
                 * ------------------------------------------------
                 * FIND EPISODE
                 * ------------------------------------------------
                 */

                const episodes =
                    await getSonarrEpisodes(
                        series.id
                    );

                const episode =
                    episodes.find(
                        (item) =>
                            item.seasonNumber ===
                                season &&
                            item.episodeNumber ===
                                episodeNumber
                    );

                if (!episode) {
                    res.status(404).send(
                        "Episode not found"
                    );

                    return;
                }

                /*
                 * ------------------------------------------------
                 * REQUIRE IMPORTED FILE
                 * ------------------------------------------------
                 *
                 * We deliberately do NOT look for a qBittorrent
                 * download here.
                 *
                 * If Sonarr has not imported the episode yet,
                 * playback simply isn't available.
                 */

                if (
                    !episode.hasFile ||
                    !episode.episodeFileId
                ) {
                    res.status(404).send(
                        "Episode is not available"
                    );

                    return;
                }

                /*
                 * ------------------------------------------------
                 * GET SONARR FILE
                 * ------------------------------------------------
                 */

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

                /*
                 * ------------------------------------------------
                 * DETERMINE MEDIA ROOT
                 * ------------------------------------------------
                 *
                 * Sonarr paths:
                 *
                 *   /tv/...
                 *   /anime/...
                 *
                 * Local addon paths:
                 *
                 *   /media/Shows/...
                 *   /media/Anime/...
                 */

                let mediaCategory:
                    | "Shows"
                    | "Anime";

                let sonarrRoot:
                    | "/tv/"
                    | "/anime/";

                if (
                    sonarrPath.startsWith(
                        "/tv/"
                    )
                ) {
                    mediaCategory =
                        "Shows";

                    sonarrRoot =
                        "/tv/";
                } else if (
                    sonarrPath.startsWith(
                        "/anime/"
                    )
                ) {
                    mediaCategory =
                        "Anime";

                    sonarrRoot =
                        "/anime/";
                } else {
                    console.error(
                        `Unexpected Sonarr path: ${sonarrPath}`
                    );

                    res.status(500).send(
                        "Invalid Sonarr media path"
                    );

                    return;
                }

                /*
                 * ------------------------------------------------
                 * MAP SONARR PATH TO LOCAL MEDIA PATH
                 * ------------------------------------------------
                 */

                const relativePath =
                    sonarrPath.substring(
                        sonarrRoot.length
                    );

                const filePath =
                    path.resolve(
                        MEDIA_ROOT,
                        mediaCategory,
                        relativePath
                    );

                const mediaRoot =
                    path.resolve(
                        MEDIA_ROOT,
                        mediaCategory
                    );

                /*
                 * ------------------------------------------------
                 * PATH TRAVERSAL PROTECTION
                 * ------------------------------------------------
                 */

                if (
                    !isPathInside(
                        filePath,
                        mediaRoot
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

                /*
                 * ------------------------------------------------
                 * VERIFY FILE
                 * ------------------------------------------------
                 */

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

                await streamLocalFile(
                    req,
                    res,
                    filePath
                );
            } catch (error) {
                console.error(
                    "TV playback failed:",
                    error
                );

                if (!res.headersSent) {
                    res.status(500).send(
                        "Unable to play episode"
                    );
                } else {
                    res.destroy();
                }
            }
        }
    );

    /*
     * ========================================================
     * PLAYBACK — MOVIE
     * ========================================================
     */

    app.get(
        "/play/movie/:imdbId",
        async (req, res) => {
            const imdbId =
                req.params.imdbId;

            try {
                /*
                 * ------------------------------------------------
                 * FIND MOVIE IN RADARR
                 * ------------------------------------------------
                 */

                const movie =
                    await getRadarrMovieByImdbId(
                        imdbId
                    );

                if (!movie) {
                    res.status(404).send(
                        "Movie not found"
                    );

                    return;
                }

                /*
                 * ------------------------------------------------
                 * REQUIRE IMPORTED FILE
                 * ------------------------------------------------
                 *
                 * No qBittorrent fallback.
                 *
                 * If Radarr has not imported the movie,
                 * playback is unavailable.
                 */

                if (
                    !movie.hasFile ||
                    !movie.movieFile?.path
                ) {
                    res.status(404).send(
                        "Movie is not available"
                    );

                    return;
                }

                const radarrPath =
                    movie.movieFile.path;

                /*
                 * ------------------------------------------------
                 * RADARR MEDIA PATH
                 * ------------------------------------------------
                 *
                 * Radarr sees:
                 *
                 *   /movies/...
                 *
                 * Addon sees:
                 *
                 *   /media/Movies/...
                 * ------------------------------------------------
                 */

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

                const movieRoot =
                    path.resolve(
                        MEDIA_ROOT,
                        "Movies"
                    );

                const filePath =
                    path.resolve(
                        movieRoot,
                        relativePath
                    );

                /*
                 * ------------------------------------------------
                 * PATH TRAVERSAL PROTECTION
                 * ------------------------------------------------
                 */

                if (
                    !isPathInside(
                        filePath,
                        movieRoot
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

                /*
                 * ------------------------------------------------
                 * STREAM COMPLETED MOVIE
                 * ------------------------------------------------
                 */

                console.log(
                    `Movie playback: ${movie.title} -> ${filePath}`
                );

                await streamLocalFile(
                    req,
                    res,
                    filePath
                );
            } catch (error) {
                console.error(
                    "Movie playback failed:",
                    error
                );

                if (!res.headersSent) {
                    res.status(500).send(
                        "Unable to play movie"
                    );
                } else {
                    res.destroy();
                }
            }
        }
    );
}