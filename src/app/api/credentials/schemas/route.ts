import { NextResponse } from "next/server";

import { assertCan, PermissionError, type SessionWithRole } from "@/lib/auth/permissions";
import { getCurrentAdminSession } from "@/lib/auth/session";
import {
  createDraftCredentialSchemaVersion,
  CredentialSchemaVersionError,
  deleteDraftCredentialSchemaVersion,
  publishCredentialSchemaVersion,
} from "@/lib/university/credentialSchema";

// Indy ledger registration normally takes longer than Vercel's default Hobby timeout.
export const maxDuration = 60;

async function requireSchemaManagement() {
  const session = await getCurrentAdminSession();
  try {
    assertCan("credential:schema:manage", session as SessionWithRole);
    return session!;
  } catch (error) {
    const status = error instanceof PermissionError ? error.status : 401;
    return NextResponse.json({ error: { message: "Unauthorized schema management request." } }, { status });
  }
}

export async function POST(request: Request) {
  const sessionOrResponse = await requireSchemaManagement();
  if (sessionOrResponse instanceof NextResponse) return sessionOrResponse;

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
    const schema = await createDraftCredentialSchemaVersion({
      actorId: sessionOrResponse.user.id,
      attributes: record.attributes as string[],
      schemaVersion: record.schemaVersion,
    });
    return NextResponse.json(
      {
        id: schema.id,
        schemaVersion: schema.schemaVersion,
        status: schema.status,
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

export async function PATCH(request: Request) {
  const sessionOrResponse = await requireSchemaManagement();
  if (sessionOrResponse instanceof NextResponse) return sessionOrResponse;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: { message: "Request body must be valid JSON." } }, { status: 400 });
  }

  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  if (typeof record.schemaId !== "string") {
    return NextResponse.json({ error: { message: "schemaId is required." } }, { status: 400 });
  }

  try {
    const schema = await publishCredentialSchemaVersion({
      actorId: sessionOrResponse.user.id,
      schemaId: record.schemaId,
    });
    return NextResponse.json({
      credentialDefinitionId: schema.credentialDefinitionId,
      id: schema.id,
      schemaId: schema.schemaId,
      schemaVersion: schema.schemaVersion,
      status: schema.status,
    });
  } catch (error) {
    const status = error instanceof CredentialSchemaVersionError ? error.status : 502;
    return NextResponse.json(
      { error: { message: error instanceof Error ? error.message : "Schema publishing failed." } },
      { status },
    );
  }
}

export async function DELETE(request: Request) {
  const sessionOrResponse = await requireSchemaManagement();
  if (sessionOrResponse instanceof NextResponse) return sessionOrResponse;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: { message: "Request body must be valid JSON." } }, { status: 400 });
  }

  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  if (typeof record.schemaId !== "string") {
    return NextResponse.json({ error: { message: "schemaId is required." } }, { status: 400 });
  }

  try {
    await deleteDraftCredentialSchemaVersion({
      actorId: sessionOrResponse.user.id,
      schemaId: record.schemaId,
    });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    const status = error instanceof CredentialSchemaVersionError ? error.status : 502;
    return NextResponse.json(
      { error: { message: error instanceof Error ? error.message : "Schema draft deletion failed." } },
      { status },
    );
  }
}
