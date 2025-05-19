import axios from "axios";
import { addDays, startOfDay } from "date-fns";
import { convertToUTCPlus10 } from "../utils/time-utils";

type RawCalendlyTime = {
  start_time: string;
  status: string;
  scheduling_url: string;
};

type CalendlyAvailableTimesResponse = {
  success: boolean;
  availableTimes: string[];
  message: string;
};

export const getEventTypeId = async (
  calendlyToken: string
): Promise<string | null> => {
  try {
    const response = await axios.get("https://api.calendly.com/event_types", {
      headers: {
        Authorization: `Bearer ${calendlyToken}`,
        "Content-Type": "application/json",
      },
      params: {
        user: process.env.CALENDLY_USER_URI || "",
      },
    });

    const eventType = response.data.collection.find(
      (event: any) => event.name === "Valuation"
    );

    return eventType ? eventType.uri : null;
  } catch (error: any) {
    console.error("Error fetching event type:", error);
    return null;
  }
};

const formatAvailableTimes = (times: RawCalendlyTime[]): string[] => {
  return times
    .filter((time) => time.status === "available")
    .map((time) => time.start_time);
};

export const getCalendlyAvailableTimes = async (
  eventTypeId: string,
  calendlyToken: string,
  startTime: Date = new Date()
): Promise<CalendlyAvailableTimesResponse> => {
  try {
    const nextWeek = addDays(startTime, 6);

    const response = await axios.get(
      `https://api.calendly.com/event_type_available_times`,
      {
        headers: {
          Authorization: `Bearer ${calendlyToken}`,
          "Content-Type": "application/json",
        },
        params: {
          event_type: eventTypeId,
          start_time: startOfDay(startTime)
            .toISOString()
            .replace("T00:00:00.000Z", "T00:00:00.000000Z"),
          end_time: startOfDay(nextWeek)
            .toISOString()
            .replace("T00:00:00.000Z", "T24:00:00.000000Z"),
        },
      }
    );

    return {
      success: true,
      availableTimes: formatAvailableTimes(response.data.collection).map(
        (time) => convertToUTCPlus10(time)
      ),
      message: "Available times retrieved successfully",
    };
  } catch (error) {
    return {
      success: false,
      availableTimes: [],
      message:
        error instanceof Error
          ? error.message
          : "Failed to fetch available times",
    };
  }
};
