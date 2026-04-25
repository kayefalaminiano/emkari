import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import twilio from "twilio";
import nodemailer from "nodemailer";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const mailTransporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: Number(process.env.SMTP_PORT) === 465,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

app.get("/", (req, res) => {
  res.send("Emkari contact backend is running.");
});

app.post("/contact", async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      email,
      subject,
      phone,
      smsConsent,
      message,
    } = req.body;

    await mailTransporter.sendMail({
      from: `"Emkari Website" <${process.env.SMTP_USER}>`,
      to: "hello@emkari.com",
      replyTo: email,
      subject: `New Emkari Form Submission: ${subject}`,
      priority: "high",
      headers: {
        "X-Priority": "1",
        "X-MSMail-Priority": "High",
        Importance: "high",
      },
      html: `
        <div style="font-family: Arial, sans-serif; color: #302a27; line-height: 1.6;">
          <p><strong>Name:</strong> ${firstName} ${lastName}</p>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Phone:</strong> ${phone || "Not provided"}</p>
          <p><strong>SMS Consent:</strong> ${smsConsent ? "Yes" : "No"}</p>
          <p><strong>Subject:</strong> ${subject}</p>

          <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;" />

          <p><strong>Message:</strong></p>
          <p>${message}</p>
        </div>
      `,
    });

    if (phone && smsConsent) {
      await twilioClient.messages.create({
        body: `Hi ${firstName}, this is Emkari! We received your message about “${subject}” and we’ll get back to you soon. Thank you for reaching out! Reply STOP to opt out.`,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: phone,
      });
    }

    res.status(200).json({
      success: true,
      message: "Message sent successfully.",
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Something went wrong. Please try again.",
    });
  }
});

app.post("/mark-answered", async (req, res) => {
  try {
    const { firstName, phone } = req.body;

    if (!firstName || !phone) {
      return res.status(400).json({
        success: false,
        message: "First name and phone number are required.",
      });
    }

    await twilioClient.messages.create({
      body: `Hi ${firstName}, Emkari here! Your message has been answered. Check your email when you have a moment. We’re excited to connect with you!`,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: phone,
    });

    res.status(200).json({
      success: true,
      message: "Answered SMS sent.",
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Something went wrong. Please try again.",
    });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Emkari contact backend running on port ${PORT}`);
});