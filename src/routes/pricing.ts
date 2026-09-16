import { Router } from "express";

const router = Router();

export type PricingPlan = {
  id: string;
  name: string;
  tagline: string;
  priceLabel: string;
  billingLabel?: string;
  jobAllowance: string;
  jobLiveDays: number;
  features: string[];
  recommended?: boolean;
  note?: string;
  ctaLabel: string;
  ctaHref: string;
};

const plans: PricingPlan[] = [
  {
    id: "free",
    name: "Free",
    tagline: "Start hiring at no cost",
    priceLabel: "₹0",
    billingLabel: "forever",
    jobAllowance: "2 FREE job posts",
    jobLiveDays: 30,
    features: [
      "2 FREE job posts",
      "Every job stays live for 30 days",
      "Company profile",
    ],
    note: "Applicants/recruiter dashboard and resume review access are not included in the Free plan.",
    ctaLabel: "Start Free",
    ctaHref: "/signup/recruiter?plan=free",
  },
  {
    id: "single-job",
    name: "Single Job",
    tagline: "For one-off hiring",
    priceLabel: "₹499",
    billingLabel: "/ job",
    jobAllowance: "1 additional job post",
    jobLiveDays: 30,
    features: [
      "1 additional job post",
      "Every job stays live for 30 days",
      "Applicants dashboard",
      "Recruiter dashboard",
    ],
    ctaLabel: "Post One Job",
    ctaHref: "/signup/recruiter?plan=single-job",
  },
  {
    id: "starter",
    name: "Starter",
    tagline: "For small hiring teams",
    priceLabel: "₹999",
    billingLabel: "/ month",
    jobAllowance: "3 job posts",
    jobLiveDays: 30,
    features: [
      "3 job posts",
      "Every job stays live for 30 days",
      "Company profile",
      "Applicants & recruiter dashboard",
    ],
    ctaLabel: "Choose Starter",
    ctaHref: "/signup/recruiter?plan=starter",
  },
  {
    id: "growth",
    name: "Growth",
    tagline: "For teams hiring regularly",
    priceLabel: "₹2,999",
    billingLabel: "/ month",
    jobAllowance: "10 job posts",
    jobLiveDays: 30,
    features: [
      "10 job posts",
      "Every job stays live for 30 days",
      "Company branding",
      "Applicants & recruiter dashboard",
    ],
    recommended: true,
    ctaLabel: "Choose Growth",
    ctaHref: "/signup/recruiter?plan=growth",
  },
  {
    id: "pro",
    name: "Pro",
    tagline: "For serious talent sourcing",
    priceLabel: "₹4,999",
    billingLabel: "/ month",
    jobAllowance: "10 job posts",
    jobLiveDays: 30,
    features: [
      "10 job posts",
      "Every job stays live for 30 days",
      "Talent database search",
      "Up to 50 resume reviews",
    ],
    ctaLabel: "Choose Pro",
    ctaHref: "/signup/recruiter?plan=pro",
  },
  {
    id: "pro-plus",
    name: "Pro Plus",
    tagline: "Longer-term hiring access",
    priceLabel: "₹21,999",
    billingLabel: "/ 6 months",
    jobAllowance: "15 job postings",
    jobLiveDays: 30,
    features: [
      "15 job postings in the 6-month plan",
      "Every job stays live for 30 days",
      "12-month option available",
      "Recruiter dashboard",
    ],
    note: "The plan lasts 6 months; each individual job post remains live for 30 days.",
    ctaLabel: "Choose Pro Plus",
    ctaHref: "/signup/recruiter?plan=pro-plus",
  },
  {
    id: "enterprise",
    name: "Enterprise",
    tagline: "For high-volume recruitment",
    priceLabel: "Custom",
    billingLabel: "",
    jobAllowance: "Bulk hiring",
    jobLiveDays: 30,
    features: [
      "Bulk hiring",
      "Every job stays live for 30 days",
      "Multiple recruiter accounts",
      "Dedicated hiring support",
    ],
    ctaLabel: "Talk to Sales",
    ctaHref: "/signup/recruiter?plan=enterprise&intent=sales",
  },
];

router.get("/", (_req, res) => {
  res.json({
    data: plans,
    meta: {
      currency: "INR",
      country: "IN",
      jobLiveDays: 30,
      updatedAt: "2026-09-16",
    },
  });
});

export default router;
