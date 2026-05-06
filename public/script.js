window.addEventListener("DOMContentLoaded", () => {
  const API_BASE_URL = "https://emkari.onrender.com";
  const COOKIE_FLAVORS = ["dubai", "ferrero", "biscoff"];
  const COOKIE_NAMES = {
    dubai: "Dubai Cookie",
    ferrero: "Ferrero Rocher Cookie",
    biscoff: "Biscoff Cookie",
  };

  const DELIVERY_FEES_BY_ZIP = {
    92121: 5, 92126: 5, 92131: 5,
    92064: 6, 92145: 6,
    92108: 7, 92110: 7, 92111: 7, 92117: 7, 92122: 7, 92123: 7, 92130: 7,
    92037: 8, 92106: 8, 92107: 8, 92109: 8, 92119: 8, 92120: 8, 92124: 8, 92140: 8,
    92101: 9, 92102: 9, 92103: 9, 92104: 9, 92105: 9, 92113: 9, 92114: 9, 92115: 9, 92116: 9,
    91902: 10, 91910: 10, 91911: 10, 91913: 10, 91914: 10, 91915: 10, 91932: 10,
    91941: 10, 91942: 10, 91945: 10, 91950: 10, 91977: 10, 91978: 10,
    92019: 10, 92020: 10, 92021: 10, 92040: 10, 92071: 10,
    92139: 10, 92154: 10, 92173: 10,
  };

  const PAYMENT_DETAILS = {
    zelle: ["<strong>Zelle:</strong> Kaye Falaminiano", "<strong>Email:</strong> kayefalaminiano@gmail.com"],
    cashapp: ["<strong>Cash App:</strong> @kayefalaminiano"],
    venmo: ["<strong>Venmo:</strong> @kayefalaminiano"],
    cash: ["<strong>Cash:</strong> Payment can be made at pickup or delivery."],
  };

  setupFillAnimation();
  setupHeaderScroll();
  setupVideoAutoplay();
  setupCookieReveal();
  setupReviewCarousel();
  setupContactForm();
  setupOrderForm();

  function setupFillAnimation() {
    const section = document.querySelector(".fill-section");
    if (!section) return;

    new IntersectionObserver(
      ([entry]) => {
        section.classList.toggle("is-visible", entry.isIntersecting);
        section.classList.toggle("is-draining", !entry.isIntersecting);
      },
      { threshold: 0.25, rootMargin: "0px 0px -10% 0px" }
    ).observe(section);
  }

  function setupHeaderScroll() {
    const header = document.querySelector(".site-header");
    const logo = document.querySelector(".logo");
    if (!header) return;

    const updateHeader = () => {
      if (!logo) {
        header.classList.add("scrolled");
        return;
      }
      header.classList.toggle(
        "scrolled",
        logo.getBoundingClientRect().top <= header.getBoundingClientRect().bottom + 8
      );
    };

    window.addEventListener("scroll", updateHeader, { passive: true });
    window.addEventListener("resize", updateHeader);
    updateHeader();
  }

  function setupVideoAutoplay() {
    const video = document.querySelector(".bg-video");
    if (!video) return;

    video.muted = true;
    video.play()?.catch(() => {
      const tryPlay = () => video.play().catch(() => {});
      document.addEventListener("touchstart", tryPlay, { once: true });
      document.addEventListener("click", tryPlay, { once: true });
    });
  }

  function setupCookieReveal() {
    const section = document.querySelector(".cookie-section");
    if (!section) return;

    new IntersectionObserver(
      ([entry]) => section.classList.toggle("is-visible", entry.isIntersecting),
      { threshold: 0.18, rootMargin: "0px 0px -18% 0px" }
    ).observe(section);
  }

  function setupReviewCarousel() {
    const track = document.querySelector("#reviewTrack");
    const carousel = document.querySelector(".review-carousel");
    if (!track || !carousel) return;

    const originalCards = Array.from(track.children).filter(
      (card) => !card.hasAttribute("data-review-clone")
    );
    if (!originalCards.length) return;

    let resizeTimer;
    let lastWidth = window.innerWidth;

    const removeClones = () => {
      track.querySelectorAll("[data-review-clone='true']").forEach((clone) => clone.remove());
    };

    const getOriginalWidth = () => {
      const styles = getComputedStyle(track);
      const gap = parseFloat(styles.columnGap || styles.gap) || 0;
      const cardsWidth = originalCards.reduce((total, card) => {
        return total + card.getBoundingClientRect().width;
      }, 0);
      return cardsWidth + gap * originalCards.length;
    };

    const restartAnimation = () => {
      track.style.animation = "none";
      track.offsetHeight;
      track.style.animation = "";
    };

    const buildCarousel = () => {
      track.style.animationPlayState = "paused";
      removeClones();

      const originalWidth = getOriginalWidth();
      if (!originalWidth) return;

      track.style.setProperty("--review-distance", `${originalWidth}px`);

      let safetyCount = 0;
      while (track.scrollWidth < carousel.offsetWidth + originalWidth * 3 && safetyCount < 30) {
        originalCards.forEach((card) => {
          const clone = card.cloneNode(true);
          clone.setAttribute("aria-hidden", "true");
          clone.setAttribute("data-review-clone", "true");
          track.appendChild(clone);
        });
        safetyCount += 1;
      }

      restartAnimation();
      track.style.animationPlayState = "running";
    };

    requestAnimationFrame(() => requestAnimationFrame(buildCarousel));
    window.addEventListener("load", () => setTimeout(buildCarousel, 300));
    document.fonts?.ready.then(buildCarousel);

    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        const currentWidth = window.innerWidth;
        if (Math.abs(currentWidth - lastWidth) < 24) return;
        lastWidth = currentWidth;
        buildCarousel();
      }, 250);
    });
  }

  function setupContactForm() {
    const form = document.querySelector("#contactForm");
    if (!form) return;

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const submitButton = form.querySelector('button[type="submit"]');
      const originalText = submitButton?.textContent || "Send message";
      const data = new FormData(form);

      const payload = {
        firstName: data.get("firstName"),
        lastName: data.get("lastName"),
        email: data.get("email"),
        subject: data.get("subject"),
        phone: data.get("phone"),
        smsConsent: data.get("smsConsent") === "yes",
        message: data.get("message"),
      };

      setSubmitState(submitButton, true, originalText, "Sending...");

      try {
        const result = await postJson("/contact", payload);
        if (!result.success) throw new Error(result.message || "Contact form submission failed.");
        form.reset();
        alert("Your message has been sent. Thank you for reaching out!");
      } catch (error) {
        console.error("Contact form error:", error);
        alert("Something went wrong. Please try again.");
      } finally {
        setSubmitState(submitButton, false, originalText);
      }
    });
  }

  function setupOrderForm() {
    const form = document.querySelector("#orderForm");
    if (!form) return;

    const elements = {
      qty: form.querySelectorAll('input[name$="Qty"]'),
      strawberry: form.querySelectorAll('input[name$="Strawberry"]'),
      fulfillment: form.querySelectorAll('input[name="fulfillment"]'),
      payment: form.querySelectorAll('input[name="paymentMethod"]'),
      deliveryAddress: document.querySelector("#deliveryAddress"),
      pickupNote: document.querySelector("#pickupNote"),
      deliveryStreet: form.querySelector('input[name="deliveryStreet"]'),
      deliveryZip: form.querySelector('input[name="deliveryZip"]'),
      deliveryEstimate: document.querySelector("#deliveryEstimate"),
      paymentDetails: document.querySelector("#paymentDetails"),
      fulfillmentDate: form.querySelector("#fulfillmentDate"),
      fulfillmentTime: form.querySelector("#fulfillmentTime"),
      submitButton: form.querySelector('button[type="submit"]'),
    };

    preselectFlavor(form);
    setupFulfillmentSchedule(elements);

    [
      ...elements.qty,
      ...elements.strawberry,
      ...elements.fulfillment,
      ...elements.payment,
      elements.deliveryStreet,
      elements.deliveryZip,
      elements.fulfillmentDate,
      elements.fulfillmentTime,
    ].filter(Boolean).forEach((input) => {
      input.addEventListener("input", syncOrderState);
      input.addEventListener("change", syncOrderState);
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      syncOrderState();

      const order = buildOrderPayload(new FormData(form));
      const validationMessage = validateOrder(order);
      if (validationMessage) {
        alert(validationMessage);
        return;
      }

      setSubmitState(elements.submitButton, true, "Submit order", "Submitting...");

      try {
        const result = await postJson("/orders", order);
        if (!result.success) throw new Error(result.message || "Order submission failed.");
        form.reset();
        setupFulfillmentSchedule(elements);
        syncOrderState();
        alert("Your cookie order has been received! We’ll text you with updates.");
      } catch (error) {
        console.error("Order form error:", error);
        alert("Something went wrong submitting your order. Please try again or text us directly.");
      } finally {
        setSubmitState(elements.submitButton, false, "Submit order");
      }
    });

    syncOrderState();

    function syncOrderState() {
      const isDelivery = getFulfillment(form) === "delivery";
      elements.deliveryAddress?.classList.toggle("is-visible", isDelivery);
      elements.pickupNote?.classList.toggle("is-visible", !isDelivery);
      syncStrawberryLimits(form);
      updateDeliveryEstimate(elements, isDelivery);
      updatePaymentDetails(elements, form);
      enforceMinimumFulfillmentDate(elements.fulfillmentDate);
      updateOrderSummary(form);
    }
  }

  function preselectFlavor(form) {
    const selectedFlavor = new URLSearchParams(window.location.search).get("flavor");
    if (!COOKIE_FLAVORS.includes(selectedFlavor)) return;
    const input = form.querySelector(`input[name="${selectedFlavor}Qty"]`);
    if (input) input.value = "1";
  }

  function setupFulfillmentSchedule({ fulfillmentDate, fulfillmentTime }) {
    if (!fulfillmentDate || !fulfillmentTime) return;
    enforceMinimumFulfillmentDate(fulfillmentDate);
    buildTimeOptions(fulfillmentTime);
  }

  function buildTimeOptions(select) {
    const currentValue = select.value;
    select.innerHTML = '<option value="">Select a time</option>';

    for (let hour = 11; hour <= 19; hour += 1) {
      for (let minute = 0; minute < 60; minute += 15) {
        if (hour === 19 && minute > 0) break;
        const value = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
        select.append(new Option(formatTimeLabel(value), value));
      }
    }

    if (currentValue) select.value = currentValue;
  }

  function enforceMinimumFulfillmentDate(input) {
    if (!input) return;
    const tomorrow = getTomorrowDateString();
    input.min = tomorrow;
    if (!input.value || input.value < tomorrow) input.value = tomorrow;
  }

  function syncStrawberryLimits(form) {
    COOKIE_FLAVORS.forEach((flavor) => {
      const qtyInput = form.querySelector(`input[name="${flavor}Qty"]`);
      const strawberryInput = form.querySelector(`input[name="${flavor}Strawberry"]`);
      if (!qtyInput || !strawberryInput) return;

      const cookieQty = getNumber(qtyInput.value);
      const strawberryQty = getNumber(strawberryInput.value);
      strawberryInput.max = String(cookieQty);

      if (cookieQty === 0) strawberryInput.value = "0";
      else if (strawberryQty > cookieQty) strawberryInput.value = String(cookieQty);
    });
  }

  function updateDeliveryEstimate({ deliveryZip, deliveryEstimate }, isDelivery) {
    if (!deliveryEstimate) return;
    if (!isDelivery) {
      deliveryEstimate.textContent = "";
      return;
    }

    const zip = normalizeZip(deliveryZip?.value);
    if (!zip) {
      deliveryEstimate.textContent = "Enter your ZIP code to estimate delivery.";
      return;
    }

    if (!isValidZip(zip)) {
      deliveryEstimate.textContent = "Please enter a valid 5-digit ZIP code.";
      return;
    }

    const fee = estimateDeliveryFee(zip);
    deliveryEstimate.textContent = fee === null ? "Delivery fee will be confirmed by text." : `Estimated delivery fee: $${fee}`;
  }

  function updatePaymentDetails({ paymentDetails }, form) {
    if (!paymentDetails) return;
    const paymentMethod = form.querySelector('input[name="paymentMethod"]:checked')?.value;
    const details = PAYMENT_DETAILS[paymentMethod];

    if (!details) {
      paymentDetails.classList.remove("is-visible");
      paymentDetails.innerHTML = "";
      return;
    }

    paymentDetails.innerHTML = details.map((line) => `<p>${line}</p>`).join("");
    paymentDetails.classList.add("is-visible");
  }

  function validateOrder(order) {
    if (order.totalCookies < 1) return "Please choose at least one cookie before submitting your order.";
    if (!order.fulfillmentDate || !order.fulfillmentTime) return "Please choose a pickup or delivery date and time.";
    if (order.fulfillmentDate < getTomorrowDateString()) return "Please choose a date that is at least one day from today.";

    if (order.fulfillment === "delivery") {
      if (!order.deliveryStreet.trim()) return "Please add your street address.";
      if (!order.deliveryZip) return "Please add your delivery ZIP code.";
      if (!isValidZip(order.deliveryZip)) return "Please enter a valid 5-digit delivery ZIP code.";
    }

    return "";
  }

  function buildOrderPayload(formData) {
    const flavors = COOKIE_FLAVORS.map((flavor) => {
      const quantity = getNumber(formData.get(`${flavor}Qty`));
      const strawberry = Math.min(quantity, getNumber(formData.get(`${flavor}Strawberry`)));
      return { flavor, name: COOKIE_NAMES[flavor], quantity, strawberry };
    });

    const fulfillment = formData.get("fulfillment") || "pickup";
    const deliveryZip = normalizeZip(formData.get("deliveryZip"));
    const deliveryFee = fulfillment === "delivery" ? estimateDeliveryFee(deliveryZip) || 0 : 0;
    const totalCookies = flavors.reduce((sum, item) => sum + item.quantity, 0);
    const cookieSubtotal = calculateCookieSubtotal(totalCookies);
    const strawberryTotal = flavors.reduce((sum, item) => sum + item.strawberry, 0);

    return {
      firstName: formData.get("firstName"),
      lastName: formData.get("lastName"),
      phone: formData.get("phone"),
      email: formData.get("email"),
      smsConsent: formData.get("smsConsent") === "yes",
      fulfillment,
      fulfillmentDate: formData.get("fulfillmentDate") || "",
      fulfillmentTime: formData.get("fulfillmentTime") || "",
      deliveryStreet: formData.get("deliveryStreet") || "",
      deliveryZip,
      deliveryFee,
      paymentMethod: formData.get("paymentMethod"),
      notes: formData.get("notes") || "",
      flavors,
      totalCookies,
      cookieSubtotal,
      strawberryTotal,
      estimatedTotal: cookieSubtotal + strawberryTotal + deliveryFee,
    };
  }

  function updateOrderSummary(form) {
    const payload = buildOrderPayload(new FormData(form));
    updateText("#summaryCount", payload.totalCookies);
    updateText("#summarySubtotal", formatCurrency(payload.cookieSubtotal));
    updateText("#summaryStrawberries", formatCurrency(payload.strawberryTotal));
    updateText("#summaryDelivery", formatCurrency(payload.deliveryFee));
    updateText("#summaryTotal", formatCurrency(payload.estimatedTotal));
  }

  function getFulfillment(form) {
    return form.querySelector('input[name="fulfillment"]:checked')?.value || "pickup";
  }

  function estimateDeliveryFee(zip) {
    const normalizedZip = normalizeZip(zip);
    if (!isValidZip(normalizedZip)) return null;
    return DELIVERY_FEES_BY_ZIP[normalizedZip] ?? null;
  }

  function getTomorrowDateString() {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    return formatDateForInput(date);
  }

  function formatDateForInput(date) {
    return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
  }

  function formatTimeLabel(value) {
    const [hourText = "0", minuteText = "00"] = String(value).split(":");
    const hour = Number(hourText);
    const period = hour >= 12 ? "PM" : "AM";
    return `${hour % 12 || 12}:${minuteText.padStart(2, "0")} ${period}`;
  }

  function normalizeZip(value) {
    return String(value || "").replace(/\D/g, "").slice(0, 5);
  }

  function isValidZip(zip) {
    return /^\d{5}$/.test(zip);
  }

  function calculateCookieSubtotal(quantity) {
    if (quantity <= 0) return 0;
    if (quantity === 1) return 6;
    if (quantity <= 3) return 15;
    if (quantity <= 5) return 20;
    if (quantity <= 7) return 24;
    return Math.floor(quantity * (24 / 7));
  }

  function getNumber(value) {
    return Math.max(0, Number(value) || 0);
  }

  function formatCurrency(value) {
    return `$${Number(value).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  }

  function updateText(selector, value) {
    const element = document.querySelector(selector);
    if (element) element.textContent = value;
  }

  async function postJson(path, payload) {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    if (!response.ok) throw new Error(result.message || `Request failed: ${path}`);
    return result;
  }

  function setSubmitState(button, isSending, originalText = "Send message", sendingText = "Sending...") {
    if (!button) return;
    button.disabled = isSending;
    button.textContent = isSending ? sendingText : originalText;
  }
});
