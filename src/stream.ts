import {
    getRadarrMovieByImdbId,
    getRadarrQueueForMovie,
} from "./radarr.js";

import {
    getSonarrSeriesByImdbId,
    getSonarrEpisodes,
    getSonarrQueueForSeries,
} from "./sonarr.js";

const PUBLIC_BASE_URL =
    process.env.BASE_URL ||
    "http://127.0.0.1:7000";

/*
 * IMPORTANT
 *
 * This stream handler is READ-ONLY.
 *
 * It never calls:
 *
 *   addMovieToRadarr()
 *   addSeriesToSonarr()
 *
 * Requests are performed by request.ts.
 */

function buildWidgetUrl(
    params: Record<string, string>
): string {
    const query =
        new URLSearchParams(params);

    return `${PUBLIC_BASE_URL}/widget/player?${query.toString()}`;
}

function getWidget(
    title: string,
    status: string,
    progress = 0,
    requestUrl?: string
) {
    const params: Record<string, string> = {
        title,
        status,
        progress: String(progress),
    };

    if (requestUrl) {
        params.requestUrl =
            requestUrl;
    }

    return {
        widgetPlayer:
            buildWidgetUrl(params),

        widgetPlayerStates: [
            "loading",
            "buffering",
        ],
    };
}

function getRequestUrl(
    type: "movie" | "series",
    imdbId: string,
    season?: number,
    episode?: number
): string {
    if (type === "movie") {
        return `${PUBLIC_BASE_URL}/request/movie/${encodeURIComponent(
            imdbId
        )}`;
    }

    return `${PUBLIC_BASE_URL}/request/tv/${encodeURIComponent(
        imdbId
    )}/${season}/${episode}`;
}

/*
 * This must be a real video URL because the Stremio SDK
 * requires a stream target for a selectable stream.
 *
 * playback.ts will provide a tiny placeholder video.
 */
function getPlaceholderUrl(): string {
    return `${PUBLIC_BASE_URL}/playback-placeholder`;
}

function getMovieQuality(
    movie: Awaited<
        ReturnType<
            typeof getRadarrMovieByImdbId
        >
    >
): string {
    return (
        movie?.movieFile
            ?.quality
            ?.quality
            ?.name ??
        "Unknown"
    );
}

function getQueueProgress(
    item: {
        size: number;
        sizeleft: number;
    }
): number {
    if (
        item.size > 0 &&
        typeof item.sizeleft === "number"
    ) {
        return Math.max(
            0,
            Math.min(
                1,
                1 -
                item.sizeleft /
                item.size
            )
        );
    }

    return 0;
}

function getQueueStatus(
    item: {
        status: string;
        trackedDownloadState?: string;
    }
): string {
    const status =
        item.status?.toLowerCase() ?? "";

    const tracked =
        item.trackedDownloadState
            ?.toLowerCase() ?? "";

    if (
        status.includes("import") ||
        status.includes("move") ||
        status.includes("copy") ||
        tracked.includes("import")
    ) {
        return "IMPORTING";
    }

    if (
        status.includes("download")
    ) {
        return "DOWNLOADING";
    }

    return "QUEUED";
}

