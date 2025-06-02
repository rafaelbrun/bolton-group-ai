import twilio from "twilio";
import { VapiClient } from "@vapi-ai/server-sdk";
import { addressForSMS } from "./google-apis";
import { debug } from "firebase-functions/logger";
import { addHours } from "date-fns";
import { CONSTANTS } from "./constants";

const twilioPhoneNumber = "+61440137500";
const boltonNotificationNumber = "+61430082223";
const vapiServerAPIKey = process.env.VAPI_SERVER_API_KEY || "";
const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID || "";
const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN || "";

export const call = async (
  assistantId: string,
  phoneNumberIndex: number,
  customerPhoneNumber: string,
  callVariables: any,
  customerName?: string
) => {
  const vapiClient = new VapiClient({ token: vapiServerAPIKey });
  const assistant = await getAssistant(assistantId);
  if (!assistant) {
    throw new Error(`Assistant with ID ${assistantId} not found.`);
  }
  try {
    const phoneNumberId = CONSTANTS.phoneNumbers[phoneNumberIndex];
    if (!phoneNumberId) {
      throw new Error(
        `Phone number ID not found for index ${phoneNumberIndex}.`
      );
    }
    await vapiClient.calls.create({
      assistant,
      phoneNumberId,
      customer: { number: customerPhoneNumber, name: customerName },
      assistantOverrides: { variableValues: { ...callVariables } },
    });
  } catch (error) {
    throw new Error(`Failed to create call: ${error}`);
  }
};

const getAssistant = async (assistantId: string) => {
  try {
    const vapiClient = new VapiClient({ token: vapiServerAPIKey });
    const assistant = await vapiClient.assistants.get(assistantId);

    debug("Assistant fetched:", {
      assistantId,
      hasAnalysisPlan: !!assistant.analysisPlan,
    });

    updateAssistantWithBrisbaneTime(assistant);

    return filterAssistantProperties(assistant);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    debug(`Failed to fetch assistant ${assistantId}: ${errorMessage}`);
    throw new Error(`Failed to fetch assistant: ${errorMessage}`);
  }
};

const updateAssistantWithBrisbaneTime = (assistant: any): void => {
  const systemMessageStructuredPlan =
    assistant.analysisPlan?.structuredDataPlan?.messages?.find(
      (message: any) => message.role === "system"
    );

  if (!systemMessageStructuredPlan) return;

  const nowBrisbane = addHours(new Date(), 10);
  const brisbaneTimeISO = nowBrisbane.toISOString();

  systemMessageStructuredPlan.content = (
    systemMessageStructuredPlan.content as string
  ).replace(/\{\{now\}\}/g, brisbaneTimeISO);

  if (assistant.analysisPlan?.structuredDataPlan?.messages) {
    assistant.analysisPlan.structuredDataPlan.messages =
      assistant.analysisPlan.structuredDataPlan.messages.map((message: any) =>
        message.role === "system" ? systemMessageStructuredPlan : message
      );
  }
};

const filterAssistantProperties = (assistant: any) => {
  if ("isServerUrlSecretSet" in assistant) {
    const {
      id,
      orgId,
      createdAt,
      updatedAt,
      isServerUrlSecretSet,
      ...filteredAssistant
    } = assistant;
    return filteredAssistant;
  }
  return assistant;
};

export const stringToBool = (s: any) => {
  if (typeof s === "string" || s instanceof String) return s === "true";
  else if (typeof s === "boolean" || s instanceof Boolean) return s;
  else return false;
};

export const sendConfirmationSMS = async (
  phoneNumber: string,
  fromNumber: string,
  name: string,
  address: string,
  time: string,
  date: string
) => {
  const twilioClient = twilio(twilioAccountSid, twilioAuthToken);
  try {
    await twilioClient.messages.create({
      body: `Thanks ${name}, for your time on the phone just now. We look forward to meeting you ${time}, ${date} at ${await addressForSMS(
        address
      )}. \nPlease message or call ${boltonNotificationNumber} for any inquiries.\n\nThe Bolton Group Estate Agents`,
      from: fromNumber,
      to: phoneNumber,
    });
    console.log(`SMS sent to ${phoneNumber}`);
  } catch (error) {
    throw new Error(`Failed to send SMS: ${error}`);
  }
};

export const sendBookingNotificationSMS = async (body: string) => {
  const twilioClient = twilio(twilioAccountSid, twilioAuthToken);
  await twilioClient.messages.create({
    body: body,
    from: twilioPhoneNumber,
    to: boltonNotificationNumber,
  });
  console.log(`Notification SMS sent to ${boltonNotificationNumber}`);
};
