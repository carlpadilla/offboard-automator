import { NextResponse } from 'next/server';
import { ClientSecretCredential } from '@azure/identity';
import { Client } from '@microsoft/microsoft-graph-client';

export async function GET(request) {
  try {
    const userId = request.nextUrl.searchParams.get("userId");
    if (!userId) {
      return NextResponse.json([], { status: 200 });
    }

    const credential = new ClientSecretCredential(
      process.env.AZURE_TENANT_ID,
      process.env.AZURE_CLIENT_ID,
      process.env.AZURE_CLIENT_SECRET
    );
    const token = await credential.getToken("https://graph.microsoft.com/.default");
    const client = Client.init({
      authProvider: (done) => done(null, token.token),
    });

    // List devices registered to this user
    const result = await client.api(`/users/${userId}/ownedDevices`).get();
    // Filter for device objects (not app registrations)
    const devices = (result.value || []).filter(d => d.deviceId);

    return NextResponse.json(devices);
  } catch (err) {
    return NextResponse.json([], { status: 200 });
  }
}
