const menuToggle = document.querySelector(".menu-toggle");
const navigation = document.querySelector("#site-navigation");

document.querySelectorAll(".presave-banner").forEach((banner) => {
  const track = banner.querySelector(".presave-banner-track");

  if (!(banner instanceof HTMLAnchorElement) || !(track instanceof HTMLElement)) {
    return;
  }

  const groups = Array.from(track.querySelectorAll(".presave-banner-group"));
  const firstGroup = groups[0];
  const sourceCopy = firstGroup && firstGroup.querySelector(".presave-banner-copy");

  if (groups.length < 2 || !(sourceCopy instanceof HTMLElement)) {
    return;
  }

  const fillBanner = () => {
    const sampleCopy = groups[0].querySelector(".presave-banner-copy");
    const copyWidth = sampleCopy instanceof HTMLElement
      ? sampleCopy.getBoundingClientRect().width
      : 0;
    const bannerWidth = banner.clientWidth;

    if (copyWidth === 0 || bannerWidth === 0) {
      return;
    }

    const copyCount = Math.max(1, Math.ceil(bannerWidth / copyWidth));

    groups.forEach((group) => {
      group.replaceChildren(...Array.from({ length: copyCount }, () => sourceCopy.cloneNode(true)));
    });

    const groupWidth = groups[0].getBoundingClientRect().width;
    track.style.setProperty("--presave-duration", `${Math.max(20, groupWidth / 30)}s`);
  };

  fillBanner();
  window.addEventListener("resize", fillBanner);
});

if (menuToggle && navigation) {
  const setNavigationOpen = (isOpen) => {
    menuToggle.setAttribute("aria-expanded", String(isOpen));
    menuToggle.setAttribute("aria-label", isOpen ? "Close navigation" : "Open navigation");
    navigation.classList.toggle("is-open", isOpen);
    document.body.classList.toggle("navigation-open", isOpen);
  };

  menuToggle.addEventListener("click", () => {
    const isOpen = menuToggle.getAttribute("aria-expanded") === "true";
    setNavigationOpen(!isOpen);
  });

  navigation.addEventListener("click", (event) => {
    if (event.target instanceof HTMLAnchorElement) {
      setNavigationOpen(false);
    }
  });

  document.addEventListener("click", (event) => {
    if (
      menuToggle.getAttribute("aria-expanded") === "true" &&
      event.target instanceof Node &&
      !navigation.contains(event.target) &&
      !menuToggle.contains(event.target)
    ) {
      setNavigationOpen(false);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && menuToggle.getAttribute("aria-expanded") === "true") {
      setNavigationOpen(false);
      menuToggle.focus();
    }
  });
}

const themeToggle = document.querySelector(".theme-toggle");

if (themeToggle) {
  const isDark = localStorage.getItem("vxided-theme") === "dark";
  document.documentElement.dataset.theme = isDark ? "dark" : "light";
  themeToggle.checked = isDark;

  themeToggle.addEventListener("change", () => {
    const theme = themeToggle.checked ? "dark" : "light";
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("vxided-theme", theme);
  });
}

const studioCarousel = document.querySelector("[data-studio-carousel]");

if (studioCarousel) {
  const track = studioCarousel.querySelector("[data-carousel-track]");
  const previousButton = studioCarousel.querySelector("[data-carousel-prev]");
  const nextButton = studioCarousel.querySelector("[data-carousel-next]");

  if (track && previousButton && nextButton) {
    const updateCarouselButtons = () => {
      const maxScroll = Math.max(0, track.scrollWidth - track.clientWidth);
      previousButton.disabled = track.scrollLeft <= 4;
      nextButton.disabled = track.scrollLeft >= maxScroll - 4;
    };

    const scrollByCard = (direction) => {
      const firstCard = track.querySelector(".studio-note");

      if (!firstCard) {
        return;
      }

      const gap = Number.parseFloat(getComputedStyle(track).columnGap) || 0;
      const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth";

      track.scrollBy({
        left: direction * (firstCard.getBoundingClientRect().width + gap),
        behavior,
      });
    };

    previousButton.addEventListener("click", () => scrollByCard(-1));
    nextButton.addEventListener("click", () => scrollByCard(1));
    track.addEventListener("scroll", updateCarouselButtons, { passive: true });
    window.addEventListener("resize", updateCarouselButtons);
    updateCarouselButtons();
  }
}

const latestDropCard = document.querySelector("[data-latest-drop]");

