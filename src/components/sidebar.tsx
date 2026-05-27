import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Link,
  useNavigate,
  useMatchRoute,
  useRouterState,
} from "@tanstack/react-router";
import {
  ArrowLeftFromLine,
  ArrowRightToLine,
  PlusIcon,
  ArrowLeft,
  SearchIcon,
  X,
  Database,
} from "lucide-react";
import { ChatListItem } from "./sidebar-chat-list-item";
import { SidebarSchemaSection } from "./sidebar-schema-section";
import { SidebarStarredSection } from "./sidebar-starred-section";
import { SidebarSectionHeader } from "./sidebar-section-header";
import { SidebarUserMenu } from "./sidebar-user-menu";
import { SidebarSettingsNav } from "./sidebar-settings-nav";

import type { LucideIcon } from "lucide-react";
import type { ChatListItem as ChatListItemType } from "@nao/backend/chat";
import { Button } from "@/components/ui/button";
import { getActiveProjectId, setActiveProjectId } from "@/lib/active-project";
import { cn, hideIf } from "@/lib/utils";
import { useChatListQuery } from "@/queries/use-chat-list-query";
import { useSidebar } from "@/contexts/sidebar";
import { useCommandMenuCallback } from "@/contexts/command-menu-callback";
import { useSectionActivity } from "@/hooks/use-chat-activity";
import NaoLogo from "@/components/icons/nao-logo.svg";
import { trpc } from "@/main";

const normalizeDate = (v: Date | number | string): number =>
  v instanceof Date ? v.getTime() : Number(v);

export function Sidebar() {
  const chats = useChatListQuery();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const matchRoute = useMatchRoute();
  const {
    isCollapsed,
    isMobile,
    isMobileOpen,
    closeMobile,
    toggle: toggleSidebar,
  } = useSidebar();
  const { fire: openCommandMenu } = useCommandMenuCallback();
  const project = useQuery(trpc.project.getCurrent.queryOptions());
  const projects = useQuery(trpc.project.listForCurrentUser.queryOptions());
  const config = useQuery(trpc.system.getPublicConfig.queryOptions());
  const isAdmin = project.data?.userRole === "admin";
  const isCloud = config.data?.naoMode === "cloud";

  const locationPath = useRouterState({ select: (s) => s.location.pathname });
  const isInSettings = matchRoute({ to: "/settings", fuzzy: true });
  const effectiveIsCollapsed = isMobile ? false : isCollapsed;

  useEffect(() => {
    if (isMobile && isMobileOpen) {
      closeMobile();
    }
  }, [locationPath]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleStartNewChat = useCallback(() => {
    navigate({ to: "/" });
    if (isMobile) {
      closeMobile();
    }
  }, [navigate, isMobile, closeMobile]);

  const handleSearchChats = useCallback(() => {
    openCommandMenu();
    if (isMobile) {
      closeMobile();
    }
  }, [openCommandMenu, isMobile, closeMobile]);

  const handleNavigateConnections = useCallback(() => {
    navigate({ to: "/connections" });
    if (isMobile) {
      closeMobile();
    }
  }, [navigate, isMobile, closeMobile]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.shiftKey && e.metaKey && e.key.toLowerCase() === "o") {
        e.preventDefault();
        handleStartNewChat();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleStartNewChat]);

  useEffect(() => {
    if (!project.data?.id) {
      return;
    }

    if (getActiveProjectId() !== project.data.id) {
      setActiveProjectId(project.data.id);
    }
  }, [project.data?.id]);

  const handleProjectChange = useCallback(
    async (projectId: string) => {
      if (!project.data || projectId === project.data.id) {
        return;
      }

      setActiveProjectId(projectId);
      await queryClient.invalidateQueries();
      if (isMobile) {
        closeMobile();
      }
    },
    [closeMobile, isMobile, project.data, queryClient],
  );

  const sidebarContent = (
    <div
      className={cn(
        "flex flex-col h-full overflow-hidden",
        isMobile
          ? "w-60 bg-sidebar"
          : cn(
              "border-r border-sidebar-border transition-[width,background-color] duration-300",
              effectiveIsCollapsed ? "w-13 bg-panel" : "w-60 bg-sidebar",
            ),
      )}
    >
      <div className="p-2 flex flex-col gap-1">
        {isInSettings ? (
          <div className="flex items-center relative">
            <Link
              to="/"
              onClick={() => isMobile && closeMobile()}
              className={cn(
                "flex items-center gap-2 text-sm rounded-md transition-all duration-300",
                "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground whitespace-nowrap",
                effectiveIsCollapsed
                  ? "w-0 opacity-0 overflow-hidden p-0"
                  : "flex-1 min-w-0 opacity-100 px-3 py-2",
              )}
            >
              <ArrowLeft className="size-4 shrink-0" />
              <span className="truncate">Back to app</span>
            </Link>
            {!isMobile && (
              <Button
                variant="ghost"
                size="icon-md"
                onClick={() => toggleSidebar()}
                className="text-muted-foreground shrink-0"
              >
                {effectiveIsCollapsed ? (
                  <ArrowRightToLine className="size-4" />
                ) : (
                  <ArrowLeftFromLine className="size-4" />
                )}
              </Button>
            )}
          </div>
        ) : (
          <>
            <div className="flex items-center relative">
              <button
                type="button"
                onClick={handleStartNewChat}
                aria-label="New chat"
                className={cn(
                  "flex items-center justify-center p-2 mr-auto absolute left-0 z-0 rounded-md cursor-pointer hover:bg-sidebar-accent transition-[opacity,visibility,background-color] duration-300",
                  hideIf(effectiveIsCollapsed),
                )}
              >
                <NaoLogo className="size-5" />
              </button>

              {isMobile ? (
                <Button
                  variant="ghost"
                  size="icon-md"
                  onClick={closeMobile}
                  className="text-muted-foreground ml-auto z-10"
                >
                  <X className="size-4" />
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="icon-md"
                  onClick={() => toggleSidebar()}
                  className="text-muted-foreground ml-auto z-10"
                >
                  {effectiveIsCollapsed ? (
                    <ArrowRightToLine className="size-4" />
                  ) : (
                    <ArrowLeftFromLine className="size-4" />
                  )}
                </Button>
              )}
            </div>

            <SidebarMenuButton
              icon={PlusIcon}
              label="New chat"
              shortcut="⇧⌘O"
              isCollapsed={effectiveIsCollapsed}
              onClick={handleStartNewChat}
            />
            <SidebarMenuButton
              icon={SearchIcon}
              label="Search chats"
              shortcut="⌘K"
              isCollapsed={effectiveIsCollapsed}
              onClick={handleSearchChats}
            />
            <SidebarMenuButton
              icon={Database}
              label="Connections"
              shortcut=""
              isCollapsed={effectiveIsCollapsed}
              onClick={handleNavigateConnections}
            />
          </>
        )}
      </div>

      {isInSettings ? (
        <SidebarSettingsNav
          isCollapsed={effectiveIsCollapsed}
          isAdmin={isAdmin}
          isCloud={isCloud}
          projects={projects.data ?? []}
          currentProjectId={project.data?.id}
          onProjectChange={handleProjectChange}
        />
      ) : (
        <>
          <SidebarStarredSection isCollapsed={effectiveIsCollapsed} />
          <SidebarNav
            chats={chats.data?.chats || []}
            isCollapsed={effectiveIsCollapsed}
          />
          <SidebarSchemaSection isCollapsed={effectiveIsCollapsed} />
        </>
      )}

      <div
        className={cn(
          "mt-auto transition-[padding] duration-300",
          effectiveIsCollapsed ? "p-1" : "p-2",
        )}
      >
        <SidebarUserMenu isCollapsed={effectiveIsCollapsed} />
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <>
        {isMobileOpen && (
          <div className="fixed inset-0 z-40 flex">
            <div
              className="fixed inset-0 bg-black/50 animate-in fade-in duration-200"
              onClick={closeMobile}
            />
            <div className="relative z-50 animate-in slide-in-from-left duration-200">
              {sidebarContent}
            </div>
          </div>
        )}
      </>
    );
  }

  return sidebarContent;
}

