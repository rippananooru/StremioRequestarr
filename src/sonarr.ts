export interface SonarrSeries {
    id: number;
    title: string;
    imdbId?: string;
    tvdbId?: number;
    path: string;
    monitored: boolean;
}

export interface SonarrEpisode {
    id: number;
    seriesId: number;
    seasonNumber: number;
    episodeNumber: number;
    title: string;
    hasFile: boolean;
    path?: string;
    episodeFileId?: number;
    episodeFile?: {
        path?: string;
        size?: number;
        quality?: {
            quality?: {
                name?: string;
            };
        };
    };
}

export interface SonarrEpisodeFile {
    id: number;
    relativePath?: string;
    path?: string;
    size?: number;
    quality?: {
        quality?: {
            name?: string;
        };
    };
}

export interface SonarrQueueItem {
    seriesId?: number;
    episodeId?: number;
    size: number;
    sizeleft: number;
    status: string;
    trackedDownloadState?: string;
    title: string;
    timeleft?: string;
}

export interface SonarrRootFolder {
  path: string;
}

export interface SonarrQualityProfile {
  id: number;
}

function getConfig() {
    const baseUrl = process.env.SONARR_URL;
    const apiKey = process.env.SONARR_API_KEY;

    if (!baseUrl || !apiKey) {
        throw new Error("Sonarr configuration is missing");
    }

    return {
        baseUrl: baseUrl.replace(/\/$/, ""),
        apiKey,
    };
}

async function sonarrFetch(
    url: string,
    options: RequestInit = {}
): Promise<Response> {
    const { apiKey } = getConfig();

    return fetch(url, {
        ...options,
        headers: {
            "X-Api-Key": apiKey,
            ...(options.headers ?? {}),
        },
    });
}

export async function getSonarrSeriesByImdbId(
    imdbId: string
): Promise<SonarrSeries | null> {
    const { baseUrl } = getConfig();

    const response = await sonarrFetch(
        `${baseUrl}/api/v3/series`
    );

    if (!response.ok) {
        throw new Error(
            `Sonarr API error: ${response.status} ${response.statusText}`
        );
    }

    const series = (await response.json()) as SonarrSeries[];

    return (
        series.find((item) => item.imdbId === imdbId) ?? null
    );
}

export async function getSonarrSeries(): Promise<SonarrSeries[]> {
    const { baseUrl } = getConfig();

    const response = await sonarrFetch(
        `${baseUrl}/api/v3/series`
    );

    if (!response.ok) {
        throw new Error(
            `Sonarr series API error: ${response.status} ${response.statusText}`
        );
    }

    return (await response.json()) as SonarrSeries[];
}



export async function getSonarrEpisodes(
    seriesId: number
): Promise<SonarrEpisode[]> {
    const { baseUrl } = getConfig();

    const response = await sonarrFetch(
        `${baseUrl}/api/v3/episode?seriesId=${seriesId}`
    );

    if (!response.ok) {
        throw new Error(
            `Sonarr episode API error: ${response.status} ${response.statusText}`
        );
    }

    return (await response.json()) as SonarrEpisode[];
}

export async function getSonarrQueueForSeries(
    seriesId: number
): Promise<SonarrQueueItem[]> {
    const { baseUrl } = getConfig();

    const response = await sonarrFetch(
        `${baseUrl}/api/v3/queue?page=1&pageSize=100`
    );

    if (!response.ok) {
        throw new Error(
            `Sonarr queue error: ${response.status} ${response.statusText}`
        );
    }

    const queue = (await response.json()) as {
        records: SonarrQueueItem[];
    };

    return queue.records.filter(
        (item) => item.seriesId === seriesId
    );
}

export async function getSonarrEpisodeFile(
    episodeFileId: number
): Promise<SonarrEpisodeFile> {
    const { baseUrl } = getConfig();

    const response = await sonarrFetch(
        `${baseUrl}/api/v3/episodefile/${episodeFileId}`
    );

    if (!response.ok) {
        throw new Error(
            `Sonarr episode file API error: ${response.status} ${response.statusText}`
        );
    }

    return (await response.json()) as SonarrEpisodeFile;
}

export async function addSeriesToSonarr(
  imdbId: string
): Promise<SonarrSeries> {
  const { baseUrl } = getConfig();

  // Look up the series in Sonarr
  const lookupResponse = await sonarrFetch(
    `${baseUrl}/api/v3/series/lookup?term=${encodeURIComponent(imdbId)}`
  );

  if (!lookupResponse.ok) {
    throw new Error(
      `Sonarr lookup error: ${lookupResponse.status} ${lookupResponse.statusText}`
    );
  }

  const results = (await lookupResponse.json()) as SonarrSeries[];

  const series = results.find(
    (item) => item.imdbId === imdbId
  );

  if (!series) {
    throw new Error(`Series not found in Sonarr lookup: ${imdbId}`);
  }

  // Never add a duplicate
  const existing = await getSonarrSeriesByImdbId(imdbId);

  if (existing) {
    return existing;
  }

  // Add series to Sonarr
  const response = await sonarrFetch(
    `${baseUrl}/api/v3/series`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...series,

        rootFolderPath: "/tv",
        qualityProfileId: Number(process.env.SONARR_QUALITY_PROFILE_ID),

        monitored: true,
        seasonFolder: true,

        addOptions: {
          monitor: "all",
          searchForMissingEpisodes: true,
          searchForCutoffUnmetEpisodes: false,
        },
      }),
    }
  );

  if (!response.ok) {
    const body = await response.text();

    throw new Error(
      `Sonarr add series error: ${response.status} ${response.statusText} ${body}`
    );
  }

  return (await response.json()) as SonarrSeries;
}