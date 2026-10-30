import { createFileRoute } from "@tanstack/react-router";
import { LicensedAccessCenter } from "@/components/license-gate";

export const Route = createFileRoute("/")({
  component: LicensedAccessCenter,
});
