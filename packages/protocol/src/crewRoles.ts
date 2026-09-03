import { z } from "zod";

/**
 * The seats a crew fills, in the order a room fills them.
 *
 * They live in a module of their own because both the wire schemas and the
 * balance schemas need them, and the balance module cannot import the package
 * entry: the entry already imports it.
 */
export const CREW_ROLES = ["pilot", "gunner", "shield"] as const;
export const crewRoleSchema = z.enum(CREW_ROLES);
export type CrewRole = z.infer<typeof crewRoleSchema>;
