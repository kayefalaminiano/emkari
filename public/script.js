window.addEventListener("DOMContentLoaded", () => {
  const header = document.querySelector(".site-header");
  const logo = document.querySelector(".logo");
  const video = document.querySelector(".bg-video");
  const contactForm = document.querySelector("#contactForm");
  const API_BASE_URL = "https://emkari.onrender.com";

  // Mobile autoplay fallback — some browsers need an explicit .play() call
  if (video) {
    video.muted = true;
    const playPromise = video.play();

    if (playPromise !== undefined) {
      playPromise.catch(() => {
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
    if (!header) return;

    // Contact page does not have the large center logo,
    // so keep the header in its solid/scrolled state.
    if (!logo) {
      header.classList.add("scrolled");
      return;
    }

    const headerBottom = header.getBoundingClientRect().bottom;
    const logoTop = logo.getBoundingClientRect().top;

    header.classList.toggle("scrolled", logoTop <= headerBottom + 8);
  }

  window.addEventListener("scroll", updateHeader);
  window.addEventListener("resize", updateHeader);
  window.addEventListener("load", updateHeader);

  updateHeader();

  if (contactForm) {
    contactForm.addEventListener("submit", async (event) => {
      event.preventDefault();

      const formData = new FormData(contactForm);

      const payload = {
        firstName: formData.get("firstName"),
        lastName: formData.get("lastName"),
        email: formData.get("email"),
        subject: formData.get("subject"),
        phone: formData.get("phone"),
        smsConsent: formData.get("smsConsent") === "yes",
        message: formData.get("message"),
      };

      try {
        const response = await fetch(`${API_BASE_URL}/contact`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        const result = await response.json();

        if (result.success) {
          contactForm.reset();
          alert("Your message has been sent. Thank you for reaching out!");
        } else {
          alert("Something went wrong. Please try again.");
        }
      } catch (error) {
        console.error(error);
        alert("Something went wrong. Please try again.");
      }
    });
  }
});