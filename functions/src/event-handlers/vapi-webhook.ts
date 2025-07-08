import { logger } from "firebase-functions/v1";
import { onRequest } from "firebase-functions/v2/https";
import {
  sendBookingNotificationSMS,
  sendConfirmationSMS,
  stringToBool,
} from "../utils/utils";
import * as admin from "firebase-admin";
import {
  appendRowToSheet,
  searchRowsInSheet,
  SheetRow,
  updateRowInSheet,
} from "../services/googleSheet";
import { addHours, addMonths, addBusinessDays } from "date-fns";
import { testModeOn } from "../services/firestore";
import { debug } from "firebase-functions/logger";

enum CallBackReason {
  UNSUCCESSFUL_CALL = "Unsuccessful Call",
  NO_ANSWER = "No Answer",
  VOICE_MAIL = "Voice Mail",
  REQUESTED = "Callback Requested",
  NONE = "",
}

enum CallJustOutcome {
  CALLED = "Called",
  BOOKED_VALUATION = "Booked Valuation",
}

enum MoreInfo {
  RENTAL_APPRAISAL = "Rental Appraisal",
  PROPERTY_MANAGEMENT = "Property Management",
  MARKET_UPDATE = "Market Update",
}

type CallOutcome = CallJustOutcome | CallBackReason;

interface WebhookResponse {
  success: boolean;
  message: string;
}

if (!admin.apps.length) {
  console.log("Initializing Firebase Admin");
  admin.initializeApp();
}

const shouldCallBeLogged = (message: any): boolean => {
  return (
    (message.type === "end-of-call-report" || message.call.endedAt === null) &&
    message.call.type !== "webCall" &&
    message.call.customer.number !== "+61430082233"
  );
};

const formatDuration = (seconds: number) => {
  if (!seconds) return "0s";
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return minutes > 0
    ? `${minutes}m ${remainingSeconds}s`
    : `${remainingSeconds}s`;
};

const getCallPrice = (durationSeconds: number, callType: string) => {
  if (!durationSeconds) return 0;
  if (callType === "inboundPhoneCall") return 1;
  if (durationSeconds < 10) return 0;

  return 1.25;
};

const getTelnyxCharges = (durationMinutes: number) => {
  if (!durationMinutes || durationMinutes <= 0) return 0;
  return Math.ceil(durationMinutes) * 0.03;
};

const formatISOString = (endedAt: string | number | Date) => {
  return new Date(endedAt)
    .toLocaleString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
    .replace(",", "");
};

const getCallBack = (
  message: any
): { callBackDate: string; callBackReason: CallBackReason } => {
  const brisbaneTime = addHours(new Date(), 10);

  if (message.analysis?.structuredData?.bookedValuation) {
    return {
      callBackDate: "",
      callBackReason: CallBackReason.NONE,
    };
  }

  if (message.endedReason === "no-answer" || !message.analysis?.summary) {
    return {
      callBackDate: formatISOString(addHours(brisbaneTime, 3).toISOString()),
      callBackReason: CallBackReason.NO_ANSWER,
    };
  }

  if (
    message.endedReason === "voice-mail" ||
    message.analysis?.structuredData?.voiceMail
  ) {
    return {
      callBackDate: formatISOString(addHours(brisbaneTime, 3).toISOString()),
      callBackReason: CallBackReason.VOICE_MAIL,
    };
  }

  if (
    message.analysis?.structuredData?.callBackInXMonths &&
    message.analysis?.structuredData?.callBackInXMonths > 0
  ) {
    return {
      callBackDate: formatISOString(
        addMonths(
          brisbaneTime,
          message.analysis.structuredData.callBackInXMonths
        ).toISOString()
      ),
      callBackReason: CallBackReason.REQUESTED,
    };
  }

  if (!stringToBool(message.analysis.successEvaluation)) {
    return {
      callBackDate: formatISOString(
        addBusinessDays(brisbaneTime, 1).toISOString()
      ),
      callBackReason: CallBackReason.UNSUCCESSFUL_CALL,
    };
  }

  return {
    callBackDate: "",
    callBackReason: CallBackReason.NONE,
  };
};

