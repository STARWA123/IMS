"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { WorkspaceItem } from "../../modules/workspace/workspace-types";
import { readApiError } from "../shared/api-client";

const STORAGE_KEY = "offertrack.currentWorkspaceId";

type WorkspaceContextValue = {
  workspaces: WorkspaceItem[];
  currentWorkspace: WorkspaceItem | null;
  currentWorkspaceId: string | null;
  selectWorkspace: (workspaceId: string) => void;
  createWorkspace: (input: {
    name: string;
    description?: string;
  }) => Promise<void>;
  renameCurrentWorkspace: (name: string) => Promise<void>;
  deleteCurrentWorkspace: () => Promise<void>;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({
  initialWorkspaces,
  children,
}: {
  initialWorkspaces: WorkspaceItem[];
  children: ReactNode;
}): ReactNode {
  const [workspaces, setWorkspaces] = useState(initialWorkspaces);
  const [currentWorkspaceId, setCurrentWorkspaceId] = useState<string | null>(
    initialWorkspaces[0]?.id ?? null,
  );

  useEffect(() => {
    const storedId = window.localStorage.getItem(STORAGE_KEY);
    if (storedId && workspaces.some((workspace) => workspace.id === storedId)) {
      setCurrentWorkspaceId(storedId);
    }
  }, []);

  const selectWorkspace = useCallback(
    (workspaceId: string) => {
      if (!workspaces.some((workspace) => workspace.id === workspaceId)) {
        return;
      }
      setCurrentWorkspaceId(workspaceId);
      window.localStorage.setItem(STORAGE_KEY, workspaceId);
    },
    [workspaces],
  );

  const createWorkspaceAction = useCallback(
    async (input: { name: string; description?: string }): Promise<void> => {
      const response = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!response.ok) {
        throw new Error(await readApiError(response));
      }
      const body = (await response.json()) as { workspace: WorkspaceItem };
      setWorkspaces((items) => [...items, body.workspace]);
      setCurrentWorkspaceId(body.workspace.id);
      window.localStorage.setItem(STORAGE_KEY, body.workspace.id);
    },
    [],
  );

  const renameCurrentWorkspace = useCallback(
    async (name: string): Promise<void> => {
      if (!currentWorkspaceId) {
        throw new Error("当前没有可重命名的 Workspace。");
      }
      const response = await fetch(`/api/workspaces/${currentWorkspaceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!response.ok) {
        throw new Error(await readApiError(response));
      }
      const body = (await response.json()) as { workspace: WorkspaceItem };
      setWorkspaces((items) =>
        items.map((workspace) =>
          workspace.id === body.workspace.id ? body.workspace : workspace,
        ),
      );
    },
    [currentWorkspaceId],
  );

  const deleteCurrentWorkspace = useCallback(async (): Promise<void> => {
    if (!currentWorkspaceId) {
      throw new Error("当前没有可删除的 Workspace。");
    }
    const response = await fetch(`/api/workspaces/${currentWorkspaceId}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      throw new Error(await readApiError(response));
    }
    const body = (await response.json()) as { workspaces: WorkspaceItem[] };
    const nextWorkspaceId = body.workspaces[0]?.id ?? null;
    setWorkspaces(body.workspaces);
    setCurrentWorkspaceId(nextWorkspaceId);
    if (nextWorkspaceId) {
      window.localStorage.setItem(STORAGE_KEY, nextWorkspaceId);
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, [currentWorkspaceId]);

  const value = useMemo<WorkspaceContextValue>(() => {
    const currentWorkspace =
      workspaces.find((workspace) => workspace.id === currentWorkspaceId) ?? null;
    return {
      workspaces,
      currentWorkspace,
      currentWorkspaceId,
      selectWorkspace,
      createWorkspace: createWorkspaceAction,
      renameCurrentWorkspace,
      deleteCurrentWorkspace,
    };
  }, [
    workspaces,
    currentWorkspaceId,
    selectWorkspace,
    createWorkspaceAction,
    renameCurrentWorkspace,
    deleteCurrentWorkspace,
  ]);

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace(): WorkspaceContextValue {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error("useWorkspace must be used inside WorkspaceProvider.");
  }
  return context;
}
