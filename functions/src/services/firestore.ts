import * as admin from "firebase-admin";
if (!admin.apps.length) admin.initializeApp();

export const db = admin.firestore();

export const autoFetchLeadsOn = async (): Promise<boolean> => {
  const enabledDoc = await db.collection("automation-flags").doc("flags").get();
  return enabledDoc.data()?.fetchLeads;
};

export const testModeOn = async (): Promise<boolean> => {
  const enabledDoc = await db.collection("automation-flags").doc("flags").get();
  return enabledDoc.data()?.testMode;
};

export const callsPerDay = async (): Promise<number> => {
  const enabledDoc = await db.collection("automation-flags").doc("flags").get();
  return enabledDoc.data()?.callsPerDay || 30;
};
