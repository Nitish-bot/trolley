export interface Resource {
  name: string;
  index: number;
}

export interface Role {
  name: string;
  roleIndex: number;
  permissions: bigint;
  isActive: boolean;
}

export interface User {
  address: string;
  label: string;
  roles: bigint;
}

export interface App {
  name: string;
  authority: string;
}

export interface LogEntry {
  ix: string;
  details: Record<string, string | number | bigint>;
  ts: string;
}

export type VerdictType = "authorized" | "denied" | "inactive" | "error";

export type TabId = "admin" | "user";
