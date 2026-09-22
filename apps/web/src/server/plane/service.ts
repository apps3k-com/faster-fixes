import { prisma } from "@workspace/db";
import { getPlaneClient } from "./client";

export type PlaneProject = {
  id: string;
  name: string;
  identifier: string;
  intake_view?: boolean;
};
export type PlaneState = { id: string; name: string; group: string };
export type PlaneType = { id: string; name: string };
export type PlaneField = {
  id: string;
  name: string;
  display_name?: string;
  property_type: string;
  display_format?: string;
  is_required?: boolean;
  is_active?: boolean;
  default_value?: unknown;
  deleted_at?: string | null;
};
export type PlaneMember = {
  id: string;
  email?: string;
  display_name?: string;
  first_name?: string;
  last_name?: string;
  role?: number;
  member?: { id: string; email?: string; display_name?: string };
  member_id?: string;
};

export function normalizePlaneMember(member: PlaneMember) {
  return {
    id: member.member?.id ?? member.member_id ?? member.id,
    email: member.member?.email ?? member.email ?? null,
    name:
      member.member?.display_name ??
      member.display_name ??
      [member.first_name, member.last_name].filter(Boolean).join(" "),
    role: member.role ?? null,
  };
}

export async function getPlaneCatalog(
  organizationId: string,
  projectId?: string,
  typeId?: string,
) {
  const installation = await prisma.planeInstallation.findUniqueOrThrow({
    where: { organizationId },
  });
  const client = await getPlaneClient(installation.id);
  const projects = await client.list<PlaneProject>(
    `${client.workspacePath}/projects/`,
  );
  const workspaceMembers = (
    await client.list<PlaneMember>(`${client.workspacePath}/members/`)
  ).map(normalizePlaneMember);
  if (!projectId)
    return {
      projects,
      workspaceMembers,
      states: [] as PlaneState[],
      types: [] as PlaneType[],
      fields: [] as PlaneField[],
      members: [] as ReturnType<typeof normalizePlaneMember>[],
    };
  if (!projects.some((p) => p.id === projectId))
    throw new Error("Plane project is not available in this workspace.");
  const path = client.projectPath(projectId);
  const [states, types, members, fields] = await Promise.all([
    client.list<PlaneState>(`${path}/states/`),
    client.list<PlaneType>(`${path}/work-item-types/`),
    client.list<PlaneMember>(`${path}/project-members/`),
    typeId
      ? client.list<PlaneField>(
          `${path}/work-item-types/${encodeURIComponent(typeId)}/work-item-properties/`,
        )
      : Promise.resolve([]),
  ]);
  return {
    projects,
    workspaceMembers,
    states,
    types,
    fields: fields.filter(
      (field) => !field.deleted_at && field.is_active !== false,
    ),
    members: members.map(normalizePlaneMember),
  };
}