if (latestDropCard) {
  const title = latestDropCard.querySelector("[data-latest-title]");
  const artwork = latestDropCard.querySelector("[data-latest-artwork]");
  const date = latestDropCard.querySelector("[data-latest-date]");
  const status = latestDropCard.querySelector("[data-latest-status]");
  const listenButton = latestDropCard.querySelector("[data-open-platforms]");
  const platformDialog = latestDropCard.querySelector("[data-platform-dialog]");
  const spotifyLink = latestDropCard.querySelector("[data-spotify-link]");
  const appleLink = latestDropCard.querySelector("[data-apple-link]");

  if (title && artwork && date && status && listenButton && platformDialog && spotifyLink && appleLink) {
    const showError = (message) => {
      title.textContent = "Latest release unavailable";
      status.textContent = message;
      latestDropCard.removeAttribute("aria-busy");
    };

    const setPlatformLink = (link, url, expectedHost) => {
      if (typeof url !== "string") {
        return false;
      }

      let parsedUrl;

      try {
        parsedUrl = new URL(url);
      } catch {
        return false;
      }

      if (parsedUrl.protocol !== "https:" || parsedUrl.hostname !== expectedHost) {
        return false;
      }

      link.href = parsedUrl.href;
      link.hidden = false;
      return true;
    };

    const loadLatestDrop = async () => {
      let response;

      try {
        response = await fetch("/api/latest-drop", {
          headers: { Accept: "application/json" },
        });
      } catch (error) {
        console.error("Latest release request failed.", error);
        showError("We couldn't check for the latest release. Please try again later.");
        return;
      }

      let result;

      try {
        result = await response.json();
      } catch (error) {
        console.error("Latest release service returned invalid JSON.", error);
        showError("The latest release service returned an unexpected response.");
        return;
      }

      if (!response.ok) {
        console.error("Latest release lookup failed.", result);
        showError(
          result && typeof result.error === "string"
            ? result.error
            : "We couldn't check for the latest release. Please try again later."
        );
        return;
      }

      const release = result && result.release;

      if (!release || typeof release.title !== "string" || !release.title) {
        console.error("Latest release service returned incomplete release data.", result);
        showError("The latest release service returned incomplete information.");
        return;
      }

      title.textContent = release.title;
      latestDropCard.removeAttribute("aria-busy");

      if (typeof release.artworkUrl === "string" && release.artworkUrl.startsWith("https://")) {
        artwork.src = release.artworkUrl;
        artwork.alt = `Cover art for ${release.title}`;
      }

      if (typeof release.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(release.date)) {
        const releaseDate = new Date(`${release.date}T12:00:00Z`);

        if (!Number.isNaN(releaseDate.valueOf())) {
          date.dateTime = release.date;
          date.textContent = new Intl.DateTimeFormat(undefined, {
            dateStyle: "medium",
            timeZone: "UTC",
          }).format(releaseDate);
          date.hidden = false;
        }
      }

      const urls = release.urls || {};
      const hasSpotify = setPlatformLink(spotifyLink, urls.spotify, "open.spotify.com");
      const hasAppleMusic = setPlatformLink(appleLink, urls.appleMusic, "music.apple.com");
      listenButton.disabled = !hasSpotify && !hasAppleMusic;

      const warnings = Array.isArray(result.warnings)
        ? result.warnings.filter((warning) => typeof warning === "string")
        : [];
      status.textContent = warnings.length
        ? warnings.join(" ")
        : hasSpotify && hasAppleMusic
          ? "Choose Spotify or Apple Music to listen."
          : "This release isn't listed on both services yet.";
    };

    listenButton.addEventListener("click", () => {
      if (typeof platformDialog.showModal === "function") {
        platformDialog.showModal();
      } else {
        status.textContent = "Your browser doesn't support the streaming platform chooser.";
      }
    });

    [spotifyLink, appleLink].forEach((link) => {
      link.addEventListener("click", () => platformDialog.close());
    });

    platformDialog.addEventListener("click", (event) => {
      if (event.target === platformDialog) {
        platformDialog.close();
      }
    });

    loadLatestDrop();
  }
}

const musicSubmissionForm = document.querySelector("#music-submission-form");
const songLinkInput = document.querySelector("#song-link");
const stageNameInput = document.querySelector("#stage-name");
const submissionReasonInput = document.querySelector("#submission-reason");
const submitSongButton =
  musicSubmissionForm && musicSubmissionForm.querySelector('button[type="submit"]');
const submissionStatus = document.querySelector("#submission-status");

if (
  musicSubmissionForm &&
  songLinkInput &&
  stageNameInput &&
  submissionReasonInput &&
  submitSongButton &&
  submissionStatus
) {
  const validateSongLink = () => {
    const value = songLinkInput.value.trim();

    if (!value) {
      songLinkInput.setCustomValidity("");
      return;
    }

    let url;

    try {
      url = new URL(value);
    } catch {
      songLinkInput.setCustomValidity("Enter a valid Spotify or SoundCloud song link.");
      return;
    }

    const hostname = url.hostname.toLowerCase();
    const isAllowedHost =
      hostname === "open.spotify.com" ||
      hostname === "spotify.link" ||
      hostname === "soundcloud.com" ||
      hostname.endsWith(".soundcloud.com");
    const isSongLink = url.protocol === "https:" && isAllowedHost && url.pathname.length > 1;

    songLinkInput.setCustomValidity(
      isSongLink ? "" : "Use an HTTPS song link from Spotify or SoundCloud."
    );
  };

  songLinkInput.addEventListener("input", validateSongLink);
  musicSubmissionForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    validateSongLink();

    if (!musicSubmissionForm.reportValidity()) {
      return;
    }

    submitSongButton.disabled = true;
    submissionStatus.textContent = "Sending your submission…";

    try {
      const response = await fetch("/api/music-submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stageName: stageNameInput.value.trim(),
          songLink: songLinkInput.value.trim(),
          reason: submissionReasonInput.value.trim(),
        }),
      });
      const responseText = await response.text();
      let result;

      try {
        result = JSON.parse(responseText);
      } catch {
        throw new Error("The submission service returned an unexpected response. Please try again later.");
      }

      if (!response.ok) {
        throw new Error(
          typeof result.error === "string" ? result.error : "We couldn't send your submission."
        );
      }

      musicSubmissionForm.reset();
      songLinkInput.setCustomValidity("");
      submissionStatus.textContent = "Thanks! Your submission was sent successfully.";
    } catch (error) {
      console.error("Music submission failed.", error);
      submissionStatus.textContent =
        error instanceof Error ? error.message : "We couldn't send your submission. Please try again.";
    } finally {
      submitSongButton.disabled = false;
    }
  });
}

document.querySelectorAll("[data-current-year]").forEach((year) => {
  year.textContent = String(new Date().getFullYear());
});