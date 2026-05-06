import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import nodemailer from "nodemailer";
import twilio from "twilio";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const ORDER_EMAIL_TO = process.env.ORDER_EMAIL_TO || "hello@emkari.com";
const OWNER_PHONE_NUMBER = process.env.OWNER_PHONE_NUMBER || "+16194950207";
const TWILIO_FROM = process.env.TWILIO_PHONE_NUMBER;

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

app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

app.get("/", (_req, res) => {
  res.send("Emkari backend is running.");
});

app.post("/contact", async (req, res) => {
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

    await sendContactEmail(contact);

    if (contact.phone && contact.smsConsent) {
      await sendSms({
        to: contact.phone,
        body: `Hi ${contact.firstName}, this is Emkari! We received your message about "${contact.subject}" and we’ll get back to you soon. Thank you for reaching out! Reply STOP to opt out.`,
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

app.post("/orders", async (req, res) => {
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
    await sendOwnerOrderSms(verifiedOrder);
    await sendCustomerOrderReceivedSms(verifiedOrder);

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

app.post("/confirm-order", async (req, res) => {
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

app.post("/order-ready", async (req, res) => {
  try {
    const {
      firstName = "",
      phone = "",
      orderId = "",
      fulfillment = "",
      deliveryMessage = "",
    } = req.body;

    if (!firstName || !phone) {
      return sendBadRequest(res, "First name and phone number are required.");
    }

    const isDelivery = fulfillment === "delivery";
    const body = isDelivery
      ? `Hi ${cleanText(firstName)}, Emkari here! Your cookies${
          orderId ? ` for order ${cleanText(orderId)}` : ""
        } are ready. ${
          cleanText(deliveryMessage) ||
          "Reply with a good time for delivery and we’ll coordinate."
        }`
      : `Hi ${cleanText(firstName)}, Emkari here! Your cookies${
          orderId ? ` for order ${cleanText(orderId)}` : ""
        } are ready for pickup. Thank you for ordering!`;

    await sendSms({
      to: normalizePhone(phone),
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

app.post("/mark-answered", async (req, res) => {
  try {
    const firstName = cleanText(req.body.firstName);
    const phone = normalizePhone(req.body.phone);

    if (!firstName || !phone) {
      return sendBadRequest(res, "First name and phone number are required.");
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

app.listen(PORT, () => {
  console.log(`Emkari backend running on port ${PORT}`);
});

/* ----------------------------- Sanitizers ----------------------------- */

function sanitizeContact(body = {}) {
  return {
    firstName: cleanText(body.firstName),
    lastName: cleanText(body.lastName),
    email: cleanText(body.email),
    subject: cleanText(body.subject),
    phone: normalizePhone(body.phone),
    smsConsent: Boolean(body.smsConsent),
    message: cleanText(body.message),
  };
}

function sanitizeOrder(body = {}) {
  const flavors = Array.isArray(body.flavors)
    ? body.flavors.map(sanitizeFlavor)
    : [];

  return {
    orderId: `EMK-${Date.now().toString().slice(-6)}`,
    firstName: cleanText(body.firstName),
    lastName: cleanText(body.lastName),
    phone: normalizePhone(body.phone),
    email: cleanText(body.email),
    smsConsent: Boolean(body.smsConsent),
    fulfillment: cleanText(body.fulfillment),
    fulfillmentDate: cleanText(body.fulfillmentDate),
    fulfillmentTime: cleanText(body.fulfillmentTime),
    deliveryStreet: cleanText(body.deliveryStreet),
    deliveryZip: normalizeZip(body.deliveryZip),
    paymentMethod: cleanText(body.paymentMethod),
    notes: cleanText(body.notes),
    flavors,
    totalCookies: getNumber(body.totalCookies),
    cookieSubtotal: getNumber(body.cookieSubtotal),
    strawberryTotal: getNumber(body.strawberryTotal),
    deliveryFee: getNumber(body.deliveryFee),
    estimatedTotal: getNumber(body.estimatedTotal),
  };
}

function sanitizeFlavor(item = {}) {
  const quantity = getNumber(item.quantity);

  return {
    flavor: cleanText(item.flavor),
    name: cleanText(item.name),
    quantity,
    strawberry: Math.min(quantity, getNumber(item.strawberry)),
  };
}

function sanitizeConfirmation(body = {}) {
  return {
    firstName: cleanText(body.firstName),
    phone: normalizePhone(body.phone),
    orderId: cleanText(body.orderId),
    fulfillment: cleanText(body.fulfillment),
    fulfillmentDate: cleanText(body.fulfillmentDate),
    fulfillmentTime: cleanText(body.fulfillmentTime),
    total: getNumber(body.total),
    paymentMethod: cleanText(body.paymentMethod),
    pickupMessage: cleanText(body.pickupMessage),
    deliveryMessage: cleanText(body.deliveryMessage),
  };
}

/* ----------------------------- Validation ----------------------------- */

function validateOrder(order) {
  if (order.totalCookies <= 0 || getTotalCookies(order.flavors) <= 0) {
    return "Please select at least one cookie.";
  }

  if (!["pickup", "delivery"].includes(order.fulfillment)) {
    return "Please choose pickup or delivery.";
  }

  if (order.fulfillmentDate < getTomorrowDateString()) {
    return "Orders must be scheduled at least one day in advance.";
  }

  if (!isValidFulfillmentTime(order.fulfillmentTime)) {
    return "Please choose a valid pickup or delivery time.";
  }

  if (order.fulfillment === "delivery") {
    if (!order.deliveryStreet || !order.deliveryZip) {
      return "Please provide your delivery street address and ZIP code.";
    }

    if (!isValidZip(order.deliveryZip)) {
      return "Please provide a valid 5-digit delivery ZIP code.";
    }
  }

  return "";
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
    replyTo: order.email || process.env.SMTP_USER,
    subject: `New Cookie Order ${order.orderId} — ${order.firstName} ${order.lastName}`,
    priority: "high",
    headers: highPriorityHeaders(),
    html: `
      <div style="font-family: Arial, sans-serif; color: #302a27; line-height: 1.6;">
        <h2>New Cookie Order</h2>

        <p><strong>Order ID:</strong> ${escapeHtml(order.orderId)}</p>
        <p><strong>Name:</strong> ${escapeHtml(order.firstName)} ${escapeHtml(order.lastName)}</p>
        <p><strong>Phone:</strong> ${escapeHtml(order.phone)}</p>
        <p><strong>Email:</strong> ${escapeHtml(order.email || "Not provided")}</p>
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

async function sendCustomerOrderReceivedSms(order) {
  await sendSms({
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

async function sendOwnerOrderSms(order) {
  await sendSms({
    to: OWNER_PHONE_NUMBER,
    body: `
New Emkari order ${order.orderId}

Name: ${order.firstName} ${order.lastName}
Phone: ${order.phone}
Email: ${order.email || "N/A"}

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
  const count = getNumber(quantity);

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
  return flavors.reduce((sum, item) => sum + getNumber(item.quantity), 0);
}

function getTotalStrawberries(flavors = []) {
  return flavors.reduce((sum, item) => sum + getNumber(item.strawberry), 0);
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

function getNumber(value) {
  return Math.max(0, Number(value) || 0);
}

function normalizeZip(value = "") {
  return String(value).replace(/\D/g, "").slice(0, 5);
}

function isValidZip(zip = "") {
  return /^\d{5}$/.test(zip);
}

function normalizePhone(value = "") {
  const phone = String(value).trim();

  if (!phone) return "";
  if (phone.startsWith("+")) return phone;

  const digits = phone.replace(/\D/g, "");

  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;

  return phone;
}

function cleanText(value = "") {
  return String(value).trim();
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