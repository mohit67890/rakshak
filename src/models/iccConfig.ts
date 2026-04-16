/**
 * Raksha — ICC Configuration Model
 *
 * Cosmos DB container: "iccConfig"
 * Partition key: /tenantId
 */

import type { BaseDocument } from "../database/types";

export type IccRole = "presiding_officer" | "member" | "external_member";
export type Gender = "female" | "male" | "other";

export interface IccMember {
  userId: string; // Entra object ID
  name: string;
  email: string;
  role: IccRole;
  gender: Gender;
  isActive: boolean;
}

export interface EscalationContact {
  level: number; // 1=Audit Committee, 2=District Officer
  name: string;
  email: string;
  role: string;
}

export interface IccSettings {
  acknowledgementDeadlineDays: number; // Default: 7
  inquiryDeadlineDays: number; // Default: 90 (per POSH Act)
  autoEscalateOnMiss: boolean;
  enableAnonymousReporting: boolean;
  enableCriminalThresholdAlert: boolean;
  nodalOfficerEmail: string;
}

export interface IccConfiguration extends BaseDocument {
  id: string;
  tenantId: string;
  organizationName: string;
  iccMembers: IccMember[];
  escalationContacts: EscalationContact[];
  settings: IccSettings;
  createdAt: string;
  updatedAt: string;
}
