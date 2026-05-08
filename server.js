import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import nodemailer from "nodemailer";
import twilio from "twilio";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.join(__dirname, "public");
const HTML_DIR = path.join(PUBLIC_DIR, "html");

const ORDER_EMAIL_TO = process.env.ORDER_EMAIL_TO || "hello@emkari.com";
const OWNER_PHONE_NUMBER = process.env.OWNER_PHONE_NUMBER || "+16194950207";
const TWILIO_FROM = process.env.TWILIO_PHONE_NUMBER;

const COOKIE_NAMES = {
  dubai: "Dubai Cookie",
  ferrero: "Ferrero Rocher Cookie",
  biscoff: "Biscoff Cookie",
};

const ALLOWED_FLAVORS = Object.keys(COOKIE_NAMES);
const ALLOWED_PAYMENTS = ["zelle", "cashapp", "venmo", "cash"];
const ALLOWED_FULFILLMENTS = ["pickup", "delivery"];

const DELIVERY_FEES_BY_ZIP = {
  "92121": 5,
  "92126": 5,
  "92131": 5,

  "92064": 6,
  "92145": 6,

  "92108": 7,
  "92110": 7,
  "92111": 7,
  "92117": 7,
  "92122": 7,
  "92123": 7,
  "92130": 7,

  "92037": 8,
  "92106": 8,
  "92107": 8,
  "92109": 8,
  "92119": 8,
  "92120": 8,
  "92124": 8,
  "92140": 8,

  "92101": 9,
  "92102": 9,
  "92103": 9,
  "92104": 9,
  "92105": 9,
  "92113": 9,
  "92114": 9,
  "92115": 9,
  "92116": 9,

  "91902": 10,
  "91910": 10,
  "91911": 10,
  "91913": 10,
  "91914": 10,
  "91915": 10,
  "91932": 10,
  "91941": 10,
  "91942": 10,
  "91945": 10,
  "91950": 10,
  "91977": 10,
  "91978": 10,
  "92019": 10,
  "92020": 10,
  "92021": 10,
  "92040": 10,
  "92071": 10,
  "92139": 10,
  "92154": 10,
  "92173": 10,
};

const PAYMENT_LABELS = {
  zelle: "Zelle",
  cashapp: "Cash App",
  venmo: "Venmo",
  cash: "Cash",
};

const FULFILLMENT_LABELS = {
  pickup: "Pickup",
  delivery: "Delivery",
};

const allowedOrigins = (
  process.env.ALLOWED_ORIGINS ||
  "https://emkari.com,https://www.emkari.com,https://emkari.onrender.com,http://localhost:3000"
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const twilioClient =
  process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
    ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
    : null;

const mailTransporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: Number(process.env.SMTP_PORT) === 465,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

/* ----------------------------- Middleware ----------------------------- */

app.set("trust proxy", 1);

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error("Not allowed by CORS"));
    },
  })
);

app.use(express.json({ limit: "25kb" }));
app.use(express.urlencoded({ extended: true, limit: "25kb" }));

app.use(
  express.static(PUBLIC_DIR, {
    dotfiles: "ignore",
    index: "index.html",
  })
);

const formLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many requests. Please try again later.",
  },
});

const smsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many SMS requests. Please try again later.",
  },
});

function requireAdminToken(req, res, next) {
  const token = req.headers["x-admin-token"];

  if (!process.env.ADMIN_SMS_TOKEN || token !== process.env.ADMIN_SMS_TOKEN) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized.",
    });
  }

  next();
}

/* ----------------------------- Pages ----------------------------- */

