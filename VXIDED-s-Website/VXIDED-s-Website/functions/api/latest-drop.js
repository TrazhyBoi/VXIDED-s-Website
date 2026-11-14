const SPOTIFY_ARTIST_ID = "4cCMiXl14pn9BtbrLtuUzu";
// Apple's current VXIDED catalog is indexed under this ID; the older confirmed profile has no releases.
const APPLE_ARTIST_ID = "1873540692";
const SPOTIFY_PAGE_SIZE = 10;
const MAX_SPOTIFY_PAGES = 20;
const CACHE_TTL_SECONDS = 900;

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control":
        status === 200
          ? `public, max-age=300, s-maxage=${CACHE_TTL_SECONDS}, stale-while-revalidate=3600`
          : "no-store",
    },
  });
}

async function fetchJson(url, options, provider) {
  let response;

  try {
    response = await fetch(url, options);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown network error";
    throw new Error(`${provider} request failed: ${detail}`);
  }

  if (!response.ok) {
    throw new Error(`${provider} returned HTTP ${response.status}.`);
  }

  try {
    return await response.json();
  } catch {
    throw new Error(`${provider} returned invalid JSON.`);
  }
}

function normalizeReleaseDate(value) {
  if (typeof value !== "string") {
    return null;
  }

  const match = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/.exec(value);

  if (!match) {
    return null;
  }

  return `${match[1]}-${match[2] || "01"}-${match[3] || "01"}`;
}

function isReleased(date) {
  return date !== null && date <= new Date().toISOString().slice(0, 10);
}

