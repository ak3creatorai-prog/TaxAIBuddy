import {
  users,
  taxDocuments,
  incomeSources,
  investments,
  taxCalculations,
  taxSuggestions,
  type User,
  type UpsertUser,
  type TaxDocument,
  type InsertTaxDocument,
  type IncomeSource,
  type InsertIncomeSource,
  type Investment,
  type InsertInvestment,
  type TaxCalculation,
  type InsertTaxCalculation,
  type TaxSuggestion,
  type InsertTaxSuggestion,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and } from "drizzle-orm";

export interface IStorage {
  // User operations (required for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  
  // Tax document operations
  createTaxDocument(document: InsertTaxDocument): Promise<TaxDocument>;
  getTaxDocumentsByUser(userId: string): Promise<TaxDocument[]>;
  getTaxDocument(id: string, userId: string): Promise<TaxDocument | undefined>;
  updateTaxDocument(id: string, userId: string, updates: Partial<TaxDocument>): Promise<TaxDocument | undefined>;
  
  // Income source operations
  createIncomeSource(income: InsertIncomeSource): Promise<IncomeSource>;
  getIncomeSourcesByUser(userId: string, assessmentYear?: string): Promise<IncomeSource[]>;
  updateIncomeSource(id: string, userId: string, updates: Partial<IncomeSource>): Promise<IncomeSource | undefined>;
  deleteIncomeSource(id: string, userId: string): Promise<boolean>;
  
  // Investment operations
  createInvestment(investment: InsertInvestment): Promise<Investment>;
  getInvestmentsByUser(userId: string, assessmentYear?: string): Promise<Investment[]>;
  updateInvestment(id: string, userId: string, updates: Partial<Investment>): Promise<Investment | undefined>;
  deleteInvestment(id: string, userId: string): Promise<boolean>;
  
  // Tax calculation operations
  createTaxCalculation(calculation: InsertTaxCalculation): Promise<TaxCalculation>;
  getTaxCalculationsByUser(userId: string): Promise<TaxCalculation[]>;
  getTaxCalculation(userId: string, assessmentYear: string): Promise<TaxCalculation | undefined>;
  
  // Tax suggestion operations
  createTaxSuggestion(suggestion: InsertTaxSuggestion): Promise<TaxSuggestion>;
  getTaxSuggestionsByUser(userId: string, assessmentYear?: string): Promise<TaxSuggestion[]>;
  updateTaxSuggestion(id: string, userId: string, updates: Partial<TaxSuggestion>): Promise<TaxSuggestion | undefined>;
}

export class DatabaseStorage implements IStorage {
  // User operations
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  // Tax document operations
  async createTaxDocument(document: InsertTaxDocument): Promise<TaxDocument> {
    const [created] = await db.insert(taxDocuments).values(document).returning();
    return created;
  }

  async getTaxDocumentsByUser(userId: string): Promise<TaxDocument[]> {
    return await db
      .select()
      .from(taxDocuments)
      .where(eq(taxDocuments.userId, userId))
      .orderBy(desc(taxDocuments.uploadedAt));
  }

  async getTaxDocument(id: string, userId: string): Promise<TaxDocument | undefined> {
    const [document] = await db
      .select()
      .from(taxDocuments)
      .where(and(eq(taxDocuments.id, id), eq(taxDocuments.userId, userId)));
    return document;
  }

  async updateTaxDocument(
    id: string,
    userId: string,
    updates: Partial<TaxDocument>
  ): Promise<TaxDocument | undefined> {
    const [updated] = await db
      .update(taxDocuments)
      .set(updates)
      .where(and(eq(taxDocuments.id, id), eq(taxDocuments.userId, userId)))
      .returning();
    return updated;
  }

  // Income source operations
  async createIncomeSource(income: InsertIncomeSource): Promise<IncomeSource> {
    const [created] = await db.insert(incomeSources).values(income).returning();
    return created;
  }

