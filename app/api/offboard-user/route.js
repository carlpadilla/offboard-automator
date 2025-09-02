// app/api/offboard-user/route.js
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]/route";
import { Client } from "@microsoft/microsoft-graph-client";
import "isomorphic-fetch";
import { ClientSecretCredential } from "@azure/identity";

/* ----------------------- helpers ----------------------- */

function newTempPassword() {
  return `Tmp!${Math.random().toString(36).slice(2, 8)}-${Math.floor(
    1000 + Math.random() * 9000
  )}`;
}

function graphClientDelegated(accessToken) {
  return Client.init({
    authProvider: (done) => done(null, accessToken),
  });
}

function graphClientAppOnly() {
  const tenantId = process.env.GRAPH_TENANT_ID;
  const clientId = process.env.GRAPH_CLIENT_ID;
  const clientSecret = process.env.GRAPH_CLIENT_SECRET;

  const cred = new ClientSecretCredential(tenantId, clientId, clientSecret);

  return Client.init({
    authProvider: async (done) => {
      try {
        const token = await cred.getToken("https://graph.microsoft.com/.default");
        done(null, token?.token || "");
      } catch (e) {
        done(e, null);
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

/* ----------------------- route ------------------------- */

export async function POST(req) {
  // Choose mode
  const wantAppMode = hasAppCreds();
  const mode = wantAppMode ? "app" : "delegated";

  // If delegated, we need a signed-in session with an access token
  let session = null;
  if (mode === "delegated") {
    session = await getServerSession(authOptions);
    if (!session || !session.accessToken) {
      return NextResponse.json(
        { error: "Unauthorized. Please sign in.", mode },
        { status: 401 }
      );
    }
  }

  // Parse request
  let userIds = [];
  let disableDevices = false;
  try {
    const body = await req.json();
    userIds = Array.isArray(body.userIds) ? body.userIds : [];
    disableDevices = !!body.disableDevices;
    if (!userIds.length) {
      return NextResponse.json(
        { error: "No users supplied.", mode },
        { status: 400 }
      );
    }
  } catch {
    return NextResponse.json({ error: "Invalid request body.", mode }, { status: 400 });
  }

  // Graph client
  const client =
    mode === "app"
      ? graphClientAppOnly()
      : graphClientDelegated(session.accessToken);

  const results = [];

  for (const userId of userIds) {
    const actions = [];
    const removedGroups = [];
    const failedGroups = [];
    let error;
    let newPassword;

    try {
      /* 1) Disable account */
      try {
        await client.api(`/users/${userId}`).update({ accountEnabled: false });
        actions.push("Disabled account");
      } catch (e) {
        const msg = e?.message || e?.body || String(e);
        throw new Error(`Disable account failed: ${msg}`);
      }

      /* 2) Revoke sessions (works only with delegated) */
      if (mode === "delegated") {
        try {
          await client.api(`/users/${userId}/revokeSignInSessions`).post({});
          actions.push("Revoked sign-in sessions");
        } catch (e) {
          const msg = e?.message || e?.body || String(e);
          actions.push(`Revoke sessions failed (delegated): ${msg}`);
        }
      } else {
        actions.push("Skipped revoking sessions (app-only)");
      }

      /* 3) Mark companyName */
      try {
        await client.api(`/users/${userId}`).update({ companyName: "Disabled" });
        actions.push('Replaced company name with "Disabled"');
      } catch (e) {
        const msg = e?.message || e?.body || String(e);
        actions.push(`Set company name failed: ${msg}`);
      }

      /* 4) Reset password */
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
        const msg = e?.message || e?.body || String(e);
        actions.push(`Error resetting password: ${msg}`);
      }

      /* 5) Remove from groups (best-effort; skip dynamic errors) */
      try {
        const groups = await client
          .api(`/users/${userId}/memberOf`)
          .select("id,displayName,@odata.type")
          .get();

        const memberships = (groups?.value || []).filter(
          (m) => m["@odata.type"] === "#microsoft.graph.group"
        );

        for (const g of memberships) {
          try {
            await client.api(`/groups/${g.id}/members/${userId}/$ref`).delete();
            removedGroups.push(g.displayName || g.id);
          } catch (ge) {
            failedGroups.push(
              `${g.displayName || g.id}: ${ge?.message || ge?.body || ge}`
            );
          }
        }

        actions.push(
          removedGroups.length
            ? `Removed from groups: ${removedGroups.join(", ")}`
            : "Removed from groups: None"
        );
        if (failedGroups.length) {
          actions.push(`Groups failed/ignored: ${failedGroups.length}`);
        }
      } catch (e) {
        const msg = e?.message || e?.body || String(e);
        actions.push(`Group removal scan failed: ${msg}`);
      }

      /* 6) Disable devices (optional, requires Device.ReadWrite.All app perm) */
      if (disableDevices) {
        try {
          const devResult = await client.api(`/users/${userId}/ownedDevices`).get();
          const devices = (devResult.value || []).filter((d) => d.id);
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
                    de?.message || de?.body || de
                  }`
                );
              }
            }
          }
        } catch (e) {
          const msg = e?.message || e?.body || String(e);
          actions.push(`Device lookup failed: ${msg}`);
        }
      }
    } catch (outer) {
      error = outer?.message || outer?.body || String(outer);
    }

    // TEST ONLY — remove password in production
    results.push({
      userId,
      actions,
      removedGroups,
      failedGroups,
      error,
      password: newPassword,
    });
  }

  return NextResponse.json({ mode, results });
}



// // app/api/offboard-user/route.js
// import { NextResponse } from "next/server";
// import { getServerSession } from "next-auth";
// import { authOptions } from "../auth/[...nextauth]/route"; // adjust path if needed
// import { Client } from "@microsoft/microsoft-graph-client";
// import "isomorphic-fetch";
// import { ClientSecretCredential } from "@azure/identity";

// // ---------- helpers ----------
// function newTempPassword() {
//   return `Tmp!${Math.random().toString(36).slice(2, 8)}-${Math.floor(
//     1000 + Math.random() * 9000
//   )}`;
// }

// function graphClientDelegated(accessToken) {
//   return Client.init({
//     authProvider: (done) => done(null, accessToken),
//   });
// }

// function graphClientAppOnly() {
//   const tenantId = process.env.GRAPH_TENANT_ID;
//   const clientId = process.env.GRAPH_CLIENT_ID;
//   const clientSecret = process.env.GRAPH_CLIENT_SECRET;
//   const cred = new ClientSecretCredential(tenantId, clientId, clientSecret);

//   return Client.init({
//     authProvider: async (done) => {
//       try {
//         const token = await cred.getToken("https://graph.microsoft.com/.default");
//         done(null, token && token.token ? token.token : "");
//       } catch (e) {
//         done(e, null);
//       }
//     },
//   });
// }

// function hasAppCreds() {
//   return Boolean(
//     process.env.GRAPH_TENANT_ID &&
//       process.env.GRAPH_CLIENT_ID &&
//       process.env.GRAPH_CLIENT_SECRET
//   );
// }

// // ---------- route ----------
// export async function POST(req) {
//   const wantAppMode = hasAppCreds();
//   let mode = wantAppMode ? "app" : "delegated";

//   // Delegated needs a session token
//   let session = null;
//   if (mode === "delegated") {
//     session = await getServerSession(authOptions);
//     if (!session || !session.accessToken) {
//       return NextResponse.json(
//         { error: "Unauthorized. Please sign in.", mode },
//         { status: 401 }
//       );
//     }
//   }

//   // Parse body
//   let userIds = [];
//   let disableDevices = false;
//   try {
//     const body = await req.json();
//     userIds = Array.isArray(body.userIds) ? body.userIds : [];
//     disableDevices = !!body.disableDevices;
//   } catch {
//     return NextResponse.json({ error: "Invalid request body.", mode }, { status: 400 });
//   }

//   // Graph client
//   const client =
//     mode === "app"
//       ? graphClientAppOnly()
//       : graphClientDelegated(session.accessToken);

//   const results = [];

//   for (const userId of userIds) {
//     const actions = [];
//     const removedGroups = [];
//     const failedGroups = [];
//     let error;
//     let newPassword;

//     try {
//       // 1) Disable account
//       try {
//         await client.api(`/users/${userId}`).update({ accountEnabled: false });
//         actions.push("Disabled account");
//       } catch (e) {
//         const msg = e?.message || e?.body || String(e);
//         throw new Error(`Disable account failed: ${msg}`);
//       }

//       // 2) Revoke sessions
//       if (mode === "delegated") {
//         try {
//           await client.api(`/users/${userId}/revokeSignInSessions`).post({});
//           actions.push("Revoked sign-in sessions");
//         } catch (e) {
//           const msg = e?.message || e?.body || String(e);
//           actions.push(`Revoke sessions failed (delegated): ${msg}`);
//         }
//       } else {
//         actions.push("Skipped revoking sessions (requires delegated permissions)");
//       }

//       // 3) Mark companyName
//       try {
//         await client.api(`/users/${userId}`).update({ companyName: "Disabled" });
//         actions.push('Replaced company name with "Disabled"');
//       } catch (e) {
//         const msg = e?.message || e?.body || String(e);
//         actions.push(`Set company name failed: ${msg}`);
//       }

//       // 4) Reset password
//       try {
//         newPassword = newTempPassword();
//         await client.api(`/users/${userId}`).update({
//           passwordProfile: {
//             forceChangePasswordNextSignIn: true,
//             password: newPassword,
//           },
//         });
//         actions.push("Reset password and set a strong random value");
//       } catch (e) {
//         const msg = e?.message || e?.body || String(e);
//         actions.push(`Error resetting password: ${msg}`);
//       }

//       // 5) Remove from groups
//       try {
//         const groups = await client
//           .api(`/users/${userId}/memberOf`)
//           .select("id,displayName")
//           .get();

//         const memberships = (groups?.value || []).filter(
//           (m) => m["@odata.type"] === "#microsoft.graph.group"
//         );

//         for (const g of memberships) {
//           try {
//             await client.api(`/groups/${g.id}/members/${userId}/$ref`).delete();
//             removedGroups.push(g.displayName || g.id);
//           } catch (ge) {
//             failedGroups.push(`${g.displayName || g.id}: ${ge?.message || ge?.body || ge}`);
//           }
//         }

//         if (removedGroups.length) {
//           actions.push(`Removed from groups: ${removedGroups.join(", ")}`);
//         } else {
//           actions.push("Removed from groups: None");
//         }
//         if (failedGroups.length) {
//           actions.push(`Groups failed/ignored: ${failedGroups.length}`);
//         }
//       } catch (e) {
//         const msg = e?.message || e?.body || String(e);
//         actions.push(`Group removal scan failed: ${msg}`);
//       }

//       // 6) Devices (optional)
//       if (disableDevices) {
//         try {
//           const devResult = await client.api(`/users/${userId}/ownedDevices`).get();
//           const devices = (devResult.value || []).filter((d) => d.id);
//           if (devices.length === 0) {
//             actions.push("No assigned devices found");
//           } else {
//             for (const d of devices) {
//               try {
//                 await client.api(`/devices/${d.id}`).update({ accountEnabled: false });
//                 actions.push(`Disabled device: ${d.displayName || d.id}`);
//               } catch (de) {
//                 actions.push(
//                   `Error disabling device ${d.displayName || d.id}: ${
//                     de?.message || de?.body || de
//                   }`
//                 );
//               }
//             }
//           }
//         } catch (e) {
//           const msg = e?.message || e?.body || String(e);
//           actions.push(`Device lookup failed: ${msg}`);
//         }
//       }
//     } catch (outer) {
//       error = outer?.message || outer?.body || String(outer);
//     }

//     results.push({
//       userId,
//       actions,
//       removedGroups,
//       failedGroups,
//       error,
//       // TEST ONLY – remove in prod
//       password: newPassword,
//     });
//   }

//   return NextResponse.json({ mode, results });
// }