const logCallPricingGoogleSheetRow = async (id: string, message: any) => {
  const endedDate = message.endedAt ? new Date(message.endedAt) : new Date();

  const newRow = {
    toNumber: message.call.customer.number,
    date: formatISOString(addHours(endedDate, 10).toISOString()),
    type: message.call.type,
    duration: message.durationSeconds
      ? formatDuration(message.durationSeconds)
      : "0s",
    vapiCharges: message.cost ?? 0,
    telnyxCharges: getTelnyxCharges(message.durationMinutes),
    callPrice: getCallPrice(message.durationSeconds, message.call.type),
    callId: id,
    dbUrl: `=HYPERLINK("https://console.firebase.google.com/project/vapi-no-make/firestore/databases/-default-/data/~2Fvapi-calls~2F${id}", "DB Link")`,
  };
  await appendRowToSheet(
    process.env.GOOGLE_PRICING_SHEET_ID || "",
    "BoltonGroup!A:I",
    newRow
  );
};

const updateContactGoogleSheet = async (
  message: any,
  row: SheetRow[],
  index: number
) => {
  const structuredData = message.analysis?.structuredData;

  if (index === -1) {
    throw new Error("Contact not found in Google Sheet");
  }

  const valuationBooked = structuredData?.bookedValuation
    ? `${structuredData?.dateOfValuationDDMMYYYY || ""} ${
        structuredData?.timeOfValuation || ""
      } | ${structuredData?.addressOfPropertyToBeEvaluated || ""}`
    : row[5]?.toString();

  const callBack = getCallBack(message);
  let latestOutcome: CallOutcome = callBack.callBackReason;

  if (latestOutcome === CallBackReason.NONE) {
    latestOutcome = structuredData?.bookedValuation
      ? CallJustOutcome.BOOKED_VALUATION
      : CallJustOutcome.CALLED;
  }
  const moreInfoArray: MoreInfo[] = [];
  if (structuredData?.interestInOthers?.rentalAppraisal)
    moreInfoArray.push(MoreInfo.RENTAL_APPRAISAL);
  if (structuredData?.interestInOthers?.propertyManagement)
    moreInfoArray.push(MoreInfo.PROPERTY_MANAGEMENT);
  if (structuredData?.callForMarketUpdate)
    moreInfoArray.push(MoreInfo.MARKET_UPDATE);

  let callBackCount = row[10] ? Number(row[10]) : 0;
  if (
    latestOutcome === CallJustOutcome.BOOKED_VALUATION ||
    latestOutcome === CallJustOutcome.CALLED
  ) {
    callBackCount = 0;
  } else {
    callBackCount += 1;
  }

  const updateValues = {
    firstName: row[0].toString(),
    address: row[1].toString(),
    mobile: row[2].toString(),
    fullMobile: row[3].toString(),
    callCount: Number(row[4]) + 1,
    valuationBooked,
    moreInfo:
      moreInfoArray.length > 0 ? moreInfoArray.join(", ") : row[6]?.toString(),
    latestOutcome,
    latestObjection: structuredData?.callObjection || row[8]?.toString(),
    callBackDate: callBack.callBackDate,
    callBackCount,
  };

  await updateRowInSheet(
    process.env.GOOGLE_EOC_SHEET_ID || "",
    `contacts!A${index + 1}:K${index + 1}`,
    updateValues
  );
};

const logCallGoogleSheetRow = async (id: string, message: any) => {
  const analysis = message.analysis || undefined;
  const structuredData = analysis?.structuredData || undefined;
  const endedDate = message.endedAt ? new Date(message.endedAt) : new Date();

  const callBack = getCallBack(message);

  const newRow = {
    firstName: message.call?.customer?.name,
    toNumber: message.call?.customer?.number,
    nameOfRecipient: structuredData?.callRecipientFirstName || "",
    bookedValuation: structuredData?.bookedValuation || false,
    dateOfValuation: structuredData?.dateOfValuationDDMMYYYY || "",
    timeOfValuation: structuredData?.timeOfValuation || "",
    addressToBeEvaluated: structuredData?.addressOfPropertyToBeEvaluated || "",
    rentalAppraisal: structuredData?.interestInOthers?.rentalAppraisal || false,
    propertyManagement:
      structuredData?.interestInOthers?.propertyManagement || false,
    callBackInXMonths: structuredData?.callBackInXMonths || "",
    callForMarketUpdate: structuredData?.callForMarketUpdate || false,
    objection: structuredData?.callObjection || "",
    summary: analysis?.summary || "",
    transcript: message.artifact?.transcript || "",
    callback: callBack.callBackDate,
    callbackReason: callBack.callBackReason,
    endedAt: formatISOString(addHours(endedDate, 10).toISOString()),
    recordingURL: "",
    duration: message.durationSeconds
      ? formatDuration(message.durationSeconds)
      : "0s",
    type: message.call.type,
    callPrice: getCallPrice(message.durationSeconds, message.call.type),
    callId: id,
  };

  await appendRowToSheet(
    process.env.GOOGLE_EOC_SHEET_ID || "",
    "calls!A:U",
    newRow
  );
};

