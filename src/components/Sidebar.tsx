"use client";

import { useState, useEffect, useImperativeHandle, forwardRef } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Menu, MessageSquarePlus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Conversation {
  id: string;
  title: string;
  updatedAt: string;
}

interface SidebarProps {
  currentConversationId?: string;
  onSelectConversation: (id: string) => void;
  onNewConversation: () => void;
  isLoadingConversation?: boolean;
}

export interface SidebarRef {
  refreshConversations: () => void;
}

export const Sidebar = forwardRef<SidebarRef, SidebarProps>(({
  currentConversationId,
  onSelectConversation,
  onNewConversation,
  isLoadingConversation = false,
}, ref) => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  const loadConversations = async () => {
    try {
      const response = await fetch("/api/conversations");
      if (response.ok) {
        const data = await response.json();
        setConversations(data);
      }
    } catch (error) {
      console.error("Error loading conversations:", error);
    }
  };

  useEffect(() => {
    loadConversations();
  }, []);

  useImperativeHandle(ref, () => ({
    refreshConversations: loadConversations,
  }));

  const handleNewConversation = () => {
    onNewConversation();
    setIsOpen(false);
  };

  const handleSelectConversation = (id: string) => {
    onSelectConversation(id);
    setIsOpen(false);
  };

  const handleDeleteConversation = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();

    if (!confirm("¿Estás seguro de eliminar esta conversación?")) {
      return;
    }

    try {
      const response = await fetch(`/api/conversations/${id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        setConversations(conversations.filter((c) => c.id !== id));
        if (currentConversationId === id) {
          onNewConversation();
        }
      }
    } catch (error) {
      console.error("Error deleting conversation:", error);
    }
  };

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      <div className="p-4">
        <Button
          onClick={handleNewConversation}
          className="w-full"
          variant="default"
          disabled={isLoadingConversation}
        >
          {isLoadingConversation ? (
            <>
              <div className="w-4 h-4 mr-2 border-2 border-background border-t-transparent rounded-full animate-spin"></div>
              Creando...
            </>
          ) : (
            <>
              <MessageSquarePlus className="w-4 h-4 mr-2" />
              Nueva conversación
            </>
          )}
        </Button>
      </div>

      <ScrollArea className="flex-1 px-2">
        <div className="space-y-1">
          {conversations.map((conversation) => (
            <div
              key={conversation.id}
              className={cn(
                "group flex items-center justify-between rounded-lg px-3 py-2 text-sm cursor-pointer hover:bg-accent transition-colors",
                currentConversationId === conversation.id && "bg-accent"
              )}
              onClick={() => handleSelectConversation(conversation.id)}
            >
              <span className="truncate flex-1">{conversation.title}</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => handleDeleteConversation(conversation.id, e)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );

  return (
    <>
      {/* Mobile sidebar */}
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="md:hidden">
            <Menu className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-64 p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>Conversaciones</SheetTitle>
          </SheetHeader>
          <SidebarContent />
        </SheetContent>
      </Sheet>

      {/* Desktop sidebar */}
      <div className="hidden md:flex md:w-64 md:flex-col md:border-r md:bg-muted/40">
        <SidebarContent />
      </div>
    </>
  );
});

Sidebar.displayName = "Sidebar";