function normalizeTitle(title) {
  return title
    .toLowerCase()
    .replace(/\s*[-–—]\s*(single|ep|album)\s*$/i, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

async function getSpotifyReleases(env) {
  if (!env.SPOTIFY_CLIENT_ID || !env.SPOTIFY_CLIENT_SECRET) {
    throw new Error("Spotify Client ID or Client Secret is not configured.");
  }

  const tokenData = await fetchJson(
    "https://accounts.spotify.com/api/token",
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${env.SPOTIFY_CLIENT_ID}:${env.SPOTIFY_CLIENT_SECRET}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    },
    "Spotify authentication"
  );

  if (typeof tokenData.access_token !== "string" || !tokenData.access_token) {
    throw new Error("Spotify did not return an access token.");
  }

  const releases = [];
  let total = Number.POSITIVE_INFINITY;

  for (
    let offset = 0;
    offset < total && offset < SPOTIFY_PAGE_SIZE * MAX_SPOTIFY_PAGES;
    offset += SPOTIFY_PAGE_SIZE
  ) {
    const url = new URL(`https://api.spotify.com/v1/artists/${SPOTIFY_ARTIST_ID}/albums`);
    url.searchParams.set("include_groups", "album,single,appears_on");
    url.searchParams.set("market", "US");
    url.searchParams.set("limit", String(SPOTIFY_PAGE_SIZE));
    url.searchParams.set("offset", String(offset));

    const data = await fetchJson(
      url,
      { headers: { Authorization: `Bearer ${tokenData.access_token}` } },
      "Spotify catalog"
    );

    if (!Array.isArray(data.items)) {
      throw new Error("Spotify returned an invalid album list.");
    }

    total = Number.isInteger(data.total) ? data.total : offset + data.items.length;

    data.items.forEach((item) => {
      const releaseDate = normalizeReleaseDate(item.release_date);

      if (typeof item.name !== "string" || !item.name || !isReleased(releaseDate)) {
        return;
      }

      releases.push({
        title: item.name,
        releaseDate,
        source: "spotify",
        url: item.external_urls && item.external_urls.spotify,
        artworkUrl: Array.isArray(item.images) && item.images[0] ? item.images[0].url : null,
      });
    });

    if (data.items.length === 0) {
      break;
    }
  }

  return releases;
}

async function getAppleMusicReleases() {
  const url = new URL("https://itunes.apple.com/lookup");
  url.searchParams.set("id", APPLE_ARTIST_ID);
  url.searchParams.set("entity", "album");
  url.searchParams.set("limit", "200");
  url.searchParams.set("country", "US");

  const data = await fetchJson(url, undefined, "Apple Music catalog");

  if (!Array.isArray(data.results)) {
    throw new Error("Apple Music returned an invalid album list.");
  }

  return data.results
    .filter(
      (item) =>
        item.wrapperType === "collection" &&
        typeof item.collectionName === "string" &&
        item.collectionName
    )
    .map((item) => {
      const releaseDate = normalizeReleaseDate(item.releaseDate);
      const artworkUrl =
        typeof item.artworkUrl100 === "string"
          ? item.artworkUrl100.replace(/100x100bb/, "600x600bb")
          : null;

      return {
        title: item.collectionName,
        releaseDate,
        source: "appleMusic",
        url: item.collectionViewUrl,
        artworkUrl,
      };
    })
    .filter((release) => isReleased(release.releaseDate));
}

function findMatchingRelease(releases, target) {
  const targetTitle = normalizeTitle(target.title);

  return releases
    .filter((release) => normalizeTitle(release.title) === targetTitle)
    .sort(
      (first, second) =>
        Math.abs(Date.parse(first.releaseDate) - Date.parse(target.releaseDate)) -
        Math.abs(Date.parse(second.releaseDate) - Date.parse(target.releaseDate))
    )[0];
}

async function loadLatestDrop(env) {
  const [spotifyResult, appleResult] = await Promise.allSettled([
    getSpotifyReleases(env),
    getAppleMusicReleases(),
  ]);
  const warnings = [];
  const spotifyReleases = [];
  const appleReleases = [];

  if (spotifyResult.status === "fulfilled") {
    spotifyReleases.push(...spotifyResult.value);
  } else {
    console.error("Spotify latest-release lookup failed.", spotifyResult.reason);
    warnings.push("Spotify release information is temporarily unavailable.");
  }

  if (appleResult.status === "fulfilled") {
    appleReleases.push(...appleResult.value);
  } else {
    console.error("Apple Music latest-release lookup failed.", appleResult.reason);
    warnings.push("Apple Music release information is temporarily unavailable.");
  }

  const releases = [...spotifyReleases, ...appleReleases];

  if (releases.length === 0) {
    return jsonResponse(502, {
      error: "The latest release could not be retrieved from Spotify or Apple Music.",
    });
  }

  releases.sort((first, second) => second.releaseDate.localeCompare(first.releaseDate));
  const latest = releases[0];
  const spotifyMatch = findMatchingRelease(spotifyReleases, latest);
  const appleMatch = findMatchingRelease(appleReleases, latest);
  const urls = {
    spotify:
      spotifyMatch && typeof spotifyMatch.url === "string" ? spotifyMatch.url : null,
    appleMusic: appleMatch && typeof appleMatch.url === "string" ? appleMatch.url : null,
  };

  if (!urls.spotify && spotifyResult.status === "fulfilled") {
    warnings.push("This release is not listed on Spotify yet.");
  }

  if (!urls.appleMusic && appleResult.status === "fulfilled") {
    warnings.push("This release is not listed on Apple Music yet.");
  }

  return jsonResponse(200, {
    release: {
      title: latest.title.replace(/\s*[-–—]\s*(single|ep|album)\s*$/i, "").trim(),
      date: latest.releaseDate,
      artworkUrl: latest.artworkUrl,
      urls,
    },
    warnings,
  });
}

export async function onRequestGet(context) {
  const cache = typeof caches !== "undefined" ? caches.default : null;
  const cacheKey = new Request(new URL("/api/latest-drop", context.request.url).toString());

  if (cache) {
    const cachedResponse = await cache.match(cacheKey);

    if (cachedResponse) {
      return cachedResponse;
    }
  }

  const response = await loadLatestDrop(context.env);

  if (cache && response.status === 200) {
    const cacheWrite = cache.put(cacheKey, response.clone());

    if (typeof context.waitUntil === "function") {
      context.waitUntil(cacheWrite);
    } else {
      await cacheWrite;
    }
  }

  return response;
}
