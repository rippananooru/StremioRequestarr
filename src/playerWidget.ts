import express from "express";

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function renderPlayerWidget(
    title: string,
    status: string,
    progress: number,
    requestUrl?: string
): string {
    const safeTitle =
        escapeHtml(title);

    const safeStatus =
        escapeHtml(status);

    const percentage =
        Math.max(
            0,
            Math.min(
                100,
                Math.round(progress * 100)
            )
        );

    const safeRequestUrl =
        requestUrl
            ? escapeHtml(requestUrl)
            : "";

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">

    <meta
        name="viewport"
        content="width=device-width, initial-scale=1.0"
    >

    <title>${safeTitle}</title>

    <style>
        * {
            box-sizing: border-box;
        }

        html,
        body {
            width: 100%;
            height: 100%;
            margin: 0;
            padding: 0;
            overflow: hidden;
            background: #000;
            color: #fff;
            font-family:
                Arial,
                Helvetica,
                sans-serif;
        }

        body {
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .container {
            width: 80%;
            max-width: 900px;
            text-align: center;
        }

        .spinner {
            width: 42px;
            height: 42px;
            margin: 0 auto 28px;

            border: 4px solid
                rgba(255, 255, 255, 0.2);

            border-top-color: #fff;

            border-radius: 50%;

            animation:
                spin 1s linear infinite;
        }

        .title {
            font-size: 30px;
            font-weight: 600;
            margin-bottom: 14px;
        }

        .status {
            font-size: 20px;
            color: #aaa;
            margin-bottom: 28px;
        }

        .progress-container {
            width: 100%;
            height: 8px;

            background: #333;
            border-radius: 4px;

            overflow: hidden;
        }

        .progress {
            width: ${percentage}%;

            height: 100%;

            background: #fff;

            border-radius: 4px;

            transition:
                width 0.5s ease;
        }

        .percentage {
            margin-top: 12px;

            font-size: 16px;
            color: #888;
        }

        .result {
            margin-top: 28px;

            font-size: 18px;
            color: #aaa;
        }

        @keyframes spin {
            from {
                transform: rotate(0deg);
            }

            to {
                transform: rotate(360deg);
            }
        }
    </style>
</head>

<body>
    <div class="container">

        <div class="spinner"></div>

        <div class="title">
            ${safeTitle}
        </div>

        <div
            id="status"
            class="status"
        >
            ${safeStatus}
        </div>

        <div class="progress-container">
            <div class="progress"></div>
        </div>

        <div class="percentage">
            ${percentage}%
        </div>

        <div
            id="result"
            class="result"
        ></div>

    </div>

    <script>
        const requestUrl =
            ${JSON.stringify(requestUrl || "")};

        async function sendRequest() {
            if (!requestUrl) {
                return;
            }

            const statusElement =
                document.getElementById(
                    "status"
                );

            const resultElement =
                document.getElementById(
                    "result"
                );

            try {
                statusElement.textContent =
                    "REQUESTING...";

                const response =
                    await fetch(
                        requestUrl,
                        {
                            method: "GET",
                        }
                    );

                if (!response.ok) {
                    throw new Error(
                        "HTTP " +
                        response.status
                    );
                }

                statusElement.textContent =
                    "REQUESTED";

                resultElement.textContent =
                    "Radarr / Sonarr accepted the request.";
            } catch (error) {
                console.error(
                    "Request failed:",
                    error
                );

                statusElement.textContent =
                    "REQUEST FAILED";

                resultElement.textContent =
                    "Unable to submit the request.";
            }
        }

        if (requestUrl) {
            sendRequest();
        }
    </script>
</body>
</html>`;
}

export function registerPlayerWidgetRoute(
    app: express.Application
) {
    app.get(
        "/widget/player",
        (req, res) => {
            console.log(
                "Player widget request:",
                req.originalUrl
            );

            console.log(
                "Player widget query:",
                req.query
            );

            const title =
                typeof req.query.title === "string"
                    ? req.query.title
                    : "StremioRequestarr";

            const status =
                typeof req.query.status === "string"
                    ? req.query.status
                    : "BUFFERING";

            const progress =
                typeof req.query.progress === "string"
                    ? Number(req.query.progress)
                    : 0;

            const requestUrl =
                typeof req.query.requestUrl === "string"
                    ? req.query.requestUrl
                    : undefined;

            const safeProgress =
                Number.isFinite(progress)
                    ? progress
                    : 0;

            res.type("html").send(
                renderPlayerWidget(
                    title,
                    status,
                    safeProgress,
                    requestUrl
                )
            );
        }
    );
}