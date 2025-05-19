import twilio from "twilio";
import { logger } from "firebase-functions/v1";
import { onRequest } from "firebase-functions/v2/https";
import { appendRowToSheet } from "../services/googleSheet";
import { addHours } from "date-fns";

const twilioSignature = twilio.validateRequest;
const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN || "";

export const twilioWebhook = onRequest(async (request, response) => {
  const twilioSignatureHeader = request.headers["x-twilio-signature"] as string;
  const url = `https://${request.hostname}${request.originalUrl}`;
  const params = request.body;

  if (
    !twilioSignatureHeader ||
    !twilioSignature(twilioAuthToken, twilioSignatureHeader, url, params)
  ) {
    response.status(403).send("Forbidden: Invalid Twilio signature");
    return;
  }

  if (request.method !== "POST") {
    response.status(405).send("Method Not Allowed");
    return;
  }

  const { From, Body } = request.body;

  if (!From || !Body) {
    response.status(400).send("Bad Request: Missing From or Body");
    return;
  }

  const todayBrisbane = addHours(new Date(), 10);

  try {
    await appendRowToSheet(process.env.GOOGLE_EOC_SHEET_ID || "", "sms!A:D", {
      body: Body,
      from: From,
      to: "+61440137500",
      when: todayBrisbane.toISOString(),
    });

    response.status(200).send("SMS received successfully");
  } catch (error) {
    logger.error("Error processing SMS", error);
    response.status(500).send("Internal Server Error");
  }
});
