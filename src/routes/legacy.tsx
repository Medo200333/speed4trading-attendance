import { createFileRoute } from "@tanstack/react-router";
import { AttendanceBoard } from "@/components/attendance-board";
export const Route = createFileRoute("/legacy")({ component: AttendanceBoard });