app.get("/", (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

app.get("/about", (_req, res) => {
  res.sendFile(path.join(HTML_DIR, "about.html"));
});

app.get("/order", (_req, res) => {
  res.sendFile(path.join(HTML_DIR, "order.html"));
});

app.get("/contact", (_req, res) => {
  res.sendFile(path.join(HTML_DIR, "contact.html"));
});

app.get("/privacy", (_req, res) => {
  res.sendFile(path.join(HTML_DIR, "privacy.html"));
});

app.get("/health", (_req, res) => {
  res.status(200).json({
    success: true,
    message: "Emkari backend is running.",
  });
});

/* ----------------------------- Public Routes ----------------------------- */

app.post("/contact", formLimiter, async (req, res) => {
  try {
    const contact = sanitizeContact(req.body);
    const missingFields = getMissingFields(contact, [
      "firstName",
      "lastName",
      "email",
      "subject",
      "message",
    ]);

    if (missingFields.length) {
      return sendBadRequest(
        res,
        "Please fill out all required fields.",
        missingFields
      );
    }

    const validationMessage = validateContact(contact);

    if (validationMessage) {
      return sendBadRequest(res, validationMessage);
    }

    await sendContactEmail(contact);

    if (contact.phone && contact.smsConsent && isValidPhone(contact.phone)) {
      await sendSmsSafe({
        to: contact.phone,
        body: `Hi ${contact.firstName}, this is Emkari! We received your message about "${contact.subject}" and we’ll get back to you soon. Reply STOP to opt out.`,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Message sent successfully.",
    });
  } catch (error) {
    console.error("Contact form error:", error);
    return sendServerError(res);
  }
});

app.post("/orders", formLimiter, async (req, res) => {
  try {
    const order = sanitizeOrder(req.body);
    const missingFields = getMissingFields(order, [
      "firstName",
      "lastName",
      "phone",
      "fulfillment",
      "fulfillmentDate",
      "fulfillmentTime",
      "paymentMethod",
    ]);

    if (!order.smsConsent) missingFields.push("smsConsent");

    if (missingFields.length) {
      return sendBadRequest(
        res,
        "Please fill out all required order fields.",
        missingFields
      );
    }

    const validationMessage = validateOrder(order);

    if (validationMessage) {
      return sendBadRequest(res, validationMessage);
    }

    const verifiedOrder = verifyOrderTotals(order);

    await sendOrderEmail(verifiedOrder);

    await Promise.allSettled([
      sendOwnerOrderSms(verifiedOrder),
      sendCustomerOrderReceivedSms(verifiedOrder),
    ]);

    return res.status(200).json({
      success: true,
      message: "Order received successfully.",
      orderId: verifiedOrder.orderId,
      total: verifiedOrder.estimatedTotal,
      flavorSummary: formatFlavorText(verifiedOrder.flavors),
    });
  } catch (error) {
    console.error("Order form error:", error);
    return sendServerError(res);
  }
});

/* ----------------------------- Admin SMS Routes ----------------------------- */

app.post("/confirm-order", smsLimiter, requireAdminToken, async (req, res) => {
  try {
    const confirmation = sanitizeConfirmation(req.body);
    const missingFields = getMissingFields(confirmation, [
      "firstName",
      "phone",
      "orderId",
    ]);

    if (missingFields.length) {
      return sendBadRequest(
        res,
        "First name, phone number, and order ID are required.",
        missingFields
      );
    }

    if (!isValidPhone(confirmation.phone)) {
      return sendBadRequest(res, "Please provide a valid U.S. phone number.");
    }

    await sendConfirmOrderSms(confirmation);

    return res.status(200).json({
      success: true,
      message: "Confirmation SMS sent.",
    });
  } catch (error) {
    console.error("Confirm order SMS error:", error);
    return sendServerError(
      res,
      "Something went wrong sending the confirmation SMS."
    );
  }
});

app.post("/order-ready", smsLimiter, requireAdminToken, async (req, res) => {
  try {
    const update = sanitizeOrderReady(req.body);

    if (!update.firstName || !update.phone) {
      return sendBadRequest(res, "First name and phone number are required.");
    }

    if (!isValidPhone(update.phone)) {
      return sendBadRequest(res, "Please provide a valid U.S. phone number.");
    }

    const isDelivery = update.fulfillment === "delivery";
    const body = isDelivery
      ? `Hi ${update.firstName}, Emkari here! Your cookies${
          update.orderId ? ` for order ${update.orderId}` : ""
        } are ready. ${
          update.deliveryMessage ||
          "Reply with a good time for delivery and we’ll coordinate."
        }`
      : `Hi ${update.firstName}, Emkari here! Your cookies${
          update.orderId ? ` for order ${update.orderId}` : ""
        } are ready for pickup. Thank you for ordering!`;

    await sendSms({
      to: update.phone,
      body,
    });

    return res.status(200).json({
      success: true,
      message: "Ready SMS sent.",
    });
  } catch (error) {
    console.error("Order ready SMS error:", error);
    return sendServerError(res);
  }
});

app.post("/mark-answered", smsLimiter, requireAdminToken, async (req, res) => {
  try {
    const firstName = cleanText(req.body.firstName, 40);
    const phone = normalizePhone(req.body.phone);

    if (!firstName || !phone) {
      return sendBadRequest(res, "First name and phone number are required.");
    }

    if (!isValidPhone(phone)) {
      return sendBadRequest(res, "Please provide a valid U.S. phone number.");
    }

    await sendSms({
      to: phone,
      body: `Hi ${firstName}, Emkari here! Your message has been answered. Check your email when you have a moment. We’re excited to connect with you!`,
    });

    return res.status(200).json({
      success: true,
      message: "Answered SMS sent.",
    });
  } catch (error) {
    console.error("Answered SMS error:", error);
    return sendServerError(res);
  }
});

/* ----------------------------- Sanitizers ----------------------------- */

function sanitizeContact(body = {}) {
  return {
    firstName: cleanText(body.firstName, 40),
    lastName: cleanText(body.lastName, 40),
    email: cleanText(body.email, 120).toLowerCase(),
    subject: cleanText(body.subject, 80),
    phone: normalizePhone(body.phone),
    smsConsent: Boolean(body.smsConsent),
    message: cleanMultiline(body.message, 2000),
  };
}

function sanitizeOrder(body = {}) {
  const flavors = Array.isArray(body.flavors)
    ? body.flavors.map(sanitizeFlavor)
    : [];

  return {
    orderId: createOrderId(),
    firstName: cleanText(body.firstName, 40),
    lastName: cleanText(body.lastName, 40),
    phone: normalizePhone(body.phone),
    smsConsent: Boolean(body.smsConsent),
    fulfillment: cleanText(body.fulfillment, 20).toLowerCase(),
    fulfillmentDate: cleanText(body.fulfillmentDate, 20),
    fulfillmentTime: cleanText(body.fulfillmentTime, 20),
    deliveryStreet: cleanText(body.deliveryStreet, 120),
    deliveryZip: normalizeZip(body.deliveryZip),
    paymentMethod: cleanText(body.paymentMethod, 20).toLowerCase(),
    notes: cleanMultiline(body.notes, 1000),
    flavors,
  };
}

function sanitizeFlavor(item = {}) {
  const flavor = cleanText(item.flavor, 20).toLowerCase();

  if (!ALLOWED_FLAVORS.includes(flavor)) {
    return {
      flavor: "",
      name: "",
      quantity: 0,
      strawberry: 0,
    };
  }

  const quantity = clampNumber(item.quantity, 0, 99);
  const strawberry = clampNumber(item.strawberry, 0, quantity);

  return {
    flavor,
    name: COOKIE_NAMES[flavor],
    quantity,
    strawberry,
  };
}

function sanitizeConfirmation(body = {}) {
  return {
    firstName: cleanText(body.firstName, 40),
    phone: normalizePhone(body.phone),
    orderId: cleanText(body.orderId, 30),
    fulfillment: cleanText(body.fulfillment, 20).toLowerCase(),
    fulfillmentDate: cleanText(body.fulfillmentDate, 20),
    fulfillmentTime: cleanText(body.fulfillmentTime, 20),
    total: clampNumber(body.total, 0, 9999),
    paymentMethod: cleanText(body.paymentMethod, 20).toLowerCase(),
    pickupMessage: cleanMultiline(body.pickupMessage, 300),
    deliveryMessage: cleanMultiline(body.deliveryMessage, 300),
  };
}

function sanitizeOrderReady(body = {}) {
  return {
    firstName: cleanText(body.firstName, 40),
    phone: normalizePhone(body.phone),
    orderId: cleanText(body.orderId, 30),
    fulfillment: cleanText(body.fulfillment, 20).toLowerCase(),
    deliveryMessage: cleanMultiline(body.deliveryMessage, 300),
  };
}

/* ----------------------------- Validation ----------------------------- */

function validateContact(contact) {
  if (!isValidEmail(contact.email)) {
    return "Please enter a valid email address.";
  }

  if (contact.phone && !isValidPhone(contact.phone)) {
    return "Please enter a valid U.S. phone number.";
  }

  return "";
}

function validateOrder(order) {
  if (!isValidPhone(order.phone)) {
    return "Please enter a valid U.S. phone number.";
  }

  if (!ALLOWED_FULFILLMENTS.includes(order.fulfillment)) {
    return "Please choose pickup or delivery.";
  }

  if (!ALLOWED_PAYMENTS.includes(order.paymentMethod)) {
    return "Please choose a valid payment method.";
  }

  if (!order.flavors.length || !order.flavors.every(isValidFlavorItem)) {
    return "Please choose valid cookie flavors.";
  }

  const totalCookies = getTotalCookies(order.flavors);
  const cookieSubtotal = calculateCookieSubtotal(totalCookies);

  if (totalCookies <= 0) {
    return "Please select at least one cookie.";
  }

  if (!isValidDateString(order.fulfillmentDate)) {
    return "Please choose a valid pickup or delivery date.";
  }

  if (order.fulfillmentDate < getTomorrowDateString()) {
    return "Orders must be scheduled at least one day in advance.";
  }

  if (!isValidFulfillmentTime(order.fulfillmentTime)) {
    return "Please choose a valid pickup or delivery time.";
  }

  if (order.fulfillment === "delivery") {
    if (cookieSubtotal < 24) {
      return "Delivery is only available for cookie orders of $24 or more.";
    }

    if (!order.deliveryStreet || !order.deliveryZip) {
      return "Please provide your delivery street address and ZIP code.";
    }

    if (!isValidZip(order.deliveryZip)) {
      return "Please provide a valid 5-digit delivery ZIP code.";
    }

    if (!Object.hasOwn(DELIVERY_FEES_BY_ZIP, order.deliveryZip)) {
      return "Delivery is not currently available for that ZIP code.";
    }
  }

  return "";
}

function isValidFlavorItem(item) {
  return (
    item &&
    ALLOWED_FLAVORS.includes(item.flavor) &&
    item.name === COOKIE_NAMES[item.flavor] &&
    Number.isInteger(item.quantity) &&
    Number.isInteger(item.strawberry) &&
    item.quantity >= 0 &&
    item.quantity <= 99 &&
    item.strawberry >= 0 &&
    item.strawberry <= item.quantity
  );
}

function verifyOrderTotals(order) {
  const totalCookies = getTotalCookies(order.flavors);
  const strawberryTotal = getTotalStrawberries(order.flavors);
  const cookieSubtotal = calculateCookieSubtotal(totalCookies);
  const deliveryFee =
    order.fulfillment === "delivery" ? estimateDeliveryFee(order.deliveryZip) : 0;

  return {
    ...order,
    totalCookies,
    strawberryTotal,
    cookieSubtotal,
    deliveryFee,
    estimatedTotal: cookieSubtotal + strawberryTotal + deliveryFee,
  };
}

/* ----------------------------- Email ----------------------------- */

async function sendContactEmail(contact) {
  await mailTransporter.sendMail({
    from: `"Emkari Website" <${process.env.SMTP_USER}>`,
    to: ORDER_EMAIL_TO,
    replyTo: contact.email,
    subject: `New Emkari Form Submission: ${contact.subject}`,
    priority: "high",
    headers: highPriorityHeaders(),
    html: `
      <div style="font-family: Arial, sans-serif; color: #302a27; line-height: 1.6;">
        <h2>New Contact Form Submission</h2>

        <p><strong>Name:</strong> ${escapeHtml(contact.firstName)} ${escapeHtml(contact.lastName)}</p>
        <p><strong>Email:</strong> ${escapeHtml(contact.email)}</p>
        <p><strong>Phone:</strong> ${escapeHtml(contact.phone || "Not provided")}</p>
        <p><strong>SMS consent:</strong> ${contact.smsConsent ? "Yes" : "No"}</p>
        <p><strong>Subject:</strong> ${escapeHtml(contact.subject)}</p>

        <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;" />

        <p><strong>Message:</strong></p>
        <p>${escapeHtml(contact.message).replaceAll("\n", "<br />")}</p>
      </div>
    `,
  });
}

async function sendOrderEmail(order) {
  await mailTransporter.sendMail({
    from: `"Emkari Cookie Orders" <${process.env.SMTP_USER}>`,
    to: ORDER_EMAIL_TO,
    replyTo: process.env.SMTP_USER,
    subject: `New Cookie Order ${order.orderId} — ${order.firstName} ${order.lastName}`,
    priority: "high",
    headers: highPriorityHeaders(),
    html: `
      <div style="font-family: Arial, sans-serif; color: #302a27; line-height: 1.6;">
        <h2>New Cookie Order</h2>

        <p><strong>Order ID:</strong> ${escapeHtml(order.orderId)}</p>
        <p><strong>Name:</strong> ${escapeHtml(order.firstName)} ${escapeHtml(order.lastName)}</p>
        <p><strong>Phone:</strong> ${escapeHtml(order.phone)}</p>
        <p><strong>SMS consent:</strong> ${order.smsConsent ? "Yes" : "No"}</p>

        <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;" />

        <p><strong>Fulfillment:</strong> ${escapeHtml(formatFulfillment(order.fulfillment))}</p>
        <p><strong>Date:</strong> ${escapeHtml(order.fulfillmentDate)}</p>
        <p><strong>Time:</strong> ${escapeHtml(formatTimeLabel(order.fulfillmentTime))}</p>
        <p><strong>Delivery street:</strong> ${escapeHtml(order.deliveryStreet || "N/A")}</p>
        <p><strong>Delivery ZIP:</strong> ${escapeHtml(order.deliveryZip || "N/A")}</p>

        <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;" />

        <p><strong>Total cookies:</strong> ${order.totalCookies}</p>
        <p><strong>Cookie subtotal:</strong> ${formatCurrency(order.cookieSubtotal)}</p>
        <p><strong>Strawberry add-ons:</strong> ${formatCurrency(order.strawberryTotal)}</p>
        <p><strong>Delivery fee:</strong> ${formatCurrency(order.deliveryFee)}</p>

        <p><strong>Flavors:</strong></p>
        <ul>${formatFlavorHtml(order.flavors)}</ul>

        <p><strong>Payment method:</strong> ${escapeHtml(formatPaymentMethod(order.paymentMethod))}</p>
        <p><strong>Total:</strong> ${formatCurrency(order.estimatedTotal)}</p>

        <p><strong>Customer notes:</strong></p>
        <p>${escapeHtml(order.notes || "None").replaceAll("\n", "<br />")}</p>
      </div>
    `,
  });
}

/* ----------------------------- SMS ----------------------------- */

async function sendOwnerOrderSms(order) {
  await sendSmsSafe({
    to: OWNER_PHONE_NUMBER,
    body: `
New Emkari order ${order.orderId}

Name: ${order.firstName} ${order.lastName}
Phone: ${order.phone}

Order: ${formatFlavorText(order.flavors)}
Total cookies: ${order.totalCookies}
Strawberries: ${order.strawberryTotal}
Total: ${formatCurrency(order.estimatedTotal)}

Fulfillment: ${formatFulfillment(order.fulfillment)}
Date/time: ${order.fulfillmentDate} at ${formatTimeLabel(order.fulfillmentTime)}
Delivery: ${order.deliveryStreet || "N/A"} ${order.deliveryZip || ""}

Payment: ${formatPaymentMethod(order.paymentMethod)}
Notes: ${order.notes || "None"}
    `.trim(),
  });
}

async function sendCustomerOrderReceivedSms(order) {
  await sendSmsSafe({
    to: order.phone,
    body: `Hi ${order.firstName}, Emkari received your cookie order ${order.orderId}! Order: ${order.totalCookies} cookie(s). Total: ${formatCurrency(
      order.estimatedTotal
    )}. Scheduled for ${order.fulfillmentDate} at ${formatTimeLabel(
      order.fulfillmentTime
    )}. We’ll text you to confirm payment and ${
      order.fulfillment === "delivery" ? "delivery details." : "pickup details."
    } Reply STOP to opt out.`,
  });
}

async function sendConfirmOrderSms(confirmation) {
  const isDelivery = confirmation.fulfillment === "delivery";
  const detailsMessage = isDelivery
    ? confirmation.deliveryMessage ||
      "Your delivery details have been reviewed and confirmed."
    : confirmation.pickupMessage ||
      "Pickup address/details will be sent before your scheduled pickup time.";

  await sendSms({
    to: confirmation.phone,
    body: `
Hi ${confirmation.firstName}, Emkari here! Your order ${confirmation.orderId} is confirmed.

Scheduled for: ${confirmation.fulfillmentDate || "N/A"} at ${formatTimeLabel(
      confirmation.fulfillmentTime
    )}
Total: ${formatCurrency(confirmation.total)}
Payment method: ${formatPaymentMethod(confirmation.paymentMethod)}

${detailsMessage}

Thank you for ordering from Emkari! Reply STOP to opt out.
    `.trim(),
  });
}

async function sendSmsSafe({ to, body }) {
  try {
    await sendSms({ to, body });
  } catch (error) {
    console.error("SMS failed but request continued:", error?.message || error);
  }
}

async function sendSms({ to, body }) {
  if (!twilioClient || !TWILIO_FROM || !to || !body) {
    console.warn("SMS skipped. Missing Twilio setup, recipient, or message.");
    return;
  }

  await twilioClient.messages.create({
    body,
    from: TWILIO_FROM,
    to,
  });
}

/* ----------------------------- Helpers ----------------------------- */

function calculateCookieSubtotal(quantity) {
  const count = clampNumber(quantity, 0, 999);

  if (count <= 0) return 0;
  if (count === 1) return 6;
  if (count <= 3) return 15;
  if (count <= 5) return 20;
  if (count <= 7) return 24;

  return Math.floor(count * (24 / 7));
}

function estimateDeliveryFee(zip = "") {
  const normalizedZip = normalizeZip(zip);

  if (!isValidZip(normalizedZip)) return 0;

  return DELIVERY_FEES_BY_ZIP[normalizedZip] || 0;
}

function getTotalCookies(flavors = []) {
  return flavors.reduce((sum, item) => sum + clampNumber(item.quantity, 0, 99), 0);
}

function getTotalStrawberries(flavors = []) {
  return flavors.reduce((sum, item) => sum + clampNumber(item.strawberry, 0, 99), 0);
}

function isValidFulfillmentTime(time = "") {
  const match = String(time).match(/^(\d{2}):(\d{2})$/);

  if (!match) return false;

  const hour = Number(match[1]);
  const minute = Number(match[2]);

  return (
    [0, 15, 30, 45].includes(minute) &&
    hour >= 11 &&
    hour <= 19 &&
    !(hour === 19 && minute > 0)
  );
}

function getTomorrowDateString() {
  const date = new Date();
  date.setDate(date.getDate() + 1);

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function createOrderId() {
  const random = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `EMK-${Date.now().toString().slice(-6)}-${random}`;
}

function cleanText(value = "", maxLength = 500) {
  if (value === null || value === undefined) return "";

  return String(value)
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function cleanMultiline(value = "", maxLength = 1000) {
  if (value === null || value === undefined) return "";

  return String(value)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
    .replace(/\r\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim()
    .slice(0, maxLength);
}

function clampNumber(value, min, max) {
  const number = Number(value);

  if (!Number.isFinite(number)) return min;

  return Math.min(Math.max(Math.floor(number), min), max);
}

function normalizeZip(value = "") {
  return String(value).replace(/\D/g, "").slice(0, 5);
}

function normalizePhone(value = "") {
  const phone = cleanText(value, 30);

  if (!phone) return "";
  if (phone.startsWith("+")) return phone.replace(/[^\d+]/g, "");

  const digits = phone.replace(/\D/g, "");

  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;

  return "";
}

function isValidZip(zip = "") {
  return /^\d{5}$/.test(zip);
}

function isValidPhone(phone = "") {
  return /^\+1\d{10}$/.test(phone);
}

function isValidEmail(email = "") {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 120;
}

function isValidDateString(value = "") {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatCurrency(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function formatFlavorHtml(flavors = []) {
  return flavors
    .filter((item) => item.quantity > 0)
    .map((item) => {
      const strawberryLine =
        item.strawberry > 0
          ? `<br /><small>Strawberry add-ons: ${item.strawberry}</small>`
          : "";

      return `
        <li>
          ${escapeHtml(item.name)}: ${item.quantity}
          ${strawberryLine}
        </li>
      `;
    })
    .join("");
}

function formatFlavorText(flavors = []) {
  return (
    flavors
      .filter((item) => item.quantity > 0)
      .map((item) => {
        const strawberryText =
          item.strawberry > 0
            ? ` + ${item.strawberry} strawberry add-on(s)`
            : "";

        return `${item.quantity} ${item.name}${strawberryText}`;
      })
      .join("; ") || "None"
  );
}

function formatFulfillment(value = "") {
  return FULFILLMENT_LABELS[value] || value || "N/A";
}

function formatPaymentMethod(value = "") {
  return PAYMENT_LABELS[value] || value || "N/A";
}

function formatTimeLabel(value = "") {
  if (!value) return "N/A";

  const [hourString, minuteString] = value.split(":");
  const hour = Number(hourString);
  const minute = Number(minuteString);

  if (Number.isNaN(hour) || Number.isNaN(minute)) return value;

  const period = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;

  return `${displayHour}:${String(minute).padStart(2, "0")} ${period}`;
}

function highPriorityHeaders() {
  return {
    "X-Priority": "1",
    "X-MSMail-Priority": "High",
    Importance: "high",
  };
}

function getMissingFields(object, fields) {
  return fields.filter((field) => !object[field]);
}

function sendBadRequest(res, message, missingFields = []) {
  return res.status(400).json({
    success: false,
    message,
    missingFields,
  });
}

function sendServerError(
  res,
  message = "Something went wrong. Please try again."
) {
  return res.status(500).json({
    success: false,
    message,
  });
}

app.use((_req, res) => {
  res.status(404).json({
    success: false,
    message: "Not found.",
  });
});

app.listen(PORT, () => {
  console.log(`Emkari backend running on port ${PORT}`);
});