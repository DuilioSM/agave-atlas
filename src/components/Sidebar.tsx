"use client";

import { useState, useEffect, useImperativeHandle, forwardRef } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Menu, MessageSquarePlus, Trash2, Clock, PanelLeftClose, PanelLeft } from "lucide-react";
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
  const [isCollapsed, setIsCollapsed] = useState(false);

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

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));

    if (diffInHours < 1) return "Hace unos minutos";
    if (diffInHours < 24) return `Hace ${diffInHours}h`;
    if (diffInHours < 48) return "Ayer";
    if (diffInHours < 168) return `Hace ${Math.floor(diffInHours / 24)}d`;
    return date.toLocaleDateString();
  };

  const SidebarContent = ({ showCollapseButton = false }: { showCollapseButton?: boolean }) => (
    <div className="flex flex-col h-full">
      {/* Header with gradient */}
      <div className="sticky top-0 z-10 backdrop-blur-lg bg-background/80 border-b">
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Conversaciones</h2>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-full">
                {conversations.length}
              </span>
              {showCollapseButton && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setIsCollapsed(true)}
                >
                  <PanelLeftClose className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
          <Button
            onClick={handleNewConversation}
            className="w-full shadow-sm"
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
      </div>

      {/* Conversations list */}
      <ScrollArea className="flex-1 px-3 py-2">
        {conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-center text-muted-foreground">
            <MessageSquarePlus className="w-8 h-8 mb-2 opacity-50" />
            <p className="text-sm">No hay conversaciones</p>
          </div>
        ) : (
          <div className="space-y-1">
            {conversations.map((conversation) => (
              <div
                key={conversation.id}
                className={cn(
                  "group relative flex flex-col rounded-xl px-3 py-3 cursor-pointer transition-all duration-200",
                  "hover:bg-accent/50 hover:shadow-sm",
                  currentConversationId === conversation.id &&
                    "bg-accent border border-accent-foreground/10 shadow-sm"
                )}
                onClick={() => handleSelectConversation(conversation.id)}
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <span className="font-medium text-sm line-clamp-2 flex-1">
                    {conversation.title}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                    onClick={(e) => handleDeleteConversation(conversation.id, e)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  <span>{formatDate(conversation.updatedAt)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );

  return (
    <>
      {/* Mobile sidebar - Enhanced */}
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden relative"
          >
            <Menu className="h-5 w-5" />
            {conversations.length > 0 && (
              <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-primary text-[10px] font-medium text-primary-foreground flex items-center justify-center">
                {conversations.length > 9 ? '9+' : conversations.length}
              </span>
            )}
          </Button>
        </SheetTrigger>
        <SheetContent
          side="left"
          className="w-80 p-0 border-r-2"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Conversaciones</SheetTitle>
          </SheetHeader>
          <SidebarContent showCollapseButton={false} />
        </SheetContent>
      </Sheet>

      {/* Desktop sidebar */}
      <div
        className={cn(
          "hidden md:flex md:flex-col md:border-r md:bg-muted/40 transition-all duration-300",
          isCollapsed ? "md:w-0 md:overflow-hidden" : "md:w-64"
        )}
      >
        <SidebarContent showCollapseButton={true} />
      </div>

      {/* Botón para expandir sidebar cuando está colapsado - Desktop */}
      {isCollapsed && (
        <Button
          variant="ghost"
          size="icon"
          className="hidden md:flex absolute left-2 top-20 z-10 bg-background shadow-md hover:shadow-lg rounded-r-lg rounded-l-none border border-l-0"
          onClick={() => setIsCollapsed(false)}
        >
          <PanelLeft className="h-5 w-5" />
        </Button>
      )}
    </>
  );
});

Sidebar.displayName = "Sidebar";
