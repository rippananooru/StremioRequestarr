import {
  AddonBuilder,
} from "stremio-addon-sdk";

import {
  getSonarrSeriesByImdbId,
  getSonarrEpisodes,
} from "./sonarr.js";

export function registerMetaHandler(
  builder: AddonBuilder
) {
  builder.defineMetaHandler(async ({ type, id }) => {
    console.log(`Meta request: ${type} ${id}`);

    if (type !== "series") {
      return {
        meta: null,
      };
    }

    const series =
      await getSonarrSeriesByImdbId(id);

    if (!series) {
      return {
        meta: null,
      };
    }

    const episodes =
      await getSonarrEpisodes(series.id);

    return {
      meta: {
        id,
        type: "series",
        name: series.title,
        videos: episodes.map((episode) => ({
          id: `${id}:${episode.seasonNumber}:${episode.episodeNumber}`,
          title: episode.title,
          season: episode.seasonNumber,
          number: episode.episodeNumber,
        })),
      },
    };
  });
}