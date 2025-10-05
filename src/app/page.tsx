"use client";

import { useState, useRef, useEffect } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Sidebar, SidebarRef } from "@/components/Sidebar";
import ReactMarkdown from "react-markdown";
import { LogOut, User, Send, Paperclip, Loader2 } from "lucide-react";

interface Message {
  role: "user" | "assistant";
  content: string;
  sources?: Array<{ title: string; link: string }>;
}

export default function Home() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingConversation, setIsLoadingConversation] = useState(false);
  const [currentConversationId, setCurrentConversationId] = useState<string | undefined>();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<SidebarRef>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    } else if (status === "authenticated" && !currentConversationId) {
      // Crear una conversación inicial cuando el usuario entra por primera vez
      handleNewConversation();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, router]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const loadConversation = async (conversationId: string) => {
    setIsLoadingConversation(true);
    try {
      const response = await fetch(`/api/conversations/${conversationId}`);
      if (response.ok) {
        const data = await response.json();
        setMessages(
          data.messages.map((msg: { role: string; content: string; sources?: Array<{ title: string; link: string }> }) => ({
            role: msg.role as "user" | "assistant",
            content: msg.content,
            sources: msg.sources,
          }))
        );
        setCurrentConversationId(conversationId);
      }
    } catch (error) {
      console.error("Error loading conversation:", error);
    } finally {
      setIsLoadingConversation(false);
    }
  };

  const handleNewConversation = async () => {
    setIsLoadingConversation(true);
    try {
      // Crear nueva conversación
      const response = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Nueva conversación",
        }),
      });

      if (response.ok) {
        const conversation = await response.json();
        setCurrentConversationId(conversation.id);
        setMessages([]);

        // Refrescar la lista de conversaciones
        sidebarRef.current?.refreshConversations();
      }
    } catch (error) {
      console.error("Error creating conversation:", error);
    } finally {
      setIsLoadingConversation(false);
    }
  };

  const saveMessage = async (role: string, content: string, sources?: Array<{ title: string; link: string }>) => {
    if (!currentConversationId) {
      console.error("No hay conversación activa");
      return;
    }

    try {
      await fetch(`/api/conversations/${currentConversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, content, sources }),
      });

      // Si es el primer mensaje del usuario, actualizar el título
      if (role === "user" && messages.length === 0) {
        await fetch(`/api/conversations/${currentConversationId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: content.slice(0, 50) + (content.length > 50 ? "..." : ""),
          }),
        });

        // Refrescar la lista para mostrar el nuevo título
        sidebarRef.current?.refreshConversations();
      }
    } catch (error) {
      console.error("Error saving message:", error);
    }
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = { role: "user", content: input };
    setMessages((prev) => [...prev, userMessage]);
    const userMessageContent = input;
    setInput("");
    setIsLoading(true);

    // Guardar mensaje del usuario
    await saveMessage("user", userMessageContent);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMessageContent,
          history: messages.map((msg) => ({
            role: msg.role,
            content: msg.content,
          })),
        }),
      });

      const data = await response.json();
      const assistantMessage: Message = {
        role: "assistant",
        content: data.message,
        sources: data.sources,
      };
      setMessages((prev) => [...prev, assistantMessage]);

      // Guardar mensaje del asistente
      await saveMessage("assistant", data.message, data.sources);
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-muted-foreground">Cargando...</p>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  return (
    <div className="flex h-screen bg-background">
      <Sidebar
        ref={sidebarRef}
        currentConversationId={currentConversationId}
        onSelectConversation={loadConversation}
        onNewConversation={handleNewConversation}
        isLoadingConversation={isLoadingConversation}
      />

      <div className="flex flex-col flex-1">
        <header className="border-b px-4 py-3 flex justify-between items-center">
          <h1 className="text-xl font-semibold">Agave Atlas</h1>
          <div className="flex items-center gap-3">
            {session?.user && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="relative h-10 w-10 rounded-full">
                    <Avatar className="h-10 w-10">
                      <AvatarImage
                        src={session.user.image || ""}
                        alt={session.user.name || ""}
                      />
                      <AvatarFallback>
                        {session.user.name?.charAt(0).toUpperCase() || (
                          <User className="h-4 w-4" />
                        )}
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56" align="end" forceMount>
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium leading-none">
                        {session.user.name}
                      </p>
                      <p className="text-xs leading-none text-muted-foreground">
                        {session.user.email}
                      </p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="cursor-pointer"
                    onClick={() => signOut({ callbackUrl: "/login" })}
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Cerrar sesión</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </header>

        <ScrollArea className="flex-1 p-4">
          <div className="max-w-3xl mx-auto space-y-4">
            {isLoadingConversation ? (
              <div className="flex items-center justify-center h-[60vh]">
                <div className="flex flex-col items-center gap-3">
                  <div className="relative w-12 h-12">
                    <div className="absolute inset-0 border-4 border-primary/20 rounded-full"></div>
                    <div className="absolute inset-0 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                  </div>
                  <p className="text-sm text-muted-foreground">Cargando conversación...</p>
                </div>
              </div>
            ) : messages.length === 0 ? (
              <div className="flex items-center justify-center h-[60vh]">
                <p className="text-muted-foreground">
                  Envía un mensaje para comenzar
                </p>
              </div>
            ) : null}

            {!isLoadingConversation && messages.map((message, index) => (
              <div
                key={index}
                className={`flex ${
                  message.role === "user" ? "justify-end" : "justify-start"
                } animate-in fade-in slide-in-from-bottom-2 duration-300`}
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <Card
                  className={`max-w-[80%] px-4 py-3 ${
                    message.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted"
                  }`}
                >
                  <ReactMarkdown>{message.content}</ReactMarkdown>
                  {message.role === "assistant" &&
                    message.sources &&
                    message.sources.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-muted-foreground/20 text-xs text-muted-foreground">
                        <p className="font-semibold mb-1">Fuentes:</p>
                        <ul className="space-y-1">
                          {message.sources.map((source, idx) => (
                            <li key={idx}>
                              <a
                                href={source.link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary hover:underline"
                              >
                                {source.title}
                              </a>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                </Card>
              </div>
            ))}

            {isLoading && (
              <div className="flex justify-start">
                <Card className="max-w-[80%] px-4 py-3 bg-muted">
                  <div className="flex space-x-2">
                    <div className="w-2 h-2 bg-foreground/40 rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-foreground/40 rounded-full animate-bounce [animation-delay:0.2s]"></div>
                    <div className="w-2 h-2 bg-foreground/40 rounded-full animate-bounce [animation-delay:0.4s]"></div>
                  </div>
                </Card>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        <div className="border-t p-4 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <form onSubmit={sendMessage} className="max-w-3xl mx-auto">
            <div className="relative flex items-end gap-2">
              {/* Textarea container with modern styling */}
              <div className="relative flex-1 group">
                <div className="absolute inset-0 bg-gradient-to-r from-primary/20 to-primary/10 rounded-2xl opacity-0 group-focus-within:opacity-100 blur-xl transition-opacity duration-300" />
                <div className="relative flex items-center bg-muted/50 border-2 border-border focus-within:border-primary/50 rounded-2xl shadow-sm transition-all duration-200 hover:shadow-md focus-within:shadow-md">
                  {/* Input field */}
                  <Input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={isLoadingConversation ? "Cargando conversación..." : "Escribe tu mensaje aquí..."}
                    disabled={isLoading || isLoadingConversation}
                    className="flex-1 border-0 bg-transparent px-3 py-4 focus-visible:ring-0 focus-visible:ring-offset-0 text-sm placeholder:text-muted-foreground/60"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        if (!isLoading && !isLoadingConversation && input.trim()) {
                          sendMessage(e);
                        }
                      }
                    }}
                  />

                  {/* Character count (optional) */}
                  {input.length > 0 && (
                    <span className="mr-2 text-xs text-muted-foreground/60 shrink-0">
                      {input.length}
                    </span>
                  )}
                </div>
              </div>

              {/* Send button with enhanced styling */}
              <Button
                type="submit"
                disabled={isLoading || isLoadingConversation || !input.trim()}
                size="icon"
                className="h-12 w-12 shrink-0 rounded-2xl shadow-md transition-all duration-200 hover:shadow-lg hover:scale-105 disabled:scale-100 disabled:opacity-50"
              >
                {isLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Send className="h-5 w-5" />
                )}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
