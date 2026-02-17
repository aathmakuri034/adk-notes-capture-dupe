import { NextResponse } from "next/server";
// ✅ BACKEND - Import from package
import { getNotes, deleteNote } from "@vcmach/adk-notes-capture-server/database";
import type { Note } from "@vcmach/adk-notes-capture-server/database";

export async function GET() {
  try {
    // ✅ Use package function instead of direct file system access
    const notes = getNotes();

    // Transform to match expected frontend format
    const transformedNotes = notes.map(note => ({
      id: note.id as string,
      title: note.title as string,
      summary: note.description as string,
      details: note.details as string[],
      timestamp: (note.timestamp as string) || '1970-01-01'
    }));

    // SORT: Newest first
    transformedNotes.sort(
      (a, b) =>
        new Date(b.timestamp as string).getTime() -
        new Date(a.timestamp as string).getTime()
    );

    return NextResponse.json({ notes: transformedNotes });
  } catch (error) {
    console.error("Error reading notes:", error);
    return NextResponse.json({ notes: [] }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const noteId = searchParams.get("id");

    if (!noteId) {
      return NextResponse.json({ error: "Note ID required" }, { status: 400 });
    }

    // ✅ Use package function instead of direct file system access
    const success = deleteNote(noteId);

    if (success) {
      return NextResponse.json({ success: true });
    } else {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }
  } catch (error) {
    console.error("Error deleting note:", error);
    return NextResponse.json({ error: "Failed to delete note" }, { status: 500 });
  }
}