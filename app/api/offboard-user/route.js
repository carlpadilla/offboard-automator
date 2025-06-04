import { NextResponse } from 'next/server';
import { ClientSecretCredential } from '@azure/identity';
import { Client } from '@microsoft/microsoft-graph-client';
import generatePassword from 'generate-password';

export async function POST(request) {
  try {
    const { userIds } = await request.json();
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return NextResponse.json({ error: 'At least one user must be selected.' }, { status: 400 });
    }

    // Auth
    const credential = new ClientSecretCredential(
      process.env.AZURE_TENANT_ID,
      process.env.AZURE_CLIENT_ID,
      process.env.AZURE_CLIENT_SECRET
    );
    const token = await credential.getToken("https://graph.microsoft.com/.default");
    const client = Client.init({
      authProvider: (done) => done(null, token.token),
    });

    const results = [];

    for (const userId of userIds) {
      const actions = [];
      let displayName = userId;
      let newPassword = "";
      try {
        // Get display name for reporting
        const user = await client.api(`/users/${userId}`).select('displayName').get();
        displayName = user.displayName || userId;

        // 1. Disable the user
        await client.api(`/users/${userId}`).update({ accountEnabled: false });
        actions.push("Disabled account");

        // 2. Revoke sign-in sessions
        await client.api(`/users/${userId}/revokeSignInSessions`).post();
        actions.push("Revoked sign-in sessions");

        // 3. Set companyName to "Former Employee"
        await client.api(`/users/${userId}`).update({ companyName: "Former Employee" });
        actions.push('Replaced company name with "Former Employee"');

        // 4. Reset password
        newPassword = generatePassword.generate({
          length: 16,
          numbers: true,
          symbols: true,
          uppercase: true,
          lowercase: true,
          strict: true,
        });

        await client.api(`/users/${userId}`).update({
          passwordProfile: {
            password: newPassword,
            forceChangePasswordNextSignIn: true
          }
        });
        actions.push("Reset password to a random value (shown below)");

        results.push({ displayName, actions, password: newPassword });
      } catch (err) {
        results.push({
          displayName,
          actions,
          error: err.message || "Unknown error"
        });
      }
    }

    return NextResponse.json({
      success: true,
