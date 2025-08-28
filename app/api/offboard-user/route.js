import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]/route";
import { Client } from "@microsoft/microsoft-graph-client";
import { ClientSecretCredential } from "@azure/identity";

// Helper to get an app-only Graph client
async function getAppGraphClient() {
  const credential = new ClientSecretCredential(
    process.env.AZURE_TENANT_ID,
    process.env.AZURE_CLIENT_ID,
    process.env.AZURE_CLIENT_SECRET
  );
  const token = await credential.getToken("https://graph.microsoft.com/.default");
  return Client.init({
    authProvider: (done) => done(null, token.token),
  });
}

export async function POST(req) {
  // Only require that the caller is signed-in to the app (UI access control),
  // not that they have a delegated Graph access token.
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized. Please sign in." }, { status: 401 });
  }

  // Parse request
  let userIds = [];
  let disableDevices = false;
  try {
    const body = await req.json();
    userIds = Array.isArray(body.userIds) ? body.userIds : [];
    disableDevices = !!body.disableDevices;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  // App-only Graph client
  const client = await getAppGraphClient();

  const results = [];
  for (const userId of userIds) {
    const actions = [];
    const removedGroups = [];
    const failedGroups = [];
    let error = null;
    let newPassword = null;

    try {
      // Disable account
      await client.api(`/users/${userId}`).update({ accountEnabled: false });
      actions.push("Disabled account");

      // Revoke sessions
      try {
        await client.api(`/users/${userId}/revokeSignInSessions`).post();
        actions.push("Revoked sign-in sessions");
      } catch (e) {
        actions.push(`Error revoking sessions: ${e?.message || String(e)}`);
      }

      // Stamp companyName
      try {
        await client.api(`/users/${userId}`).update({ companyName: "Disabled" });
        actions.push('Replaced company name with "Disabled"');
      } catch (e) {
        actions.push(`Error updating company name: ${e?.message || String(e)}`);
      }

      // Reset password (TEST ONLY – remove in prod)
      try {
        newPassword = `Tmp!${Math.random().toString(36).slice(2, 10)}-${Date.now().toString().slice(-4)}`;
        await client.api(`/users/${userId}`).update({
          passwordProfile: { forceChangePasswordNextSignIn: true, password: newPassword },
        });
        actions.push("Reset password and set a strong random value");
      } catch (e) {
        actions.push(`Error resetting password: ${e?.message || String(e)}`);
      }

      // Remove from (non-dynamic) groups
      try {
        // memberOf returns groups; we filter for “group” type
        const memberResult = await client.api(`/users/${userId}/memberOf`).get();
        const groups = (memberResult.value || []).filter(
          (m) => m["@odata.type"] === "#microsoft.graph.group"
        );

        if (!groups.length) {
          actions.push("Removed from groups: None");
        } else {
          for (const g of groups) {
            try {
              // Attempt removal; dynamic-membership groups will 400/403 – we just record and continue
              await client.api(`/groups/${g.id}/members/${userId}/$ref`).delete();
              removedGroups.push(g.displayName || g.id);
            } catch (e) {
              failedGroups.push(
                `${g.displayName || g.id} (${e?.statusCode || ""} ${e?.message || e})`
              );
            }
          }
          if (removedGroups.length) {
            actions.push(`Removed from groups: ${removedGroups.join(", ")}`);
          } else {
            actions.push("Removed from groups: None");
          }
          if (failedGroups.length) {
            actions.push(`Groups not removed (likely dynamic or protected): ${failedGroups.join(", ")}`);
          }
        }
      } catch (e) {
        actions.push(`Error listing/removing groups: ${e?.message || String(e)}`);
      }

      // Disable devices (optional)
      if (disableDevices) {
        try {
          const devResult = await client.api(`/users/${userId}/ownedDevices`).get();
          const devices = (devResult.value || []).filter((d) => d.deviceId);
          if (!devices.length) {
            actions.push("No assigned devices found");
          } else {
            for (const d of devices) {
              try {
                await client.api(`/devices/${d.id}`).update({ accountEnabled: false });
                actions.push(`Disabled device: ${d.displayName || d.id}`);
              } catch (devErr) {
                actions.push(`Error disabling device ${d.displayName || d.id}: ${devErr?.message || String(devErr)}`);
              }
            }
          }
        } catch (e) {
          actions.push(`Error retrieving devices: ${e?.message || String(e)}`);
        }
      }
    } catch (e) {
      error = e?.message || String(e);
    }

    results.push({
      userId,
      actions,
      removedGroups,
      failedGroups,
      error,
      // return password ONLY for testing – remove in production
      password: newPassword,
    });
  }

  return NextResponse.json({ results });
}
