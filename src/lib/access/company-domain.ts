import type { Account, Role } from "./domain";
export type Branch = { id: string; name: string; address: string };
export type Company = {
  id: string;
  nameAr: string;
  nameEn: string;
  address: string;
  contact: string;
  logo: string;
  branches: Branch[];
  createdAt: string;
};
export type Membership = { companyId: string; role: Role };
export type Identity = Account & {
  systemAdmin: boolean;
  memberships: Membership[];
};
export type Platform = {
  schemaVersion: 1;
  revision: number;
  companies: Company[];
  accounts: Identity[];
  audit: { at: string; actor: string; action: string; companyId: string }[];
};
