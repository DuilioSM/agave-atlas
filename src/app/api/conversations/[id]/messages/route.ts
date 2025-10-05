import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const runtime = 'nodejs';

// POST - Guardar mensaje en una conversación
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    const { id: conversationId } = await params;

    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { role, content, sources } = await request.json();

    // Verificar que la conversación pertenece al usuario
    const conversation = await prisma.conversation.findFirst({
      where: {
        id: conversationId,
        userId: session.user.id,
      },
    });

    if (!conversation) {
      return NextResponse.json(
        { error: "Conversación no encontrada" },
        { status: 404 }
      );
    }

    const message = await prisma.message.create({
      data: {
        conversationId,
        role,
        content,
        sources: sources || null,
      },
    });

    // Actualizar timestamp de la conversación
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });

    return NextResponse.json(message);
  } catch (error) {
    console.error("Error saving message:", error);
    return NextResponse.json(
      { error: "Error al guardar mensaje" },
      { status: 500 }
    );
  }
}
