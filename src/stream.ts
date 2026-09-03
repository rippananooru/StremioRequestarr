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
}
