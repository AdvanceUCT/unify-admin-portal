import { NextResponse } from "next/server";
import { syncStudentsFromUniversity } from "@/lib/connectors/universityConnector";

export async function POST() {
  try {
    const result = await syncStudentsFromUniversity();
    return NextResponse.json({
      message: `Synced ${result.synced} students from university database.`,
      ...result,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Sync failed." },
      { status: 500 }
    );
  }
}