const handleBookedValuation = async (
  message: any,
  contactRow: SheetRow[],
  index: number
): Promise<string> => {
  if (await testModeOn()) {
    debug("Test mode is ON, skipping SMS sending.");
    return "Test mode is ON, skipping SMS sending.";
  }

  try {
    const {
      callRecipientFirstName,
      addressOfPropertyToBeEvaluated,
      timeOfValuation,
      dateOfValuationDDMMYYYY,
    } = message.analysis.structuredData;

    await sendConfirmationSMS(
      message.call.customer.number,
      message.phoneNumber.number,
      callRecipientFirstName,
      addressOfPropertyToBeEvaluated,
      timeOfValuation,
      dateOfValuationDDMMYYYY.replace(/-/g, "/")
    );

    const contactInfo =
      index !== -1
        ? `Contact info:\nFirst name: ${contactRow[0]}\nAddress: ${contactRow[1]}\nMobile: ${contactRow[2]}\n`
        : "";
    await sendBookingNotificationSMS(
      `JEN BOOKING NOTIFICATION\n\nValuation booked info:\n${dateOfValuationDDMMYYYY} at ${timeOfValuation} for ${addressOfPropertyToBeEvaluated}\n\n${contactInfo}`
    );
    return "SMS sent";
  } catch (e) {
    return `SMS failed: ${e}`;
  }
};

const saveToFirestore = async (
  id: string,
  message: any,
  followUpStatus: string
): Promise<WebhookResponse> => {
  try {
    await admin
      .firestore()
      .collection("vapi-calls")
      .doc(id)
      .set({
        ...message,
        followUpStatus,
        telnyxCost: getTelnyxCharges(message.durationMinutes),
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });
    return { success: true, message: "VAPI call saved to Firestore" };
  } catch (e) {
    console.error(e);
    return { success: false, message: "Error saving VAPI call to Firestore" };
  }
};

const saveToGoogleSheets = async (
  id: string,
  message: any,
  row: SheetRow[],
  index: number
): Promise<WebhookResponse[]> => {
  const operations = [
    {
      fn: () => logCallPricingGoogleSheetRow(id, message),
      successMessage: "VAPI call price saved to Google Sheet",
      errorMessage: "Error saving VAPI call price to Google Sheet",
    },
    {
      fn: () => updateContactGoogleSheet(message, row, index),
      successMessage: "Contact updated to Google Sheet",
      errorMessage: "Error updating contact to Google Sheet",
    },
    {
      fn: () => logCallGoogleSheetRow(id, message),
      successMessage: "VAPI call saved to Google Sheet",
      errorMessage: "Error saving VAPI call to Google Sheet",
    },
  ];

  const results = await Promise.all(
    operations.map(async ({ fn, successMessage, errorMessage }) => {
      try {
        await fn();
        return { success: true, message: successMessage };
      } catch (e) {
        console.error(e);
        return { success: false, message: errorMessage };
      }
    })
  );

  return results;
};

export const vapiWebhook = onRequest(async (request, response) => {
  try {
    const { message } = request.body;

    if (!shouldCallBeLogged(message)) {
      response.send("Webhook skipped - call should not be logged");
      return;
    }

    const { id } = message.call;

    const number: string = message.call.customer.number;
    const numberWithoutPlus = number.replace("+", "");

    const { row, index } = await searchRowsInSheet(
      process.env.GOOGLE_EOC_SHEET_ID || "",
      "contacts!A:K",
      numberWithoutPlus,
      3
    );

    const followUpStatus = message.analysis?.structuredData?.bookedValuation
      ? await handleBookedValuation(message, row, index)
      : "";

    const [firestoreResult, googleSheetResults] = await Promise.all([
      saveToFirestore(id, message, followUpStatus),
      saveToGoogleSheets(id, message, row, index),
    ]);

    const results = [firestoreResult, ...googleSheetResults];
    const failures = results.filter((r) => !r.success);

    if (failures.length > 0) {
      logger.warn("Some operations failed:", failures);
    }

    response.send({
      status: "completed",
      successes: results.filter((r) => r.success).length,
      failures: failures.length,
    });
  } catch (error) {
    logger.error("Webhook processing failed:", error);
    response.status(500).send("Internal server error");
  }
});
