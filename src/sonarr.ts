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