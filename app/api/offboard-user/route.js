import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]/route";
import { Client } from "@microsoft/microsoft-graph-client";

export async function POST(req) {
  // 1. Authenticate
  const session = await getServerSession(authOptions);
  if (!session || !session.accessToken) {
    return NextResponse.json({ error: "Unauthorized. Please sign in." }, { status: 401 });
  }

  // 2. Parse request body
  let userIds = [];
  let disableDevices = false;
  try {
    const body = await req.json();
    userIds = Array.isArray(body.userIds) ? body.userIds : [];
    disableDevices = !!body.disableDevices;
  } catch (err) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  // 3. Initialize Microsoft Graph client with the delegated user's token
  const client = Client.init({
    authProvider: (done) => done(null, session.accessToken),
  });

  // 4. Loop through users and process offboarding
  const results = [];
  for (const userId of userIds) {
    const actions = [];
    let error = null;

    try {
      // Disable the user account
      await client.api(`/users/${userId}`).update({ accountEnabled: false });
      actions.push("Disabled account");

      // Revoke sign-in sessions
      await client.api(`/users/${userId}/revokeSignInSessions`).post();
      actions.push("Revoked sign-in sessions");

      // Set companyName to "Former Employee"
      await client.api(`/users/${userId}`).update({ companyName: "Disabled" });
      actions.push('Replaced company name with "Disabled"');

      // Optionally disable assigned devices
      if (disableDevices) {
        try {
          const devResult = await client.api(`/users/${userId}/ownedDevices`).get();
          const devices = (devResult.value || []).filter(d => d.deviceId);

          if (devices.length > 0) {
            for (const device of devices) {
              try {
                await client.api(`/devices/${device.id}`).update({ accountEnabled: false });
                actions.push(`Disabled device: ${device.displayName || device.id}`);
              } catch (devErr) {
                actions.push(`Error disabling device: ${devErr.message || devErr.toString()}`);
              }
            }
          } else {
            actions.push("No assigned devices found");
          }
        } catch (devListErr) {
          actions.push(`Error retrieving assigned devices: ${devListErr.message || devListErr.toString()}`);
        }
      }

    } catch (err) {
      error = err.message || err.toString();
      actions.push(`Error: ${error}`);
    }

    // Always push a summary for this user
    results.push({ userId, actions, error });
  }

  // 5. Return all results for each user
  return NextResponse.json({ results });
}
