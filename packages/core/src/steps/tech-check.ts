import { z } from 'zod';
import { AI_BOTS } from '../checks/robots.js';

export const BOT_PERMISSION_SCHEMA = z.enum(['allowed', 'blocked', 'not-specified']);

export const B1FactsSchema = z.discriminatedUnion('measured', [
  z.object({
    measured: z.literal(true),
    robotsTxtPresent: z.boolean(),
    permissions: z.record(z.enum(AI_BOTS), BOT_PERMISSION_SCHEMA),
  }),
  z.object({
    measured: z.literal(false),
    notMeasuredReason: z.string(),
  }),
]);

export const B2ResultSchema = z.object({
  bot: z.enum(AI_BOTS),
  url: z.string(),
  statusCode: z.number().int(),
  blocked: z.boolean(),
});

export const B2FactsSchema = z.discriminatedUnion('measured', [
  z.object({
    measured: z.literal(true),
    results: z.array(B2ResultSchema),
    stoppedOn429: z.boolean(),
  }),
  z.object({
    measured: z.literal(false),
    notMeasuredReason: z.string(),
  }),
]);

export const B3FactsSchema = z.discriminatedUnion('measured', [
  z.object({
    measured: z.literal(true),
    url: z.string(),
    rawTextLength: z.number().int().min(0),
    renderedTextLength: z.number().int().min(0),
    contentRatio: z.number().min(0).max(1),
  }),
  z.object({
    measured: z.literal(false),
    notMeasuredReason: z.string(),
  }),
]);

export const B4PageSchema = z.object({
  url: z.string(),
  indexed: z.boolean(),
});

export const B4FactsSchema = z.discriminatedUnion('measured', [
  z.object({
    measured: z.literal(true),
    pagesChecked: z.array(B4PageSchema),
    requestsUsed: z.number().int().min(0),
  }),
  z.object({
    measured: z.literal(false),
    notMeasuredReason: z.string(),
  }),
]);

export const B5PageSchema = z.object({
  url: z.string(),
  statusCode: z.number().int(),
  canonical: z.string().nullable(),
  isRedirect: z.boolean(),
  ttfbMs: z.number().min(0),
});

export const B5FactsSchema = z.discriminatedUnion('measured', [
  z.object({
    measured: z.literal(true),
    sitemapPresent: z.boolean(),
    sitemapUrlCount: z.number().int().min(0),
    pageResults: z.array(B5PageSchema),
  }),
  z.object({
    measured: z.literal(false),
    notMeasuredReason: z.string(),
  }),
]);

export const B6FactsSchema = z.discriminatedUnion('measured', [
  z.object({
    measured: z.literal(true),
    sitemapLastmod: z.string().nullable(),
    pagesWithLastModified: z.number().int().min(0),
    stalePageCount: z.number().int().min(0),
  }),
  z.object({
    measured: z.literal(false),
    notMeasuredReason: z.string(),
  }),
]);

export const TechCheckFactsSchema = z.object({
  b1: B1FactsSchema,
  b2: B2FactsSchema,
  b3: B3FactsSchema,
  b4: B4FactsSchema,
  b5: B5FactsSchema,
  b6: B6FactsSchema,
});

export type B1Facts = z.infer<typeof B1FactsSchema>;
export type B2Result = z.infer<typeof B2ResultSchema>;
export type B2Facts = z.infer<typeof B2FactsSchema>;
export type B3Facts = z.infer<typeof B3FactsSchema>;
export type B4Page = z.infer<typeof B4PageSchema>;
export type B4Facts = z.infer<typeof B4FactsSchema>;
export type B5Page = z.infer<typeof B5PageSchema>;
export type B5Facts = z.infer<typeof B5FactsSchema>;
export type B6Facts = z.infer<typeof B6FactsSchema>;
export type TechCheckFacts = z.infer<typeof TechCheckFactsSchema>;
