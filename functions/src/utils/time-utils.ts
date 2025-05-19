import { addHours } from "date-fns";

export async function dateTimeToTimestamp(
  date: string,
  time: string
): Promise<number> {
  const isoString = `${date}T${time}:00.000+10:00`;
  console.log("ISO String", isoString);
  return isoToTimestamp(isoString);
}

export const convertToUTCPlus10 = (timestamp: any) => {
  const date = new Date(timestamp);

  date.setHours(date.getUTCHours() + 10);

  const formattedDate = date.toISOString().replace("Z", "+10:00");

  return formattedDate;
};

export const isoToTimestamp = (isoString: string): number =>
  new Date(isoString).getTime() / 1000;

export const currentBrisbaneTimeISO = () => {
  const now = new Date();
  const brisbaneDate = addHours(now, 10);
  const dayOfTheWeek = brisbaneDate.toLocaleDateString("en-AU", {
    weekday: "long",
  });
  return `${dayOfTheWeek} ${brisbaneDate.toISOString().split(".")[0]}+10:00"`;
};

export function formatDateToDDMMYYYY(dateString: string): string {
  const [year, month, day] = dateString.split("-");
  if (!year || !month || !day) return dateString;
  const dayName = new Date(dateString).toLocaleDateString("en-AU", {
    weekday: "long",
  });
  return `${dayName}, ${day}/${month}/${year}`;
}
