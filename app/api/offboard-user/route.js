import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]/route"; // Path may vary; adjust as needed!
import { Client } from "@microsoft/microsoft-graph-client";

export async function POST(req) {
  // 1. Fetch session for current request
  const session = await getServerSession(authOptions);

  // 2. Block if not authenticated
  if (!session || !session.accessToken) {
    return NextResponse.json({ error: "Unauthorized. Please sign in." }, { status: 401 });
  }

  // 3. Parse the request body
  const { userIds, disableDevices } = await req.json();

  // 4. Initialize Microsoft Graph client using user's access token
  const client = Client.init({
    authProvider: (done) => done(null, session.accessToken),
  });

  // 5. Example: Loop over users and offboard
  const results = [];
  for (const userId of userIds) {
    const actions = [];
    try {
      // Disable user
      await client.api(`/users/${userId}`).update({ accountEnabled: false });
      actions.push("Disabled account");

      // Revoke sign-in sessions
      await client.api(`/users/${userId}/revokeSignInSessions`).post();
      actions.push("Revoked sign-in sessions");

      // Set companyName to "Former Employee"
      await client.api(`/users/${userId}`).update({ companyName: "Former Employee" });
      actions.push('Replaced company name with "Former Employee"');

      // Optionally disable devices
      if (disableDevices) {
        const devResult = await client.api(`/users/${userId}/ownedDevices`).get();
        const devices = (devResult.value || []).filter(d => d.deviceId);
        for (const device of devices) {
          try {
            await client.api(`/devices/${device.id}`).update({ accountEnabled: false });
            actions.push(`Disabled device: ${device.displayName || device.id}`);
          } catch (devErr) {
            actions.push(`Error disabling device: ${devErr.message}`);
          }
        }
      }

      results.push({ userId, actions });
    } catch (err) {
      results.push({ userId, actions, error: err.message });
    }
  }

  // 6. Return response
  return NextResponse.json({ results });
}
