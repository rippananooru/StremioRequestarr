export interface RadarrMovie {
  id: number;
  title: string;
  imdbId?: string;
  tmdbId?: number;
  monitored: boolean;
  hasFile: boolean;
  movieFile?: {
    path?: string;
    size: number;
    quality?: {
      quality?: {
        name?: string;
      };
    };
  };
}

export async function getRadarrMovieByImdbId(
  imdbId: string
): Promise<RadarrMovie | null> {
  const baseUrl = process.env.RADARR_URL;
  const apiKey = process.env.RADARR_API_KEY;

  if (!baseUrl || !apiKey) {
    throw new Error("Radarr configuration is missing");
  }

  const response = await fetch(`${baseUrl}/api/v3/movie`, {
    headers: {
      "X-Api-Key": apiKey,
    },
  });

  if (!response.ok) {
    throw new Error(
      `Radarr API error: ${response.status} ${response.statusText}`
    );
  }

  const movies = (await response.json()) as RadarrMovie[];

  return movies.find((movie) => movie.imdbId === imdbId) ?? null;
}

export async function addMovieToRadarr(imdbId: string): Promise<RadarrMovie> {
  const baseUrl = process.env.RADARR_URL;
  const apiKey = process.env.RADARR_API_KEY;

  if (!baseUrl || !apiKey) {
    throw new Error("Radarr configuration is missing");
  }

  // First ask Radarr for the movie metadata.
  const lookupResponse = await fetch(
    `${baseUrl}/api/v3/movie/lookup/imdb?imdbId=${encodeURIComponent(imdbId)}`,
    {
      headers: {
        "X-Api-Key": apiKey,
      },
    }
  );

  if (!lookupResponse.ok) {
    throw new Error(
      `Radarr lookup error: ${lookupResponse.status} ${lookupResponse.statusText}`
    );
  }

  const movie = await lookupResponse.json();

  // Add it to the Radarr library and immediately search for it.
  const addResponse = await fetch(`${baseUrl}/api/v3/movie`, {
    method: "POST",
    headers: {
      "X-Api-Key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ...movie,
      rootFolderPath: "/movies",
      qualityProfileId: Number(process.env.RADARR_QUALITY_PROFILE_ID),
      monitored: true,
      addOptions: {
        searchForMovie: true,
      },
    }),
  });

  if (!addResponse.ok) {
    throw new Error(
      `Radarr add error: ${addResponse.status} ${addResponse.statusText}\n${await addResponse.text()}`
    );
  }

  return (await addResponse.json()) as RadarrMovie;
}

export interface RadarrQueueItem {
  movieId: number;
  downloadId?: string;
  protocol?: string;
  downloadClient?: string;
  size: number;
  sizeleft: number;
  status: string;
  trackedDownloadState?: string;
  title: string;
  timeleft?: string;
}

export interface RadarrHistoryItem {
  movieId?: number;
  eventType?: string;
  downloadId?: string;
  date?: string;
}

export async function getRadarrQueueForMovie(
  movieId: number
): Promise<RadarrQueueItem | null> {
  const baseUrl = process.env.RADARR_URL;
  const apiKey = process.env.RADARR_API_KEY;

  if (!baseUrl || !apiKey) {
    throw new Error("Radarr configuration is missing");
  }

  const response = await fetch(
    `${baseUrl}/api/v3/queue?page=1&pageSize=1000`,
    {
      headers: {
        "X-Api-Key": apiKey,
      },
    }
  );

  if (!response.ok) {
    throw new Error(
      `Radarr queue error: ${response.status} ${response.statusText}`
    );
  }

  const queue = (await response.json()) as {
    records: RadarrQueueItem[];
  };

  return (
    queue.records.find((item) => item.movieId === movieId) ?? null
  );
}

export async function getRadarrDownloadIdForMovie(
  movieId: number
): Promise<string | null> {
  const queueItem = await getRadarrQueueForMovie(movieId);

  if (queueItem?.downloadId) {
    return queueItem.downloadId;
  }

  const baseUrl = process.env.RADARR_URL;
  const apiKey = process.env.RADARR_API_KEY;

  if (!baseUrl || !apiKey) {
    throw new Error("Radarr configuration is missing");
  }

  const response = await fetch(
    `${baseUrl}/api/v3/history?movieId=${movieId}&page=1&pageSize=1000&sortDirection=descending&sortKey=date`,
    {
      headers: {
        "X-Api-Key": apiKey,
      },
    }
  );

  if (!response.ok) {
    throw new Error(
      `Radarr history error: ${response.status} ${response.statusText}`
    );
  }

  const history = (await response.json()) as {
    records: RadarrHistoryItem[];
  };

  return (
    history.records.find(
      (item) =>
        item.eventType === "grabbed" &&
        typeof item.downloadId === "string" &&
        item.downloadId.length > 0
    )?.downloadId ?? null
  );
}
