import { z } from "zod";
import { NIGERIAN_STATES } from "@/lib/brand";

export const PASSWORD_RULES = [
  { id: "length", label: "At least 10 characters", test: (v: string) => v.length >= 10 },
  { id: "upper", label: "An uppercase letter", test: (v: string) => /[A-Z]/.test(v) },
  { id: "lower", label: "A lowercase letter", test: (v: string) => /[a-z]/.test(v) },
  { id: "number", label: "A number", test: (v: string) => /\d/.test(v) },
  { id: "symbol", label: "A special symbol", test: (v: string) => /[^A-Za-z0-9]/.test(v) },
] as const;

export function passwordIssues(v: string) {
  return PASSWORD_RULES.filter((r) => !r.test(v)).map((r) => r.label);
}

/** 0–4 score for the strength meter. */
export function passwordScore(v: string) {
  const passed = PASSWORD_RULES.filter((r) => r.test(v)).length;
  let score = Math.max(0, passed - 1);
  if (passed === PASSWORD_RULES.length && v.length >= 14) score = 4;
  return Math.min(score, 4);
}

export const passwordSchema = z
  .string()
  .max(128, "Password is too long")
  .superRefine((v, ctx) => {
    const issues = passwordIssues(v);
    if (issues.length) ctx.addIssue({ code: "custom", message: `Password needs: ${issues.join(", ").toLowerCase()}` });
  });

const phone = z
  .string()
  .trim()
  .regex(/^\+?[0-9 ()-]{10,18}$/, "Enter a valid phone number");

const name = (label: string) => z.string().trim().min(2, `${label} is required`).max(60);

export const registerSchema = z
  .object({
    surname: name("Surname"),
    firstName: name("First name"),
    middleName: z.string().trim().max(60).optional().or(z.literal("")),
    email: z.string().trim().toLowerCase().email("Enter a valid email address"),
    phone,
    whatsapp: phone.optional().or(z.literal("")),
    address: z.string().trim().min(8, "Enter your full address").max(300),
    state: z.enum(NIGERIAN_STATES, { message: "Select your state" }),
    city: z.string().trim().min(2, "Enter your city").max(80),
    password: passwordSchema,
    confirmPassword: z.string(),
    acceptTerms: z.literal(true, { message: "You must accept the terms and conditions" }),
  })
  .refine((d) => d.password === d.confirmPassword, { path: ["confirmPassword"], message: "Passwords do not match" });

export type RegisterInput = z.infer<typeof registerSchema>;

export const staffRegisterSchema = z
  .object({
    surname: name("Surname"),
    firstName: name("First name"),
    email: z.string().trim().toLowerCase().email("Enter a valid email address"),
    phone,
    department: z.string().trim().min(2).max(60),
    position: z.string().trim().min(2).max(60),
    requestedRole: z.string().trim().max(60).optional(),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, { path: ["confirmPassword"], message: "Passwords do not match" });

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
});

export const resetPasswordSchema = z
  .object({ token: z.string().min(10), password: passwordSchema, confirmPassword: z.string() })
  .refine((d) => d.password === d.confirmPassword, { path: ["confirmPassword"], message: "Passwords do not match" });
