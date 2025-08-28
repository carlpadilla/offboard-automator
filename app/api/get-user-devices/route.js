import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]/route";
import { Client } from "@microsoft/microsoft-graph-client";
import { ClientSecretCredential } from "@azure/identity";

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

export async function GET(request) {
  // Require a signed-in session (UI access control)
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = request.nextUrl.searchParams.get("userId");
  if (!userId) {
    return NextResponse.json({ devices: [] });
  }

  try {
    const client = await getAppGraphClient();
    const result = await client.api(`/users/${userId}/ownedDevices`).get();
    const devices = (result.value || []).filter((d) => d.deviceId);
    return NextResponse.json({ devices });
  } catch (e) {
    // Return 200 with empty list so the UI doesn’t break
    return NextResponse.json({ devices: [], error: e?.message || String(e) });
  }
}
