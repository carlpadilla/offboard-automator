import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/route"; // adjust if your path differs
import { Client } from "@microsoft/microsoft-graph-client";
import "isomorphic-fetch";
import { ClientSecretCredential } from "@azure/identity";

// ---------- helpers ----------
function newTempPassword() {
  // short, strong, test-only password
  return `Tmp!${Math.random().toString(36).slice(2, 8)}-${Math.floor(1000 + Math.random() * 9000)}`;
}

function graphClientDelegated(accessToken: string) {
  return Client.init({
    authProvider: (done) => done(null, accessToken),
  });
}

function graphClientAppOnly() {
  const tenantId = process.env.GRAPH_TENANT_ID!;
  const clientId = process.env.GRAPH_CLIENT_ID!;
  const clientSecret = process.env.GRAPH_CLIENT_SECRET!;
  const cred = new ClientSecretCredential(tenantId, clientId, clientSecret);
  return Client.init({
    authProvider: async (done) => {
      try {
        const token = await cred.getToken("https://graph.microsoft.com/.default");
        done(null, token?.token || "");
      } catch (e) {
        done(e as any, null);
      }
    },
  });
}

function hasAppCreds() {
  return Boolean(
    process.env.GRAPH_TENANT_ID &&
      process.env.GRAPH_CLIENT_ID &&
      process.env.GRAPH_CLIENT_SECRET
  );
}

// ---------- route ----------
export async function POST(req: Request) {
  const wantAppMode = hasAppCreds();
  let mode: "app" | "delegated" = wantAppMode ? "app" : "delegated";

  // Delegated path needs a session token
  let session: any = null;
  if (mode === "delegated") {
    session = await getServerSession(authOptions as any);
    if (!session || !session.accessToken) {
      return NextResponse.json(
        { error: "Unauthorized. Please sign in.", mode },
        { status: 401 }
      );
    }
  }

  // Parse body
  let userIds: string[] = [];
  let disableDevices = false;
  try {
    const body = await req.json();
    userIds = Array.isArray(body.userIds) ? body.userIds : [];
    disableDevices = !!body.disableDevices;
  } catch {
    return NextResponse.json({ error: "Invalid request body.", mode }, { status: 400 });
  }

  // Get Graph client
  const client =
    mode === "app"
      ? graphClientAppOnly()
      : graphClientDelegated(session.accessToken);

  const results: Array<{
    userId: string;
    actions: string[];
    removedGroups?: string[];
    failedGroups?: string[];
    error?: string;
    password?: string;
  }> = [];

  for (const userId of userIds) {
    const actions: string[] = [];
    const removedGroups: string[] = [];
    const failedGroups: string[] = [];
    let error: string | undefined;
    let newPassword: string | undefined;

    try {
      // 1) Disable account
      try {
        await client.api(`/users/${userId}`).update({ accountEnabled: false });
        actions.push("Disabled account");
      } catch (e: any) {
        const msg = e?.message || e?.body || String(e);
        throw new Error(`Disable account failed: ${msg}`);
      }

      // 2) Revoke sessions
      if (mode === "delegated") {
        try {
          await client.api(`/users/${userId}/revokeSignInSessions`).post({});
          actions.push("Revoked sign-in sessions");
        } catch (e: any) {
          const msg = e?.message || e?.body || String(e);
          actions.push(`Revoke sessions failed (delegated): ${msg}`);
        }
      } else {
        actions.push("Skipped revoking sessions (requires delegated permissions)");
      }

      // 3) Mark companyName
      try {
        await client.api(`/users/${userId}`).update({ companyName: "Disabled" });
        actions.push('Replaced company name with "Disabled"');
      } catch (e: any) {
        const msg = e?.message || e?.body || String(e);
        actions.push(`Set company name failed: ${msg}`);
      }

      // 4) Reset password
      try {
        newPassword = newTempPassword();
        await client.api(`/users/${userId}`).update({
          passwordProfile: {
            forceChangePasswordNextSignIn: true,
            password: newPassword,
          },
        });
        actions.push("Reset password and set a strong random value");
      } catch (e: any) {
        const msg = e?.message || e?.body || String(e);
        actions.push(`Error resetting password: ${msg}`);
      }

      // 5) Remove from groups (ignore dynamic membership errors)
      try {
        const groups = await client
          .api(`/users/${userId}/memberOf`)
          .select("id,displayName")
          .get();

        const memberships = (groups?.value || []).filter(
          (m: any) => m["@odata.type"] === "#microsoft.graph.group"
        );

        for (const g of memberships) {
          try {
            await client.api(`/groups/${g.id}/members/${userId}/$ref`).delete();
            removedGroups.push(g.displayName || g.id);
          } catch (ge: any) {
            // Dynamic membership or lack of rights often show up here — record and continue
            failedGroups.push(`${g.displayName || g.id}: ${ge?.message || ge?.body || ge}`);
          }
        }

        if (removedGroups.length) {
          actions.push(`Removed from groups: ${removedGroups.join(", ")}`);
        } else {
          actions.push("Removed from groups: None");
        }
        if (failedGroups.length) {
          actions.push(`Groups failed/ignored: ${failedGroups.length}`);
        }
      } catch (e: any) {
        const msg = e?.message || e?.body || String(e);
        actions.push(`Group removal scan failed: ${msg}`);
      }

      // 6) Devices (optional)
      if (disableDevices) {
        try {
          const devResult = await client.api(`/users/${userId}/ownedDevices`).get();
          const devices = (devResult.value || []).filter((d: any) => d.id);
          if (devices.length === 0) {
            actions.push("No assigned devices found");
          } else {
            for (const d of devices) {
              try {
                await client.api(`/devices/${d.id}`).update({ accountEnabled: false });
                actions.push(`Disabled device: ${d.displayName || d.id}`);
              } catch (de: any) {
                actions.push(
                  `Error disabling device ${d.displayName || d.id}: ${
                    de?.message || de?.body || de
                  }`
                );
              }
            }
          }
        } catch (e: any) {
          const msg = e?.message || e?.body || String(e);
          actions.push(`Device lookup failed: ${msg}`);
        }
      }
    } catch (outer: any) {
      error = outer?.message || outer?.body || String(outer);
    }

    results.push({
      userId,
      actions,
      removedGroups,
      failedGroups,
      error,
      // Expose the password ONLY while testing; remove in prod
      password: newPassword,
    });
  }

  return NextResponse.json({ mode, results });
}
