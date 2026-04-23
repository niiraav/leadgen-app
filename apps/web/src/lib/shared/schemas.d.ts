import { z } from 'zod';
export declare const leadStatusSchema: z.ZodEnum<["new", "contacted", "replied", "interested", "not_interested", "qualified", "proposal_sent", "converted", "closed", "lost", "archived", "out_of_office", "do_not_contact"]>;
export declare const leadSourceSchema: z.ZodEnum<["outscraper", "csv", "apollo", "manual"]>;
export declare const emailToneSchema: z.ZodEnum<["professional", "friendly", "direct"]>;
export declare const searchParamsSchema: z.ZodObject<{
    businessType: z.ZodString;
    location: z.ZodString;
    maxResults: z.ZodDefault<z.ZodNumber>;
    noWebsiteOnly: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    businessType: string;
    location: string;
    maxResults: number;
    noWebsiteOnly: boolean;
}, {
    businessType: string;
    location: string;
    maxResults?: number | undefined;
    noWebsiteOnly?: boolean | undefined;
}>;
export declare const leadCreateSchema: z.ZodObject<{
    business_name: z.ZodString;
    contact_name: z.ZodOptional<z.ZodString>;
    email: z.ZodUnion<[z.ZodOptional<z.ZodString>, z.ZodLiteral<"">]>;
    phone: z.ZodOptional<z.ZodString>;
    website_url: z.ZodUnion<[z.ZodOptional<z.ZodString>, z.ZodLiteral<"">]>;
    address: z.ZodOptional<z.ZodString>;
    city: z.ZodOptional<z.ZodString>;
    country: z.ZodDefault<z.ZodString>;
    category: z.ZodOptional<z.ZodString>;
    industry: z.ZodOptional<z.ZodString>;
    rating: z.ZodOptional<z.ZodNumber>;
    review_count: z.ZodOptional<z.ZodNumber>;
    source: z.ZodDefault<z.ZodEnum<["outscraper", "csv", "apollo", "manual"]>>;
    notes: z.ZodOptional<z.ZodString>;
    tags: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    business_name: string;
    country: string;
    source: "manual" | "outscraper" | "csv" | "apollo";
    tags: string[];
    email?: string | undefined;
    contact_name?: string | undefined;
    phone?: string | undefined;
    website_url?: string | undefined;
    address?: string | undefined;
    city?: string | undefined;
    category?: string | undefined;
    industry?: string | undefined;
    rating?: number | undefined;
    review_count?: number | undefined;
    notes?: string | undefined;
}, {
    business_name: string;
    email?: string | undefined;
    contact_name?: string | undefined;
    phone?: string | undefined;
    website_url?: string | undefined;
    address?: string | undefined;
    city?: string | undefined;
    country?: string | undefined;
    category?: string | undefined;
    industry?: string | undefined;
    rating?: number | undefined;
    review_count?: number | undefined;
    source?: "manual" | "outscraper" | "csv" | "apollo" | undefined;
    notes?: string | undefined;
    tags?: string[] | undefined;
}>;
export declare const leadUpdateSchema: z.ZodObject<{
    business_name: z.ZodOptional<z.ZodString>;
    contact_name: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    email: z.ZodOptional<z.ZodUnion<[z.ZodOptional<z.ZodString>, z.ZodLiteral<"">]>>;
    phone: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    website_url: z.ZodOptional<z.ZodUnion<[z.ZodOptional<z.ZodString>, z.ZodLiteral<"">]>>;
    address: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    city: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    country: z.ZodOptional<z.ZodDefault<z.ZodString>>;
    category: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    industry: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    rating: z.ZodOptional<z.ZodOptional<z.ZodNumber>>;
    review_count: z.ZodOptional<z.ZodOptional<z.ZodNumber>>;
    source: z.ZodOptional<z.ZodDefault<z.ZodEnum<["outscraper", "csv", "apollo", "manual"]>>>;
} & {
    status: z.ZodOptional<z.ZodEnum<["new", "contacted", "replied", "interested", "not_interested", "qualified", "proposal_sent", "converted", "closed", "lost", "archived", "out_of_office", "do_not_contact"]>>;
    notes: z.ZodOptional<z.ZodString>;
    tags: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    status?: "new" | "contacted" | "qualified" | "proposal_sent" | "converted" | "replied" | "interested" | "not_interested" | "closed" | "lost" | "archived" | "out_of_office" | "do_not_contact" | undefined;
    email?: string | undefined;
    business_name?: string | undefined;
    contact_name?: string | undefined;
    phone?: string | undefined;
    website_url?: string | undefined;
    address?: string | undefined;
    city?: string | undefined;
    country?: string | undefined;
    category?: string | undefined;
    industry?: string | undefined;
    rating?: number | undefined;
    review_count?: number | undefined;
    source?: "manual" | "outscraper" | "csv" | "apollo" | undefined;
    notes?: string | undefined;
    tags?: string[] | undefined;
}, {
    status?: "new" | "contacted" | "qualified" | "proposal_sent" | "converted" | "replied" | "interested" | "not_interested" | "closed" | "lost" | "archived" | "out_of_office" | "do_not_contact" | undefined;
    email?: string | undefined;
    business_name?: string | undefined;
    contact_name?: string | undefined;
    phone?: string | undefined;
    website_url?: string | undefined;
    address?: string | undefined;
    city?: string | undefined;
    country?: string | undefined;
    category?: string | undefined;
    industry?: string | undefined;
    rating?: number | undefined;
    review_count?: number | undefined;
    source?: "manual" | "outscraper" | "csv" | "apollo" | undefined;
    notes?: string | undefined;
    tags?: string[] | undefined;
}>;
export declare const aiEmailSchema: z.ZodObject<{
    tone: z.ZodDefault<z.ZodEnum<["professional", "friendly", "direct"]>>;
}, "strip", z.ZodTypeAny, {
    tone: "professional" | "friendly" | "direct";
}, {
    tone?: "professional" | "friendly" | "direct" | undefined;
}>;
export declare const statusChangeSchema: z.ZodObject<{
    status: z.ZodEnum<["new", "contacted", "replied", "interested", "not_interested", "qualified", "proposal_sent", "converted", "closed", "lost", "archived", "out_of_office", "do_not_contact"]>;
}, "strip", z.ZodTypeAny, {
    status: "new" | "contacted" | "qualified" | "proposal_sent" | "converted" | "replied" | "interested" | "not_interested" | "closed" | "lost" | "archived" | "out_of_office" | "do_not_contact";
}, {
    status: "new" | "contacted" | "qualified" | "proposal_sent" | "converted" | "replied" | "interested" | "not_interested" | "closed" | "lost" | "archived" | "out_of_office" | "do_not_contact";
}>;
export declare const csvImportSchema: z.ZodObject<{
    mappings: z.ZodArray<z.ZodObject<{
        csvColumn: z.ZodString;
        leadField: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        csvColumn: string;
        leadField: string;
    }, {
        csvColumn: string;
        leadField: string;
    }>, "many">;
    leads: z.ZodArray<z.ZodRecord<z.ZodString, z.ZodUnknown>, "many">;
}, "strip", z.ZodTypeAny, {
    leads: Record<string, unknown>[];
    mappings: {
        csvColumn: string;
        leadField: string;
    }[];
}, {
    leads: Record<string, unknown>[];
    mappings: {
        csvColumn: string;
        leadField: string;
    }[];
}>;
export declare const sequenceStepSchema: z.ZodObject<{
    id: z.ZodString;
    subject_template: z.ZodString;
    body_template: z.ZodString;
    delay_days: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    id: string;
    subject_template: string;
    body_template: string;
    delay_days: number;
}, {
    id: string;
    subject_template: string;
    body_template: string;
    delay_days: number;
}>;
export declare const sequenceCreateSchema: z.ZodObject<{
    name: z.ZodString;
    steps: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        subject_template: z.ZodString;
        body_template: z.ZodString;
        delay_days: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        id: string;
        subject_template: string;
        body_template: string;
        delay_days: number;
    }, {
        id: string;
        subject_template: string;
        body_template: string;
        delay_days: number;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    name: string;
    steps: {
        id: string;
        subject_template: string;
        body_template: string;
        delay_days: number;
    }[];
}, {
    name: string;
    steps: {
        id: string;
        subject_template: string;
        body_template: string;
        delay_days: number;
    }[];
}>;
export declare const sequenceEnrollSchema: z.ZodObject<{
    lead_ids: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    lead_ids: string[];
}, {
    lead_ids: string[];
}>;
export type SearchParamsInput = z.infer<typeof searchParamsSchema>;
export type LeadCreate = z.infer<typeof leadCreateSchema>;
export type LeadUpdate = z.infer<typeof leadUpdateSchema>;
export type AIEmailRequest = z.infer<typeof aiEmailSchema>;
export type StatusChange = z.infer<typeof statusChangeSchema>;
export type CSVImport = z.infer<typeof csvImportSchema>;
export type SequenceCreate = z.infer<typeof sequenceCreateSchema>;
export type SequenceEnroll = z.infer<typeof sequenceEnrollSchema>;
//# sourceMappingURL=schemas.d.ts.map