  async getIncomeSourcesByUser(userId: string, assessmentYear?: string): Promise<IncomeSource[]> {
    const whereCondition = assessmentYear 
      ? and(eq(incomeSources.userId, userId), eq(incomeSources.assessmentYear, assessmentYear))
      : eq(incomeSources.userId, userId);
    
    return await db
      .select()
      .from(incomeSources)
      .where(whereCondition)
      .orderBy(desc(incomeSources.createdAt));
  }

  async updateIncomeSource(
    id: string,
    userId: string,
    updates: Partial<IncomeSource>
  ): Promise<IncomeSource | undefined> {
    const [updated] = await db
      .update(incomeSources)
      .set(updates)
      .where(and(eq(incomeSources.id, id), eq(incomeSources.userId, userId)))
      .returning();
    return updated;
  }

  async deleteIncomeSource(id: string, userId: string): Promise<boolean> {
    const result = await db
      .delete(incomeSources)
      .where(and(eq(incomeSources.id, id), eq(incomeSources.userId, userId)));
    return (result.rowCount || 0) > 0;
  }

  // Investment operations
  async createInvestment(investment: InsertInvestment): Promise<Investment> {
    const [created] = await db.insert(investments).values(investment).returning();
    return created;
  }

  async getInvestmentsByUser(userId: string, assessmentYear?: string): Promise<Investment[]> {
    const whereCondition = assessmentYear 
      ? and(eq(investments.userId, userId), eq(investments.assessmentYear, assessmentYear))
      : eq(investments.userId, userId);
    
    return await db
      .select()
      .from(investments)
      .where(whereCondition)
      .orderBy(desc(investments.createdAt));
  }

  async updateInvestment(
    id: string,
    userId: string,
    updates: Partial<Investment>
  ): Promise<Investment | undefined> {
    const [updated] = await db
      .update(investments)
      .set(updates)
      .where(and(eq(investments.id, id), eq(investments.userId, userId)))
      .returning();
    return updated;
  }

  async deleteInvestment(id: string, userId: string): Promise<boolean> {
    const result = await db
      .delete(investments)
      .where(and(eq(investments.id, id), eq(investments.userId, userId)));
    return (result.rowCount || 0) > 0;
  }

  // Tax calculation operations
  async createTaxCalculation(calculation: InsertTaxCalculation): Promise<TaxCalculation> {
    const [created] = await db.insert(taxCalculations).values(calculation).returning();
    return created;
  }

  async getTaxCalculationsByUser(userId: string): Promise<TaxCalculation[]> {
    return await db
      .select()
      .from(taxCalculations)
      .where(eq(taxCalculations.userId, userId))
      .orderBy(desc(taxCalculations.calculatedAt));
  }

  async getTaxCalculation(userId: string, assessmentYear: string): Promise<TaxCalculation | undefined> {
    const [calculation] = await db
      .select()
      .from(taxCalculations)
      .where(
        and(
          eq(taxCalculations.userId, userId),
          eq(taxCalculations.assessmentYear, assessmentYear)
        )
      )
      .orderBy(desc(taxCalculations.calculatedAt))
      .limit(1);
    return calculation;
  }

  // Tax suggestion operations
  async createTaxSuggestion(suggestion: InsertTaxSuggestion): Promise<TaxSuggestion> {
    const [created] = await db.insert(taxSuggestions).values(suggestion).returning();
    return created;
  }

  async getTaxSuggestionsByUser(userId: string, assessmentYear?: string): Promise<TaxSuggestion[]> {
    const whereCondition = assessmentYear 
      ? and(eq(taxSuggestions.userId, userId), eq(taxSuggestions.assessmentYear, assessmentYear))
      : eq(taxSuggestions.userId, userId);
    
    return await db
      .select()
      .from(taxSuggestions)
      .where(whereCondition)
      .orderBy(desc(taxSuggestions.createdAt));
  }

  async updateTaxSuggestion(
    id: string,
    userId: string,
    updates: Partial<TaxSuggestion>
  ): Promise<TaxSuggestion | undefined> {
    const [updated] = await db
      .update(taxSuggestions)
      .set(updates)
      .where(and(eq(taxSuggestions.id, id), eq(taxSuggestions.userId, userId)))
      .returning();
    return updated;
  }
}

export const storage = new DatabaseStorage();
