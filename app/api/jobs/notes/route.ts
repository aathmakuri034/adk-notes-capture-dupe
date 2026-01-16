// app/api/notes/route.ts
import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

export async function GET() {
  try {
    // AUTH CHECK
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // READ NOTE FILES
    const notesDir = path.join(process.cwd(), "server", "voice_notes_data");

    if (!fs.existsSync(notesDir)) {
      return NextResponse.json({ notes: [] });
    }

    const files = fs.readdirSync(notesDir);
    const notes: any[] = [];

    for (const filename of files) {
      if (filename.startsWith("note_") && filename.endsWith(".json")) {
        const filepath = path.join(notesDir, filename);
        const fileContent = fs.readFileSync(filepath, "utf-8");

        try {
          const noteData = JSON.parse(fileContent);
          notes.push(noteData);
        } catch (e) {
          console.error("Failed to parse note file:", filename, e);
        }
      }
    }

    // SORT: Newest first
    notes.sort(
      (a, b) =>
        new Date(b.timestamp || 0).getTime() -
        new Date(a.timestamp || 0).getTime()
    );

    return NextResponse.json({ notes });
  } catch (error) {
    console.error("Error reading notes:", error);
    return NextResponse.json({ notes: [] }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    // AUTH CHECK
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const noteId = searchParams.get("id");

    if (!noteId) {
      return NextResponse.json({ error: "Note ID required" }, { status: 400 });
    }

    const notesDir = path.join(process.cwd(), "server", "voice_notes_data");
    const filepath = path.join(notesDir, `${noteId}.json`);

    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
      return NextResponse.json({ success: true });
    } else {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }
  } catch (error) {
    console.error("Error deleting note:", error);
    return NextResponse.json({ error: "Failed to delete note" }, { status: 500 });
  }
}