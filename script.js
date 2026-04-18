window.addEventListener("DOMContentLoaded", () => {
  const header = document.querySelector(".site-header");
  const logo = document.querySelector(".logo");

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