function SidebarMenuButton({
  icon: Icon,
  label,
  shortcut,
  isCollapsed,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  shortcut: string;
  isCollapsed: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      variant="ghost"
      className={cn(
        "w-full justify-start relative group shadow-none transition-[padding,height,background-color] duration-300 p-[9px_!important]",
        isCollapsed ? "h-9" : "",
      )}
      onClick={onClick}
    >
      <Icon className="size-4" />
      <div
        className={cn(
          "flex items-center transition-[opacity,visibility] duration-300",
          hideIf(isCollapsed),
        )}
      >
        <span>{label}</span>
        <kbd className="group-hover:opacity-100 opacity-0 absolute right-3 text-[10px] text-muted-foreground font-sans transition-opacity hidden md:inline">
          {shortcut}
        </kbd>
      </div>
    </Button>
  );
}

function SidebarNav({
  chats,
  isCollapsed,
}: {
  chats: ChatListItemType[];
  isCollapsed: boolean;
}) {
  const [chatsOpen, setChatsOpen] = useState(
    () => localStorage.getItem("sidebar-chats-open") !== "false",
  );

  const toggleChats = useCallback(() => {
    setChatsOpen((prev) => {
      localStorage.setItem("sidebar-chats-open", String(!prev));
      return !prev;
    });
  }, []);

  // Starred chats are rendered in the unified Starred section at the top of
  // the sidebar — drop them from this list so they don't appear twice.
  const { regular, regularIds } = useMemo(() => {
    const rest = chats
      .filter((c) => !c.isStarred)
      .slice()
      .sort((a, b) => normalizeDate(b.createdAt) - normalizeDate(a.createdAt));
    return { regular: rest, regularIds: rest.map((c) => c.id) };
  }, [chats]);

  const chatsActivity = useSectionActivity(regularIds);

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden transition-[opacity,visibility] duration-300",
        // Only claim flex-1 when the main Chats list is expanded — otherwise the
        // section collapses to just its headers so the next section sits right below.
        chatsOpen && "flex-1 min-h-0",
        hideIf(isCollapsed),
      )}
    >
      <div className="px-2 space-y-0.5">
        <ChatsSectionHeader
          isOpen={chatsOpen}
          onToggle={toggleChats}
          activity={chatsActivity}
        />
      </div>

      {chatsOpen && (
        <div className="w-60 flex-1 overflow-y-auto px-2 space-y-1">
          {regular.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center p-4">
              No chats yet.
              <br />
              Start a new chat!
            </p>
          ) : (
            regular.map((chat) => <ChatListItem key={chat.id} chat={chat} />)
          )}
        </div>
      )}
    </div>
  );
}

function ChatsSectionHeader({
  isOpen,
  onToggle,
  activity,
}: {
  isOpen: boolean;
  onToggle: () => void;
  activity?: { running: boolean; unread: boolean };
}) {
  return (
    <SidebarSectionHeader
      label="Chats"
      isOpen={isOpen}
      onToggle={onToggle}
      activity={activity}
    />
  );
}
