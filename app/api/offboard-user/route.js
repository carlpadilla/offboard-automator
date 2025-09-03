// app/api/offboard-user/route.js
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]/route"; // adjust path if needed

import { Client } from "@microsoft/microsoft-graph-client";
import "isomorphic-fetch";

/**
 * If/when you want to enable APP-ONLY mode, uncomment these lines
 * and the helper below, then flip `MODE` to "auto".
 */
// import { ClientSecretCredential } from "@azure/identity";

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

function newTempPassword() {
  return `Tmp!${Math.random().toString(36).slice(2, 8)}-${Math.floor(
    1000 + Math.random() * 9000
  )}`;
}

function getDelegatedClient(accessToken) {
  return Client.init({
    authProvider: (done) => done(null, accessToken),
  });
}

/**
 * APP-ONLY helper (commented out for now)
 *
 * function getAppOnlyClient() {
 *   const tenantId = process.env.GRAPH_TENANT_ID;
 *   const clientId = process.env.GRAPH_CLIENT_ID;
 *   const clientSecret = process.env.GRAPH_CLIENT_SECRET;
 *   if (!tenantId || !clientId || !clientSecret) {
 *     throw new Error("Missing GRAPH_TENANT_ID/GRAPH_CLIENT_ID/GRAPH_CLIENT_SECRET.");
 *   }
 *   const cred = new ClientSecretCredential(tenantId, clientId, clientSecret);
 *   return Client.init({
 *     authProvider: async (done) => {
 *       try {
 *         const token = await cred.getToken("https://graph.microsoft.com/.default");
 *         done(null, token?.token || "");
 *       } catch (e) {
 *         done(e, null);
 *       }
 *     },
 *   });
 * }
 */

/**
 * Decide which mode to use:
 *   - "delegated" (today) — require a NextAuth session with accessToken
 *   - "app" (later)      — client credentials via GRAPH_* env vars
 *   - "auto"             — try app, fall back to delegated
 */
const MODE = "delegated"; // <-- keep delegated for testing

async function getGraphClient(session) {
  if (MODE === "delegated") {
    if (!session || !session.accessToken) {
      throw new Error("Unauthorized. Please sign in.");
    }
    return { client: getDelegatedClient(session.accessToken), mode: "delegated" };
  }

  // if (MODE === "app") {
  //   return { client: getAppOnlyClient(), mode: "app" };
  // }

  // // MODE === "auto"
  // try {
  //   return { client: getAppOnlyClient(), mode: "app" };
  // } catch {
  //   if (!session || !session.accessToken) {
  //     throw new Error("Unauthorized. Please sign in.");
  //   }
  //   return { client: getDelegatedClient(session.accessToken), mode: "delegated" };
  // }
}

/* ------------------------------------------------------------------ */
/* Route                                                              */
/* ------------------------------------------------------------------ */

export async function POST(req) {
  // 1) Auth/session (we always read it; current MODE uses delegated)
  const session = await getServerSession(authOptions);

  // 2) Request body
  let userIds = [];
  let disableDevices = false;
  try {
    const body = await req.json();
    userIds = Array.isArray(body.userIds) ? body.userIds : [];
    disableDevices = !!body.disableDevices;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  // 3) Graph client (delegated for now)
  let client, mode;
  try {
    const pick = await getGraphClient(session);
    client = pick.client;
    mode = pick.mode;
  } catch (e) {
    return NextResponse.json(
      { error: e?.message || String(e), mode: MODE },
      { status: 401 }
    );
  }

  // 4) Process each user
  const results = [];
  for (const userId of userIds) {
    const actions = [];
    const removedGroups = [];
    const failedGroups = [];
    let error = null;
    let newPassword = null;

    try {
      // 4.1 Disable account
      try {
        await client.api(`/users/${userId}`).update({ accountEnabled: false });
        actions.push("Disabled account");
      } catch (e) {
        throw new Error(
          `Disable account failed: ${e?.message || e?.body || String(e)}`
        );
      }

      // 4.2 Revoke sessions (delegated only)
      if (mode === "delegated") {
        try {
          await client.api(`/users/${userId}/revokeSignInSessions`).post({});
          actions.push("Revoked sign-in sessions");
        } catch (e) {
          actions.push(
            `Warning: could not revoke sessions (delegated only). ${e?.message || e}`
          );
        }
      } else {
        actions.push("Skipped revoking sessions (app-only)");
      }

      // 4.3 Tag companyName
      try {
        await client.api(`/users/${userId}`).update({ companyName: "Disabled" });
        actions.push('Replaced company name with "Disabled"');
      } catch (e) {
        actions.push(`Set company name failed: ${e?.message || e}`);
      }

      // 4.4 Reset password
      try {
        newPassword = newTempPassword();
        await client.api(`/users/${userId}`).update({
          passwordProfile: {
            forceChangePasswordNextSignIn: true,
            password: newPassword,
          },
        });
        actions.push("Reset password and set a strong random value");
      } catch (e) {
        actions.push(`Error resetting password: ${e?.message || e}`);
      }

      // 4.5 Remove from groups (fix: no $select; filter by @odata.type locally)
      try {
        const groups = await client.api(`/users/${userId}/memberOf`).get();
        const memberships = (groups?.value || []).filter(
          (m) => m["@odata.type"] === "#microsoft.graph.group"
        );

        for (const g of memberships) {
          try {
            await client.api(`/groups/${g.id}/members/${userId}/$ref`).delete();
            removedGroups.push(g.displayName || g.id);
          } catch (ge) {
            // dynamic/protected groups will 400/403 — collect and continue
            failedGroups.push(
              `${g.displayName || g.id}: ${ge?.message || ge?.body || ge}`
            );
          }
        }

        actions.push(
          `Removed from groups: ${
            removedGroups.length ? removedGroups.join(", ") : "None"
          }`
        );
        if (failedGroups.length) {
          actions.push(`Groups failed/ignored: ${failedGroups.length}`);
        }
      } catch (e) {
        actions.push(`Group removal scan failed: ${e?.message || e}`);
      }

      // 4.6 Disable owned devices (optional)
      if (disableDevices) {
        try {
          const devResult = await client.api(`/users/${userId}/ownedDevices`).get();
          const devices = (devResult?.value || []).filter((d) => d?.id);

          if (!devices.length) {
            actions.push("No assigned devices found");
          } else {
            for (const d of devices) {
              try {
                await client.api(`/devices/${d.id}`).update({ accountEnabled: false });
                actions.push(`Disabled device: ${d.displayName || d.id}`);
              } catch (de) {
                actions.push(
                  `Error disabling device ${d.displayName || d.id}: ${
                    de?.message || de
                  }`
                );
              }
            }
          }
        } catch (e) {
          actions.push(`Device lookup failed: ${e?.message || e}`);
        }
      }
    } catch (outer) {
      error = outer?.message || outer?.body || String(outer);
    }

    // 4.7 Summarize
    results.push({
      userId,
      actions,
      removedGroups,
      failedGroups,
      error,
      // TEST ONLY — remove in prod
      password: newPassword,
    });
  }

  // 5) Return
  return NextResponse.json({ mode, results });
}
