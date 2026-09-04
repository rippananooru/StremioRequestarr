import {
    getRadarrMovieByImdbId,
    getRadarrQueueForMovie,
    addMovieToRadarr,
} from "./radarr.js";

import {
    getSonarrSeriesByImdbId,
    getSonarrEpisodes,
    getSonarrQueueForSeries,
    getSonarrEpisodeFile,
    addSeriesToSonarr,
} from "./sonarr.js";

import {
    AddonBuilder,
} from "stremio-addon-sdk";

const PUBLIC_BASE_URL =
    process.env.BASE_URL || "http://127.0.0.1:7000";

export function registerStreamHandler(
    builder: AddonBuilder
) {
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

            const [
                imdbId,
                seasonText,
                episodeText,
            ] = parts;

            const season = Number(seasonText);
            const episodeNumber =
                Number(episodeText);
            console.log(
                `TV episode requested: ${imdbId} S${String(season).padStart(2, "0")}E${String(episodeNumber).padStart(2, "0")}`
            );
            if (
                !Number.isInteger(season) ||
                !Number.isInteger(episodeNumber)
            ) {
                return {
                    streams: [],
                };
            }

            /*
             * --------------------------------------------------------
             * Find series in Sonarr
             * --------------------------------------------------------
             */
            let series =
                await getSonarrSeriesByImdbId(
                    imdbId
                );

            /*
             * --------------------------------------------------------
             * Series is not in Sonarr yet.
             *
             * Request it now, then return the native playback URL.
             *
             * This is important for Chromecast / Google TV because
             * externalUrl would open a browser.
             * --------------------------------------------------------
             */
            if (!series) {
                console.log(
                    `Series not found in Sonarr: ${imdbId}`
                );

                try {
                    series =
                        await addSeriesToSonarr(
                            imdbId
                        );

                    console.log(
                        `Series requested in Sonarr: ${imdbId}`
                    );
                } catch (error) {
                    console.error(
                        "Unable to request series:",
                        error
                    );

                    /*
                     * Even if the request failed, return the native
                     * playback URL. The player will receive an error
                     * rather than opening an external browser.
                     */
                }

                return {
                    streams: [
                        {
                            name: "StremioRequestarr",
                            title: "NOT REQUESTED",
                            url:
                                `${PUBLIC_BASE_URL}/play/tv/${imdbId}/${season}/${episodeNumber}`,
                        },
                    ],
                };
            }

            /*
             * --------------------------------------------------------
             * Find requested episode
             * --------------------------------------------------------
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
                /*
                 * The series exists but Sonarr has not exposed the
                 * requested episode yet.
                 */
                return {
                    streams: [
                        {
                            name: "StremioRequestarr",
                            title: "QUEUED",
                            url:
                                `${PUBLIC_BASE_URL}/play/tv/${imdbId}/${season}/${episodeNumber}`,
                        },
                    ],
                };
            }

            /*
             * --------------------------------------------------------
             * Episode is available.
             * --------------------------------------------------------
             */
            if (
                episode.hasFile &&
                episode.episodeFileId
            ) {
                const episodeFile =
                    await getSonarrEpisodeFile(
                        episode.episodeFileId
                    );

                const quality =
                    episodeFile.quality
                        ?.quality
                        ?.name ?? "";

                let title = "AVAILABLE";

                if (
                    quality.includes("2160")
                ) {
                    title =
                        "AVAILABLE • 2160p";
                } else if (
                    quality.includes("1080")
                ) {
                    title =
                        "AVAILABLE • 1080p";
                } else if (
                    quality.includes("720")
                ) {
                    title =
                        "AVAILABLE • 720p";
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

            /*
             * --------------------------------------------------------
             * Check Sonarr queue.
             * --------------------------------------------------------
             */
            const queueItems =
                await getSonarrQueueForSeries(
                    series.id
                );

            const queueItem =
                queueItems.find(
                    (item) =>
                        item.episodeId ===
                        episode.id
                );

            /*
             * --------------------------------------------------------
             * Episode is importing.
             * --------------------------------------------------------
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
                            url:
                                `${PUBLIC_BASE_URL}/play/tv/${imdbId}/${season}/${episodeNumber}`,
                        },
                    ],
                };
            }

            /*
             * --------------------------------------------------------
             * Episode is downloading.
             * --------------------------------------------------------
             */
            if (
                queueItem?.trackedDownloadState ===
                "downloading"
            ) {
                const progress =
                    queueItem.size > 0
                        ? Math.round(
                            (
                                (
                                    queueItem.size -
                                    queueItem.sizeleft
                                ) /
                                queueItem.size
                            ) * 100
                        )
                        : 0;

                return {
                    streams: [
                        {
                            name: "StremioRequestarr",
                            title:
                                `DOWNLOADING • ${progress}%`,
                            url:
                                `${PUBLIC_BASE_URL}/play/tv/${imdbId}/${season}/${episodeNumber}`,
                        },
                    ],
                };
            }

            /*
             * --------------------------------------------------------
             * Episode is queued.
             * --------------------------------------------------------
             */
            return {
                streams: [
                    {
                        name: "StremioRequestarr",
                        title: "QUEUED",
                        url:
                            `${PUBLIC_BASE_URL}/play/tv/${imdbId}/${season}/${episodeNumber}`,
                    },
                ],
            };
        }

        /*
         * ============================================================
         * MOVIE
         * ============================================================
         */

        let movie =
            await getRadarrMovieByImdbId(id);

        /*
         * ------------------------------------------------------------
         * Movie is not in Radarr yet.
         *
         * Request it now and return the native playback URL.
         * ------------------------------------------------------------
         */
        if (!movie) {
            console.log(
                `Movie not found in Radarr: ${id}`
            );

            try {
                movie =
                    await addMovieToRadarr(id);

                console.log(
                    `Movie requested in Radarr: ${id}`
                );
            } catch (error) {
                console.error(
                    "Unable to request movie:",
                    error
                );
            }

            return {
                streams: [
                    {
                        name: "StremioRequestarr",
                        title: "NOT REQUESTED",
                        url:
                            `${PUBLIC_BASE_URL}/play/movie/${id}`,
                    },
                ],
            };
        }

        /*
         * ------------------------------------------------------------
         * Determine movie status.
         * ------------------------------------------------------------
         */

        let title = "NOT REQUESTED";

        /*
         * Movie is available.
         */
        if (movie.hasFile) {
            const quality =
                movie.movieFile
                    ?.quality
                    ?.quality
                    ?.name ?? "";

            if (
                quality.includes("2160")
            ) {
                title =
                    "AVAILABLE • 2160p";
            } else if (
                quality.includes("1080")
            ) {
                title =
                    "AVAILABLE • 1080p";
            } else if (
                quality.includes("720")
            ) {
                title =
                    "AVAILABLE • 720p";
            } else {
                title = "AVAILABLE";
            }
        } else {
            /*
             * --------------------------------------------------------
             * Check Radarr queue.
             * --------------------------------------------------------
             */
            const queueItem =
                await getRadarrQueueForMovie(
                    movie.id
                );

            /*
             * Movie is importing.
             */
            if (
                queueItem?.trackedDownloadState ===
                "importPending" ||
                queueItem?.trackedDownloadState ===
                "importing"
            ) {
                title = "IMPORTING";
            }

            /*
             * Movie is downloading.
             */
            else if (
                queueItem?.trackedDownloadState ===
                "downloading"
            ) {
                const progress =
                    queueItem.size > 0
                        ? Math.round(
                            (
                                (
                                    queueItem.size -
                                    queueItem.sizeleft
                                ) /
                                queueItem.size
                            ) * 100
                        )
                        : 0;

                title =
                    `DOWNLOADING • ${progress}%`;
            }

            /*
             * Movie has been added to Radarr but the download
             * has not started yet.
             */
            else if (
                movie.monitored
            ) {
                title = "QUEUED";
            }
        }

        /*
         * ------------------------------------------------------------
         * ALWAYS return a native playback URL.
         *
         * Never use externalUrl here.
         * ------------------------------------------------------------
         */
        return {
            streams: [
                {
                    name: "StremioRequestarr",
                    title,
                    url:
                        `${PUBLIC_BASE_URL}/play/movie/${id}`,
                },
            ],
        };
    });
}