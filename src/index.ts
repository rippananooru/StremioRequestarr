import "dotenv/config";

import {
    addonBuilder,
    getRouter,
} from "stremio-addon-sdk";

import express from "express";

import {
    registerPlaybackRoutes,
} from "./playback.js";

import {
    registerMetaHandler,
} from "./meta.js";

import {
    registerStreamHandler,
} from "./stream.js";

import {
    registerPlayerWidgetRoute,
} from "./playerWidget.js";

import {
    registerRequestRoutes,
} from "./request.js";

const manifest = {
    id: "com.nooru.stremiorequestarr",
    version: "0.1.0",
    name: "StremioRequestarr",
    description:
        "Request movies and TV shows from Stremio using the Arr stack.",
    resources: [
        "meta",
        {
            name: "stream",
            types: ["movie", "series"],
            idPrefixes: ["tt"],
        },
    ],
    types: ["movie", "series"],
    catalogs: [],
};

const port =
    Number(process.env.PORT) || 7000;

const app = express();

const builder =
    new addonBuilder(manifest);

registerMetaHandler(builder);
registerStreamHandler(builder);

registerPlaybackRoutes(app);
registerRequestRoutes(app);
registerPlayerWidgetRoute(app);

app.use(
    getRouter(
        builder.getInterface()
    )
);

app.listen(
    port,
    () => {
        console.log(
            `StremioRequestarr running on port ${port}`
        );
    }
);