export function registerStreamHandler(
    builder: any
) {
    builder.defineStreamHandler(
        async ({
            type,
            id,
        }: {
            type: string;
            id: string;
        }) => {
            console.log(
                `Stream request: ${type} ${id}`
            );

            /*
             * ============================================================
             * SERIES
             * ============================================================
             */

            if (type === "series") {
                const parts =
                    id.split(":");

                const imdbId =
                    parts[0];

                const season =
                    Number(parts[1]);

                const episode =
                    Number(parts[2]);

                if (
                    !imdbId ||
                    !Number.isInteger(
                        season
                    ) ||
                    season < 0 ||
                    !Number.isInteger(
                        episode
                    ) ||
                    episode <= 0
                ) {
                    return {
                        streams: [],
                    };
                }

                /*
                 * Check Sonarr.
                 */

                const series =
                    await getSonarrSeriesByImdbId(
                        imdbId
                    );

                /*
                 * --------------------------------------------------------
                 * SERIES NOT IN SONARR
                 * --------------------------------------------------------
                 */

                if (!series) {
                    console.log(
                        `Series unavailable: ${imdbId}`
                    );

                    return {
                        streams: [
                            {
                                name:
                                    "StremioRequestarr",

                                title:
                                    "NOT AVAILABLE",

                                url:
                                    getPlaceholderUrl(),

                                ...getWidget(
                                    imdbId,
                                    "NOT AVAILABLE",
                                    0,
                                    getRequestUrl(
                                        "series",
                                        imdbId,
                                        season,
                                        episode
                                    )
                                ),
                            },
                        ],
                    };
                }

                /*
                 * Get episodes.
                 */

                const episodes =
                    await getSonarrEpisodes(
                        series.id
                    );

                const episodeData =
                    episodes.find(
                        (item) =>
                            item.seasonNumber ===
                            season &&
                            item.episodeNumber ===
                            episode
                    );

                /*
                 * --------------------------------------------------------
                 * EPISODE NOT FOUND
                 * --------------------------------------------------------
                 */

                if (!episodeData) {
                    console.log(
                        `Episode unavailable: ${imdbId}:${season}:${episode}`
                    );

                    return {
                        streams: [
                            {
                                name:
                                    "StremioRequestarr",

                                title:
                                    "NOT AVAILABLE",

                                url:
                                    getPlaceholderUrl(),

                                ...getWidget(
                                    imdbId,
                                    "NOT AVAILABLE",
                                    0,
                                    getRequestUrl(
                                        "series",
                                        imdbId,
                                        season,
                                        episode
                                    )
                                ),
                            },
                        ],
                    };
                }

                /*
                 * --------------------------------------------------------
                 * EPISODE AVAILABLE
                 * --------------------------------------------------------
                 */

                if (
                    episodeData.hasFile &&
                    episodeData.episodeFileId
                ) {
                    const playbackUrl =
                        `${PUBLIC_BASE_URL}/play/tv/${encodeURIComponent(
                            imdbId
                        )}/${season}/${episode}`;

                    const quality =
                        episodeData
                            .episodeFile
                            ?.quality
                            ?.quality
                            ?.name ??
                        "Unknown";

                    return {
                        streams: [
                            {
                                name:
                                    "StremioRequestarr",

                                title:
                                    `AVAILABLE • ${quality}`,

                                url:
                                    playbackUrl,

                                ...getWidget(
                                    imdbId,
                                    `AVAILABLE • ${quality}`,
                                    1
                                ),
                            },
                        ],
                    };
                }

                /*
                 * Check queue.
                 */

                const queue =
                    await getSonarrQueueForSeries(
                        series.id
                    );

                const queueItem =
                    queue.find(
                        (item) =>
                            item.episodeId ===
                            episodeData.id
                    );

                /*
                 * --------------------------------------------------------
                 * NOT QUEUED
                 * --------------------------------------------------------
                 */

                if (!queueItem) {
                    console.log(
                        `Episode not queued: ${imdbId}:${season}:${episode}`
                    );

                    return {
                        streams: [
                            {
                                name:
                                    "StremioRequestarr",

                                title:
                                    "NOT AVAILABLE",

                                url:
                                    getPlaceholderUrl(),

                                ...getWidget(
                                    imdbId,
                                    "NOT AVAILABLE",
                                    0,
                                    getRequestUrl(
                                        "series",
                                        imdbId,
                                        season,
                                        episode
                                    )
                                ),
                            },
                        ],
                    };
                }

                /*
                 * --------------------------------------------------------
                 * QUEUED / DOWNLOADING / IMPORTING
                 * --------------------------------------------------------
                 */

                const progress =
                    getQueueProgress(
                        queueItem
                    );

                const status =
                    getQueueStatus(
                        queueItem
                    );

                return {
                    streams: [
                        {
                            name:
                                "StremioRequestarr",

                            title:
                                `${status} • ${Math.round(
                                    progress * 100
                                )}%`,

                            url:
                                getPlaceholderUrl(),

                            ...getWidget(
                                imdbId,
                                status,
                                progress
                            ),
                        },
                    ],
                };
            }

            /*
             * ============================================================
             * MOVIE
             * ============================================================
             */

            if (type === "movie") {
                const imdbId =
                    id;

                /*
                 * Check Radarr first.
                 */

                const movie =
                    await getRadarrMovieByImdbId(
                        imdbId
                    );

                /*
                 * --------------------------------------------------------
                 * MOVIE NOT IN RADARR
                 * --------------------------------------------------------
                 */

                if (!movie) {
                    console.log(
                        `Movie unavailable: ${imdbId}`
                    );

                    return {
                        streams: [
                            {
                                name:
                                    "StremioRequestarr",

                                title:
                                    "NOT AVAILABLE",

                                url:
                                    getPlaceholderUrl(),

                                ...getWidget(
                                    imdbId,
                                    "NOT AVAILABLE",
                                    0,
                                    getRequestUrl(
                                        "movie",
                                        imdbId
                                    )
                                ),
                            },
                        ],
                    };
                }

                /*
                 * --------------------------------------------------------
                 * MOVIE AVAILABLE
                 * --------------------------------------------------------
                 */

                if (
                    movie.hasFile &&
                    movie.movieFile?.path
                ) {
                    const playbackUrl =
                        `${PUBLIC_BASE_URL}/play/movie/${encodeURIComponent(
                            imdbId
                        )}`;

                    const quality =
                        getMovieQuality(
                            movie
                        );

                    return {
                        streams: [
                            {
                                name:
                                    "StremioRequestarr",

                                title:
                                    `AVAILABLE • ${quality}`,

                                url:
                                    playbackUrl,

                                ...getWidget(
                                    imdbId,
                                    `AVAILABLE • ${quality}`,
                                    1
                                ),
                            },
                        ],
                    };
                }

                /*
                 * Check Radarr queue.
                 */

                const queueItem =
                    await getRadarrQueueForMovie(
                        movie.id
                    );

                /*
                 * --------------------------------------------------------
                 * MOVIE NOT QUEUED
                 * --------------------------------------------------------
                 */

                if (!queueItem) {
                    console.log(
                        `Movie not queued: ${imdbId}`
                    );

                    return {
                        streams: [
                            {
                                name:
                                    "StremioRequestarr",

                                title:
                                    "NOT AVAILABLE",

                                url:
                                    getPlaceholderUrl(),

                                ...getWidget(
                                    imdbId,
                                    "NOT AVAILABLE",
                                    0,
                                    getRequestUrl(
                                        "movie",
                                        imdbId
                                    )
                                ),
                            },
                        ],
                    };
                }

                /*
                 * --------------------------------------------------------
                 * MOVIE QUEUED
                 * --------------------------------------------------------
                 */

                const progress =
                    getQueueProgress(
                        queueItem
                    );

                const status =
                    getQueueStatus(
                        queueItem
                    );

                return {
                    streams: [
                        {
                            name:
                                "StremioRequestarr",

                            title:
                                `${status} • ${Math.round(
                                    progress * 100
                                )}%`,

                            url:
                                getPlaceholderUrl(),

                            ...getWidget(
                                imdbId,
                                status,
                                progress
                            ),
                        },
                    ],
                };
            }

            return {
                streams: [],
            };
        }
    );
}