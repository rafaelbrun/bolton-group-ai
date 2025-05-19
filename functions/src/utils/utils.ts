import twilio from "twilio";
import { VapiClient } from "@vapi-ai/server-sdk";
import { addressForSMS } from "./google-apis";

const twilioPhoneNumber = "+61440137500";
const boltonNotificationNumber = "+61430082223"
const vapiServerAPIKey = process.env.VAPI_SERVER_API_KEY || "";
const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID || "";
const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN || "";

const vapiClient = new VapiClient({ token: vapiServerAPIKey });
const twilioClient = twilio(twilioAccountSid, twilioAuthToken);

export const call = async (
  assistantId: string,
  solvePhoneNumberId: string,
  customerPhoneNumber: string,
  callVariables: any,
  customerName?: string
) =>
  await vapiClient.calls.create({
    assistantId,
    phoneNumberId: solvePhoneNumberId,
    customer: { number: customerPhoneNumber, name: customerName },
    assistantOverrides: { variableValues: { ...callVariables } },
  });

export const stringToBool = (s: any) => {
  if (typeof s === "string" || s instanceof String) return s === "true";
  else if (typeof s === "boolean" || s instanceof Boolean) return s;
  else return false;
};

export const sendSMS = async (
  phoneNumber: string,
  name: string,
  address: string,
  time: string,
  date: string
) => {
  await twilioClient.messages.create({
    body: `Thanks ${name}, for your time on the phone just now. We look forward to meeting you ${time}, ${date} at ${await addressForSMS(
      address
    )}. \nThe Bolton Group Estate Agents`,
    from: twilioPhoneNumber,
    to: phoneNumber,
  });
  console.log(`SMS sent to ${phoneNumber}`);
};

export const sendBookingNotificationSMS = async (
  body: string,
) => {
  await twilioClient.messages.create({
    body: body,
    from: twilioPhoneNumber,
    to: boltonNotificationNumber,
  });
  console.log(`Notification SMS sent to ${boltonNotificationNumber}`);
}