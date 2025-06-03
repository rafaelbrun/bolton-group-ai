import { onSchedule, ScheduledEvent } from "firebase-functions/v2/scheduler";
import { debug, error } from "firebase-functions/logger";
import { googleAuthorize } from "../services/googleSheet";
import { call } from "../utils/utils";
import { CONSTANTS } from "../utils/constants";
import { currentBrisbaneTimeISO } from "../utils/time-utils";
import {
  autoFetchLeadsOn,
  callsPerDay,
  testModeOn,
} from "../services/firestore";
import { addHours } from "date-fns";

const SHEET_ID = process.env.GOOGLE_EOC_SHEET_ID || "";
const SHEET_RANGE = "contacts!A:K";
const OUTCOME_VALUES = [
  "No Answer",
  "Voice Mail",
  "Unsuccessful Call",
  "Callback Requested",
];

function parseDateTime(dateTimeStr: string): Date | null {
  const match = dateTimeStr.match(
    /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})$/
  );
  if (!match) return null;
  const [, dd, mm, yyyy, hh, min, ss] = match;
  return new Date(
    Number(yyyy),
    Number(mm) - 1,
    Number(dd),
    Number(hh),
    Number(min),
    Number(ss)
  );
}

export const fetchLeadList = onSchedule(
  {
    schedule: "0,20,40 8-17 * * 1-5",
    timeZone: "Australia/Brisbane",
    timeoutSeconds: 300,
    region: "australia-southeast1",
  },
  async (event: ScheduledEvent) => {
    debug("Fetching leads on time", event);

    if ((await autoFetchLeadsOn()) === false) {
      debug("Auto-fetch leads is disabled, exiting function.");
      return;
    }

    try {
      const auth = await googleAuthorize();
      const callPerDay = await callsPerDay();
      const maxRowsPerRun = Math.ceil(callPerDay / 27);
      const nowBrisbane = addHours(new Date(), 10);
      const isTestMode = await testModeOn();
      const sheets = require("googleapis").google.sheets({
        version: "v4",
        auth,
      });

      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: SHEET_RANGE,
      });
      const rows: any[] = response.data.values || [];
      const rowsWithoutHeaders = rows.slice(1);

      const filtered = rowsWithoutHeaders.filter((row: any) => {
        const outcome = row[7];
        const callCount = Number(row[10]);
        const dateTimeStr = row[9] as string | undefined;
        const dateTime = dateTimeStr ? parseDateTime(dateTimeStr) : null;
        const name = row[0]?.toString() || "";
        const customerPhoneNumber = row[3]?.toString();
        if (!customerPhoneNumber) return false;
        if (isTestMode && !name.toLowerCase().startsWith("test")) return false;
        return (
          OUTCOME_VALUES.includes(outcome) &&
          callCount < 3 &&
          (dateTime === null || dateTime < nowBrisbane)
        );
      });

      debug(
        "Filtered leads:",
        filtered.length,
        "out of",
        rowsWithoutHeaders.length
      );
      const leadsToCall = filtered.slice(0, maxRowsPerRun);
      debug("Leads to call:", leadsToCall.length);
      for (let i = 0; i < leadsToCall.length; i++) {
        const row = leadsToCall[i];
        const customerPhoneNumber = row[3]?.toString();
        const contact_name = row[0]?.toString();
        const phoneNumberIndex = i % CONSTANTS.phoneNumbers.length;
        if (customerPhoneNumber && contact_name) {
          debug(`Calling ${contact_name} at ${customerPhoneNumber}`);
          await call(
            CONSTANTS.jenId,
            phoneNumberIndex,
            `+${customerPhoneNumber}`,
            {
              contact_name,
              contact_suburb: "Redbank Plains",
              now: currentBrisbaneTimeISO(),
            },
            contact_name
          );

          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      }
    } catch (e) {
      error("Error fetching leads:", e);
    }
  }
);
