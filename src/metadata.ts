export interface StremioMeta {
    id: string;
    type: string;
    name?: string;
    genres?: string[];
    country?: string | string[];
}

export async function getStremioMeta(
    imdbId: string
): Promise<StremioMeta | null> {
    const response = await fetch(
        `https://v3-cinemeta.strem.io/meta/series/${encodeURIComponent(imdbId)}.json`
    );

    if (!response.ok) {
        console.error(
            `Cinemeta metadata lookup failed: ${response.status}`
        );

        return null;
    }

    const data =
        (await response.json()) as {
            meta?: StremioMeta;
        };

    return data.meta ?? null;
}

export async function isAnime(
    imdbId: string
): Promise<boolean> {
    const meta =
        await getStremioMeta(imdbId);

    if (!meta) {
        return false;
    }

    const genres =
        meta.genres ?? [];

    const country =
        Array.isArray(meta.country)
            ? meta.country
            : meta.country
                ? [meta.country]
                : [];

    const isAnimation =
        genres.some(
            (genre) =>
                genre.toLowerCase() ===
                "animation"
        );

    const isJapan =
        country.some(
            (value) =>
                value.toLowerCase() ===
                "japan"
        );

    const anime =
        isAnimation && isJapan;

    console.log(
        `Anime classification: ${meta.name ?? imdbId} -> ${anime} (Animation: ${isAnimation}, Japan: ${isJapan})`
    );

    return anime;
}