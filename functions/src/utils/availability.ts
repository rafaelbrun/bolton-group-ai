import { dateTimeToTimestamp, isoToTimestamp } from "./time-utils";

export function isTimeSlotAvailable(
  proposedStart: number,
  availableSlots: number[]
): boolean {
  return availableSlots.some((slot) => proposedStart == slot);
}

export async function isMeetingTimeAvailable(
  time: string,
  date: string,
  availabilitySlots: string[]
): Promise<boolean> {
  const startTimestamp = await dateTimeToTimestamp(date, time);
  const availabilityTimestamps = availabilitySlots.map((slot) => {
    return isoToTimestamp(slot);
  });

  return isTimeSlotAvailable(startTimestamp, availabilityTimestamps);
}

export const findLastSuccessfulAvailabilityCheck = (
  messages: any[]
): string | undefined => {
  return messages
    .reverse()
    .find(
      (msg) =>
        msg.role === "tool_call_result" &&
        (!msg.name || msg.name === "checkAvailabilitySameTimezone") &&
        msg.result?.isAvailable === true
    )?.result?.dateOfValuationDDMMYYYY;
};
