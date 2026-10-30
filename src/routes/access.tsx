import { createFileRoute } from "@tanstack/react-router";
import { LicensedAccessCenter } from "@/components/license-gate";
export const Route = createFileRoute("/access")({ component: LicensedAccessCenter });
