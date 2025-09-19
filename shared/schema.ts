import { sql } from 'drizzle-orm';
import {
  index,
  jsonb,
  pgTable,
  timestamp,
  varchar,
  text,
  decimal,
  integer,
  boolean
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Session storage table (required for Replit Auth)
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User storage table (required for Replit Auth)
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  pan: varchar("pan", { length: 10 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Tax documents (Form 16 uploads)
export const taxDocuments = pgTable("tax_documents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  fileName: varchar("file_name").notNull(),
  filePath: varchar("file_path"), // Optional - set after upload completion for security
  assessmentYear: varchar("assessment_year").notNull(),
  status: varchar("status").notNull().default("processing"), // processing, completed, failed
  extractedData: jsonb("extracted_data"), // Only for successful extractions - Form 16 data
  processingError: jsonb("processing_error"), // Only for failed extractions - error details
  uploadedAt: timestamp("uploaded_at").defaultNow(),
  processedAt: timestamp("processed_at"),
});

// Income sources
export const incomeSources = pgTable("income_sources", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  documentId: varchar("document_id").references(() => taxDocuments.id, { onDelete: "cascade" }),
  source: varchar("source").notNull(), // salary, rental, business, capital_gains, other
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  description: text("description"),
  assessmentYear: varchar("assessment_year").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Investments and deductions
export const investments = pgTable("investments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  documentId: varchar("document_id").references(() => taxDocuments.id, { onDelete: "cascade" }),
  section: varchar("section").notNull(), // 80C, 80D, 80G, etc.
  type: varchar("type").notNull(), // ELSS, PPF, NSC, insurance, etc.
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  description: text("description"),
  assessmentYear: varchar("assessment_year").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Tax calculations
export const taxCalculations = pgTable("tax_calculations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  documentId: varchar("document_id").references(() => taxDocuments.id, { onDelete: "cascade" }),
  assessmentYear: varchar("assessment_year").notNull(),
  grossIncome: decimal("gross_income", { precision: 12, scale: 2 }).notNull(),
  totalDeductions: decimal("total_deductions", { precision: 12, scale: 2 }).notNull(),
  taxableIncome: decimal("taxable_income", { precision: 12, scale: 2 }).notNull(),
  oldRegimeTax: decimal("old_regime_tax", { precision: 12, scale: 2 }).notNull(),
  newRegimeTax: decimal("new_regime_tax", { precision: 12, scale: 2 }).notNull(),
  tdsDeducted: decimal("tds_deducted", { precision: 12, scale: 2 }),
  refundAmount: decimal("refund_amount", { precision: 12, scale: 2 }),
  calculatedAt: timestamp("calculated_at").defaultNow(),
});

// Tax planning suggestions
export const taxSuggestions = pgTable("tax_suggestions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  assessmentYear: varchar("assessment_year").notNull(),
  section: varchar("section"), // 80C, 80D, REGIME, etc.
  category: varchar("category").notNull(), // investment, insurance, loan, savings, strategy
  suggestion: text("suggestion").notNull(),
  currentAmount: decimal("current_amount", { precision: 12, scale: 2 }).default('0'),
  maxAmount: decimal("max_amount", { precision: 12, scale: 2 }).default('0'),
  potentialSaving: decimal("potential_saving", { precision: 12, scale: 2 }),
  priority: integer("priority").notNull().default(1), // 1-10, 1 being highest
  urgency: varchar("urgency").notNull().default('medium'), // high, medium, low
  isImplemented: boolean("is_implemented").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// Insert schemas
export const insertTaxDocumentSchema = createInsertSchema(taxDocuments).omit({
  id: true,
  uploadedAt: true,
  processedAt: true,
});

export const insertIncomeSourceSchema = createInsertSchema(incomeSources).omit({
  id: true,
  createdAt: true,
});

export const insertInvestmentSchema = createInsertSchema(investments).omit({
  id: true,
  createdAt: true,
});

export const insertTaxCalculationSchema = createInsertSchema(taxCalculations).omit({
  id: true,
  calculatedAt: true,
});

export const insertTaxSuggestionSchema = createInsertSchema(taxSuggestions).omit({
  id: true,
  createdAt: true,
});

// Types
export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
export type TaxDocument = typeof taxDocuments.$inferSelect;
export type InsertTaxDocument = z.infer<typeof insertTaxDocumentSchema>;
export type IncomeSource = typeof incomeSources.$inferSelect;
export type InsertIncomeSource = z.infer<typeof insertIncomeSourceSchema>;
export type Investment = typeof investments.$inferSelect;
export type InsertInvestment = z.infer<typeof insertInvestmentSchema>;
export type TaxCalculation = typeof taxCalculations.$inferSelect;
export type InsertTaxCalculation = z.infer<typeof insertTaxCalculationSchema>;
export type TaxSuggestion = typeof taxSuggestions.$inferSelect;
export type InsertTaxSuggestion = z.infer<typeof insertTaxSuggestionSchema>;
