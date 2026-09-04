import express from "express";

import {
    addMovieToRadarr,
    getRadarrMovieByImdbId,
} from "./radarr.js";

import {
    addSeriesToSonarr,
    getSonarrSeriesByImdbId,
} from "./sonarr.js";

function htmlEscape(
    value: string
): string {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

function renderPage(
    title: string,
    message: string,
    success = false
): string {
    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta
        name="viewport"
        content="width=device-width, initial-scale=1"
    >
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
            background: #101114;
            color: #ffffff;
            font-family:
                system-ui,
                -apple-system,
                BlinkMacSystemFont,
                "Segoe UI",
                sans-serif;
        }

        .card {
            width: min(520px, calc(100% - 40px));
            padding: 36px;
            border-radius: 18px;
            background: #191b20;
            text-align: center;
            box-shadow:
                0 20px 60px rgba(0, 0, 0, 0.45);
        }

        .icon {
            font-size: 48px;
            margin-bottom: 16px;
        }

        h1 {
            margin: 0 0 12px;
            font-size: 24px;
        }

        p {
            margin: 8px 0;
            color: #b8bac2;
            line-height: 1.5;
        }

        .success {
            color: #8ee28e;
        }

        .error {
            color: #ff8f8f;
        }
    </style>
</head>

<body>
    <div class="card">
        <div class="icon">
            ${success ? "✓" : "⏳"}
        </div>

        <h1>
            ${htmlEscape(title)}
        </h1>

        <p class="${success ? "success" : ""}">
            ${htmlEscape(message)}
        </p>
    </div>
</body>
</html>`;
}

export function registerRequestRoutes(
    app: express.Application
) {
    /*
     * MOVIE REQUEST
     *
     * This endpoint is intentionally separate from
     * the stream handler.
     *
     * It is only reached when Stremio actually opens
     * the selected externalUrl.
     */
    app.get(
        "/request/movie/:imdbId",
        async (req, res) => {
            const imdbId =
                req.params.imdbId;

            if (!imdbId) {
                res
                    .status(400)
                    .send(
                        renderPage(
                            "Invalid movie",
                            "No IMDb ID was provided."
                        )
                    );

                return;
            }

            try {
                /*
                 * Check again before adding.
                 *
                 * This prevents duplicate requests if
                 * the movie was added between the stream
                 * lookup and the actual click.
                 */
                const existing =
                    await getRadarrMovieByImdbId(
                        imdbId
                    );

                if (existing) {
                    res.send(
                        renderPage(
                            existing.title,
                            "This movie is already in Radarr."
                        )
                    );

                    return;
                }

                console.log(
                    `PLAY REQUEST -> Radarr movie ${imdbId}`
                );

                const added =
                    await addMovieToRadarr(
                        imdbId
                    );

                console.log(
                    `Movie requested from playback: ${added.title}`
                );

                res.send(
                    renderPage(
                        added.title,
                        "Requested from Radarr. Download has started or is queued.",
                        true
                    )
                );
            } catch (error) {
                console.error(
                    "Movie request failed:",
                    error
                );

                res
                    .status(500)
                    .send(
                        renderPage(
                            "Request failed",
                            error instanceof Error
                                ? error.message
                                : "Unable to request movie.",
                            false
                        )
                    );
            }
        }
    );

    /*
     * TV REQUEST
     */
    app.get(
        "/request/tv/:imdbId/:season/:episode",
        async (req, res) => {
            const imdbId =
                req.params.imdbId;

            const season =
                Number(
                    req.params.season
                );

            const episode =
                Number(
                    req.params.episode
                );

            if (
                !imdbId ||
                !Number.isInteger(season) ||
                season < 0 ||
                !Number.isInteger(episode) ||
                episode <= 0
            ) {
                res
                    .status(400)
                    .send(
                        renderPage(
                            "Invalid episode",
                            "The series, season, or episode is invalid."
                        )
                    );

                return;
            }

            try {
                /*
                 * Check whether the series already exists.
                 */
                const existing =
                    await getSonarrSeriesByImdbId(
                        imdbId
                    );

                if (existing) {
                    res.send(
                        renderPage(
                            existing.title,
                            `The series is already in Sonarr. S${String(
                                season
                            ).padStart(
                                2,
                                "0"
                            )}E${String(
                                episode
                            ).padStart(
                                2,
                                "0"
                            )} is being handled by Sonarr.`
                        )
                    );

                    return;
                }

                console.log(
                    `PLAY REQUEST -> Sonarr series ${imdbId}`
                );

                const added =
                    await addSeriesToSonarr(
                        imdbId
                    );

                console.log(
                    `Series requested from playback: ${added.title}`
                );

                res.send(
                    renderPage(
                        added.title,
                        `Requested from Sonarr. S${String(
                            season
                        ).padStart(
                            2,
                            "0"
                        )}E${String(
                            episode
                        ).padStart(
                            2,
                            "0"
                        )} will be handled by Sonarr.`,
                        true
                    )
                );
            } catch (error) {
                console.error(
                    "TV request failed:",
                    error
                );

                res
                    .status(500)
                    .send(
                        renderPage(
                            "Request failed",
                            error instanceof Error
                                ? error.message
                                : "Unable to request series.",
                            false
                        )
                    );
            }
        }
    );
}