import { create } from "zustand";
import type { Agent, Permission, WorkflowRun, AuditEntry, Invoice } from "@/types";
import { DEMO_INVOICES } from "@/lib/demo";

// -----------------------------------------------------------------------------
// Client presentation state. The server (Terminal 3, mock or live) is the
// source of truth for anything verified; this mirrors it for a responsive UI.
// -----------------------------------------------------------------------------

interface AgentState {
  agents: Agent[];
  permissions: Permission[];
  runs: WorkflowRun[];
  audit: AuditEntry[];
  invoices: Invoice[];
  seeded: boolean;

  agentById: (id: string) => Agent | undefined;
  permissionsForAgent: (agentId: string) => Permission[];
  activePermissionForAgent: (agentId: string) => Permission | undefined;
  runsForAgent: (agentId: string) => WorkflowRun[];
  auditForAgent: (agentId: string) => AuditEntry[];

  seed: () => void;
  addAgent: (agent: Agent) => void;
  updateAgent: (id: string, patch: Partial<Agent>) => void;
  addPermission: (permission: Permission) => void;
  revokePermission: (id: string) => void;
  upsertRun: (run: WorkflowRun) => void;
  addAuditEntries: (entries: AuditEntry[]) => void;
}

export const useAgentStore = create<AgentState>((set, get) => ({
  agents: [],
  permissions: [],
  runs: [],
  audit: [],
  invoices: [],
  seeded: false,

  agentById: (id) => get().agents.find((a) => a.id === id),
  permissionsForAgent: (agentId) => get().permissions.filter((p) => p.agentId === agentId),
  activePermissionForAgent: (agentId) =>
    get().permissions.find((p) => p.agentId === agentId && p.active),
  runsForAgent: (agentId) => get().runs.filter((r) => r.agentId === agentId),
  auditForAgent: (agentId) => get().audit.filter((e) => e.agentId === agentId),

  seed: () =>
    set((s) => {
      if (s.seeded) return s;
      const agent: Agent = {
        id: "agt_atlas",
        name: "Atlas",
        role: "Finance Agent",
        did: "did:t3n:65556727a58a0f9fec54c7672ac433d6a73774f1",
        agentPubkey:
          "0x02b4f8c1a7e9d3526180af43c2e7159b8d04a6f721c3e8095da27b461f0c9e8d34",
        status: "active",
        createdAt: "2026-06-12T09:24:00.000Z",
      };
      const permission: Permission = {
        id: "perm_atlas_1",
        agentId: agent.id,
        credentialId: "0x7c41a9f0e3b25d68",
        maxApprovalAmount: 10000,
        allowedVendors: ["Aurora Cloud Services", "Northwind Supplies"],
        functions: ["invoice.analyze", "invoice.pay"],
        expiresAt: "2026-12-31T23:59:59.000Z",
        issuedAt: "2026-06-12T09:31:00.000Z",
        active: true,
      };
      const audit: AuditEntry[] = [
        {
          id: "aud_1",
          agentId: agent.id,
          action: "agent.registered",
          detail: "Atlas provisioned with delegatee key and Terminal 3 identity.",
          attestationId: null,
          timestamp: "2026-06-12T09:24:00.000Z",
        },
        {
          id: "aud_2",
          agentId: agent.id,
          action: "permission.issued",
          detail: "Delegation credential issued — $10,000 ceiling, 2 vendors.",
          attestationId: null,
          timestamp: "2026-06-12T09:31:00.000Z",
        },
      ];
      return {
        ...s,
        seeded: true,
        agents: [agent],
        permissions: [permission],
        audit,
        invoices: DEMO_INVOICES,
      };
    }),

  addAgent: (agent) => set((s) => ({ agents: [agent, ...s.agents] })),
  updateAgent: (id, patch) =>
    set((s) => ({ agents: s.agents.map((a) => (a.id === id ? { ...a, ...patch } : a)) })),
  addPermission: (permission) =>
    set((s) => ({
      permissions: [permission, ...s.permissions.map((p) =>
        p.agentId === permission.agentId ? { ...p, active: false } : p
      )],
    })),
  revokePermission: (id) =>
    set((s) => ({
      permissions: s.permissions.map((p) => (p.id === id ? { ...p, active: false } : p)),
    })),
  upsertRun: (run) =>
    set((s) => {
      const exists = s.runs.some((r) => r.id === run.id);
      return {
        runs: exists ? s.runs.map((r) => (r.id === run.id ? run : r)) : [run, ...s.runs],
      };
    }),
  addAuditEntries: (entries) => set((s) => ({ audit: [...entries, ...s.audit] })),
}));
