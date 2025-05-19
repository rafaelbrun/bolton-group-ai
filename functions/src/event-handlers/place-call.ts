import { currentBrisbaneTimeISO } from "../utils/time-utils";
import { call } from "../utils/utils";
import { onRequest } from "firebase-functions/v2/https";

const CONSTANTS = {
  samId: "f7f4fc8a-eff8-4cbd-bd27-f86023d24b56",
  jenId: "520a6496-6775-4d13-93ce-2edc0e2bac14",
  peterId: "7552d1cc-bea3-44b8-8c36-7ef5229a1f97",
  phoneNumberId: "07877115-84af-4016-a4a9-f9010109008c",
};

export const placeCall = onRequest(async (request, response) => {
  if (
    request.headers["X-VAPI-SECRET".toLowerCase()] !==
    process.env.VAPI_WEBHOOK_SECRET
  ) {
    response.status(401).send("Unauthorized");
    return;
  }

  const { customerPhoneNumber, contact_name } = request.body;

  try {
    const callVariables = {
      contact_name,
      contact_suburb: "Redbank Plains",
      now: currentBrisbaneTimeISO(),
    };

    await call(
      CONSTANTS.jenId,
      CONSTANTS.phoneNumberId,
      customerPhoneNumber,
      callVariables,
      contact_name
    );

    response.json({
      message: "Call placed successfully",
      assistantId: CONSTANTS.jenId,
      solvePhoneNumberId: CONSTANTS.phoneNumberId,
      customerPhoneNumber,
      callVariables,
    });
  } catch (error) {
    console.error("Error placing call", error);
    response.json({ error: error });
  }
});
