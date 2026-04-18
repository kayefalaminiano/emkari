window.addEventListener("DOMContentLoaded", () => {
  const header = document.querySelector(".site-header");
  const logo = document.querySelector(".logo");
  const video = document.querySelector(".bg-video");

  // Mobile autoplay fallback — some browsers need an explicit .play() call
  if (video) {
    video.muted = true;
    const playPromise = video.play();
    if (playPromise !== undefined) {
      playPromise.catch(() => {
        // If autoplay is blocked, try again on first user interaction
        const tryPlay = () => {
          video.play();
          document.removeEventListener("touchstart", tryPlay);
          document.removeEventListener("click", tryPlay);
        };
        document.addEventListener("touchstart", tryPlay, { once: true });
        document.addEventListener("click", tryPlay, { once: true });
      });
    }
  }

  function updateHeader() {
    if (!header || !logo) return;

    const headerBottom = header.getBoundingClientRect().bottom;
    const logoTop = logo.getBoundingClientRect().top;

    header.classList.toggle("scrolled", logoTop <= headerBottom + 8);
  }

  window.addEventListener("scroll", updateHeader);
  window.addEventListener("resize", updateHeader);
  window.addEventListener("load", updateHeader);

  updateHeader();
});