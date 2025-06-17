import { NextResponse } from 'next/server';
import { ClientSecretCredential } from '@azure/identity';
import { Client } from '@microsoft/microsoft-graph-client';

export async function GET() {
  try {
    const credential = new ClientSecretCredential(
      process.env.AZURE_TENANT_ID,
      process.env.AZURE_CLIENT_ID,
      process.env.AZURE_CLIENT_SECRET
    );

    const token = await credential.getToken("https://graph.microsoft.com/.default");

    const client = Client.init({
      authProvider: (done) => {
        done(null, token.token);
      },
    });

    const users = await client.api('/users').select('id,displayName,mail').top(100).get();

    // 👇 This wraps the value in an object with a 'users' property!
    return NextResponse.json({ users: users.value });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
