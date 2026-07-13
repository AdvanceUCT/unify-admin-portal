import { NextResponse } from "next/server";

import { assertCan, PermissionError, type SessionWithRole } from "@/lib/auth/permissions";
import { getCurrentAdminSession } from "@/lib/auth/session";
import {
  createCredentialSchemaVersion,
  CredentialSchemaVersionError,
} from "@/lib/university/credentialSchema";

export async function POST(request: Request) {
  const session = await getCurrentAdminSession();
  try {
    assertCan("credential:schema:manage", session as SessionWithRole);
  } catch (error) {
    const status = error instanceof PermissionError ? error.status : 401;
    return NextResponse.json({ error: { message: "Unauthorized schema management request." } }, { status });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: { message: "Request body must be valid JSON." } }, { status: 400 });
  }

  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  if (typeof record.schemaVersion !== "string" || !Array.isArray(record.attributes)) {
    return NextResponse.json(
      { error: { message: "schemaVersion and attributes are required." } },
      { status: 400 },
    );
  }
  if (!record.attributes.every((attribute) => typeof attribute === "string")) {
    return NextResponse.json({ error: { message: "attributes must contain only strings." } }, { status: 400 });
  }

  try {
    const schema = await createCredentialSchemaVersion({
      attributes: record.attributes as string[],
      schemaVersion: record.schemaVersion,
    });
    return NextResponse.json(
      {
        credentialDefinitionId: schema.credentialDefinitionId,
        id: schema.id,
        schemaId: schema.schemaId,
        schemaVersion: schema.schemaVersion,
      },
      { status: 201 },
    );
  } catch (error) {
    const status = error instanceof CredentialSchemaVersionError ? error.status : 502;
    return NextResponse.json(
      { error: { message: error instanceof Error ? error.message : "Schema registration failed." } },
      { status },
    );
  }
}
