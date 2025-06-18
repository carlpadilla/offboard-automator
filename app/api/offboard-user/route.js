import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]/route";
import { Client } from "@microsoft/microsoft-graph-client";

// Helper: generate a strong random password (14 chars, at least 1 uppercase, 1 number, 1 symbol)
function generateRandomPassword() {
  const lower = 'abcdefghijklmnopqrstuvwxyz';
  const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const numbers = '0123456789';
  const symbols = '!@#$%^&*()_-+=[]{}|:,.?';

  // Always include at least one of each
  let password =
    upper[Math.floor(Math.random() * upper.length)] +
    lower[Math.floor(Math.random() * lower.length)] +
    numbers[Math.floor(Math.random() * numbers.length)] +
    symbols[Math.floor(Math.random() * symbols.length)];

  const all = lower + upper + numbers + symbols;
  for (let i = 4; i < 14; i++) {
    password += all[Math.floor(Math.random() * all.length)];
  }
  return password
    .split('')
    .sort(() => Math.random() - 0.5)
    .join('');
}

export async function POST(req) {
  const session = await getServerSession(authOptions);
  if (!session || !session.accessToken) {
    return NextResponse.json({ error: "Unauthorized. Please sign in." }, { status: 401 });
  }

  let userIds = [];
  let disableDevices = false;
  try {
    const body = await req.json();
    userIds = Array.isArray(body.userIds) ? body.userIds : [];
    disableDevices = !!body.disableDevices;
  } catch (err) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const client = Client.init({
    authProvider: (done) => done(null, session.accessToken),
  });

  const results = [];
  for (const userId of userIds) {
    const actions = [];
    let error = null;
    const removedGroups = [];
    const failedGroups = [];
    let newPassword = null;

    try {
      // Disable the user account
      await client.api(`/users/${userId}`).update({ accountEnabled: false });
      actions.push("Disabled account");

      // Revoke sign-in sessions
      await client.api(`/users/${userId}/revokeSignInSessions`).post();
      actions.push("Revoked sign-in sessions");

      // Set companyName to "Disabled"
      await client.api(`/users/${userId}`).update({ companyName: "Disabled" });
      actions.push('Replaced company name with "Disabled"');

      // Reset password
      try {
        newPassword = generateRandomPassword();
        await client.api(`/users/${userId}`).update({
          passwordProfile: {
            password: newPassword,
            forceChangePasswordNextSignIn: false
          }
        });
        actions.push("Reset password and set a strong random value");
      } catch (pwErr) {
        actions.push(`Error resetting password: ${pwErr.message || pwErr.toString()}`);
      }

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

      // Remove from groups
      try {
        const groupsRes = await client.api(`/users/${userId}/memberOf`).get();
        const groups = (groupsRes.value || []).filter(g => g['@odata.type'] === '#microsoft.graph.group');
        for (const group of groups) {
          try {
            await client.api(`/groups/${group.id}/members/${userId}/$ref`).delete();
            removedGroups.push(group.displayName || group.id);
          } catch (groupErr) {
            failedGroups.push({
              group: group.displayName || group.id,
              error: groupErr.message || groupErr.toString()
            });
          }
        }
        actions.push(`Removed from groups: ${removedGroups.length ? removedGroups.join(', ') : 'None'}`);
        if (failedGroups.length) {
          actions.push(
            `Could not remove from some groups (often dynamic): ${failedGroups
              .map(g => g.group)
              .join(', ')}`
          );
        }
      } catch (groupListErr) {
        actions.push(`Error listing groups: ${groupListErr.message || groupListErr.toString()}`);
      }

    } catch (err) {
      error = err.message || err.toString();
      actions.push(`Error: ${error}`);
    }

    // Always push a summary for this user
    results.push({
      userId,
      actions,
      removedGroups,
      failedGroups,
      error,
      password: newPassword // Show new password only for audit/troubleshoot (be careful in production!)
    });
  }

  return NextResponse.json({ results });
}
