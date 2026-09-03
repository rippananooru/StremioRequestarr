import express from "express";
import { statusPage } from "./statusPage.js";

import {
    getRadarrMovieByImdbId,
    addMovieToRadarr,
} from "./radarr.js";

import {
    getSonarrSeriesByImdbId,
    getSonarrEpisodes,
    addSeriesToSonarr,
} from "./sonarr.js";


export function registerRequestRoutes(app: express.Application) {
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
                            statusPage({
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
                        statusPage({
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
                    statusPage({
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
                            statusPage({
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
                        statusPage({
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
                    statusPage({
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
}