const MAX_BODY_BYTES = 8192;

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function isAllowedSongLink(value) {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    const isAllowedHost =
      hostname === "open.spotify.com" ||
      hostname === "spotify.link" ||
      hostname === "soundcloud.com" ||
      hostname.endsWith(".soundcloud.com");

    return url.protocol === "https:" && isAllowedHost && url.pathname.length > 1;
  } catch {
    return false;
  }
}

export async function onRequestPost({ request, env }) {
  if (!env.DISCORD_WEBHOOK_URL) {
    return jsonResponse(503, { error: "Submissions are not configured yet. Please try again later." });
  }

  const contentType = request.headers.get("Content-Type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return jsonResponse(415, { error: "The submission format was not accepted." });
  }

  const declaredLength = Number(request.headers.get("Content-Length") || 0);
  if (declaredLength > MAX_BODY_BYTES) {
    return jsonResponse(413, { error: "Your submission is too large." });
  }

  const bodyText = await request.text();
  if (new TextEncoder().encode(bodyText).byteLength > MAX_BODY_BYTES) {
    return jsonResponse(413, { error: "Your submission is too large." });
  }

  let body;
  try {
    body = JSON.parse(bodyText);
  } catch {
    return jsonResponse(400, { error: "The submission could not be read. Please check the form and try again." });
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return jsonResponse(400, { error: "Please submit all required form fields." });
  }

  const stageName = typeof body.stageName === "string" ? body.stageName.trim() : "";
  const songLink = typeof body.songLink === "string" ? body.songLink.trim() : "";
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";

  if (stageName.length < 1 || stageName.length > 60 || reason.length < 1 || reason.length > 500) {
    return jsonResponse(400, { error: "Stage name must be 1–60 characters and reason 1–500 characters." });
  }

  if (songLink.length > 1024 || !isAllowedSongLink(songLink)) {
    return jsonResponse(400, { error: "Use an HTTPS song link from Spotify or SoundCloud." });
  }

  const discordMessage = {
    embeds: [
      {
        title: "Underground Playlist Submission",
        color: 0xdf4445,
        fields: [
          { name: "Stage name", value: stageName },
          { name: "Song link", value: songLink },
          { name: "Reason", value: reason },
        ],
        timestamp: new Date().toISOString(),
      },
    ],
    allowed_mentions: { parse: [] },
  };

  let discordResponse;
  try {
    discordResponse = await fetch(env.DISCORD_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(discordMessage),
    });
  } catch {
    console.error("Discord submission delivery failed because the request could not reach Discord.");
    return jsonResponse(502, { error: "We couldn't send your submission. Please try again later." });
  }

  if (!discordResponse.ok) {
    console.error(`Discord submission delivery failed with status ${discordResponse.status}.`);
    return jsonResponse(502, { error: "We couldn't send your submission. Please try again later." });
  }

  return jsonResponse(200, { ok: true });
}
