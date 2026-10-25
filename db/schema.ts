import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
export const contentSnapshots = sqliteTable("content_snapshots", {
  section: text("section").primaryKey(), payload: text("payload").notNull(),
  updatedAt: text("updated_at").notNull(), revision: integer("revision").notNull().default(1),
});
export const parentingProfiles = sqliteTable("parenting_profiles", {
  userId: text("user_id").primaryKey(), payload: text("payload").notNull(),
  updatedAt: text("updated_at").notNull(), revision: integer("revision").notNull().default(1),
});
