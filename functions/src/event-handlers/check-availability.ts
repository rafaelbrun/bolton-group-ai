import { onRequest } from "firebase-functions/v2/https";
import {
  getEventTypeId,
  getCalendlyAvailableTimes,
} from "../services/calendly";
import { formatDateToDDMMYYYY } from "../utils/time-utils";
import { isMeetingTimeAvailable } from "../utils/availability";

export const checkAvailability = onRequest(async (request, response) => {
  if (
    request.headers["X-VAPI-SECRET".toLowerCase()] !==
    process.env.VAPI_WEBHOOK_SECRET
  ) {
    response.status(401).send("Unauthorized");
    return;
  }

  const toolCall = request.body.message.toolCallList[0];
  const toolCallId = toolCall.id;
  const { requestedDate, requestedTime } = toolCall.function.arguments;
  const calendlyToken = process.env.CALENDLY_TOKEN || "";

  try {
    const eventTypeId = await getEventTypeId(calendlyToken);
    const availableTimesResponse = await getCalendlyAvailableTimes(
      eventTypeId || "",
      calendlyToken,
      new Date(requestedDate)
    );

    const availability = availableTimesResponse.availableTimes;

    const isAvailable: boolean = await isMeetingTimeAvailable(
      requestedTime,
      requestedDate,
      availability
    );

    console.log("Requested time and date", requestedTime, requestedDate);
    console.log("Converted Availability", availability);

    response.json({
      results: [
        {
          toolCallId,
          result: {
            isAvailable,
            otherTimes: availability,
            dateOfValuationDDMMYYYY: formatDateToDDMMYYYY(requestedDate),
            timeOfValuation: requestedTime,
          },
        },
      ],
    });
  } catch (error) {
    console.error("Error processing Availability", error);
    response.json({ error: error });
  }
});
