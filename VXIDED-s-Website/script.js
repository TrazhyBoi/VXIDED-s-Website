const menuToggle = document.querySelector(".menu-toggle");
const navigation = document.querySelector("#site-navigation");

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
