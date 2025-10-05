import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const runtime = 'nodejs';

// GET - Obtener el HTML report de una conversación
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    const { id: conversationId } = await params;

    if (!session?.user?.id) {
      return new NextResponse("No autorizado", { status: 401 });
    }

    // Verificar que la conversación pertenece al usuario
    const conversation = await prisma.conversation.findFirst({
      where: {
        id: conversationId,
        userId: session.user.id,
      },
      select: {
        htmlReport: true,
      },
    });

    if (!conversation) {
      return new NextResponse("Conversación no encontrada", { status: 404 });
    }

    if (!conversation.htmlReport) {
      return new NextResponse("No hay reporte disponible", { status: 404 });
    }

    // Retornar HTML con el tipo de contenido correcto
    return new NextResponse(conversation.htmlReport, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
      },
    });
  } catch (error) {
    console.error("Error getting HTML report:", error);
    return new NextResponse("Error al obtener reporte", { status: 500 });
  }
}
