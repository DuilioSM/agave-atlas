"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import ReactMarkdown from "react-markdown";

interface Message {
  role: "user" | "assistant";
  content: string;
  sources?: any[];
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = { role: "user", content: input };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages }),
      });

      const data = await response.json();
      const assistantMessage: Message = {
        role: "assistant",
        content: data.message,
        sources: data.sources,
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-background">
      <header className="border-b px-4 py-3">
        <h1 className="text-xl font-semibold">Chat</h1>
      </header>

      <ScrollArea className="flex-1 p-4">
        <div className="max-w-3xl mx-auto space-y-4">
          {messages.length === 0 && (
            <div className="flex items-center justify-center h-[60vh]">
              <p className="text-muted-foreground">
                Envía un mensaje para comenzar
              </p>
            </div>
          )}

          {messages.map((message, index) => (
            <div
              key={index}
              className={`flex ${
                message.role === "user" ? "justify-end" : "justify-start"
              }`}
            >
              <Card
                className={`max-w-[80%] px-4 py-3 ${
                  message.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted"
                }`}
              >
                                <ReactMarkdown>{message.content}</ReactMarkdown>
                {message.role === "assistant" && message.sources && message.sources.length > 0 && (
                  <div className="mt-4">
                    <h4 className="font-semibold">Fuentes:</h4>
                    <ul className="list-disc list-inside">
                      {message.sources.map((source: any, index: number) => (
                        <li key={index}>
                          <a href={source.link} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
                            {source.title}
                          </a>
                          {source.authors && source.authors.length > 0 && (
                            <p className="text-sm text-gray-500">Autores: {source.authors.join(", ")}</p>
                          )}
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

      <div className="border-t p-4">
        <form onSubmit={sendMessage} className="max-w-3xl mx-auto">
          <div className="flex gap-2">
            <Input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Escribe un mensaje..."
              disabled={isLoading}
              className="flex-1"
            />
            <Button type="submit" disabled={isLoading || !input.trim()}>
              Enviar
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
