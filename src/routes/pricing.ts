import { Router } from "express";

const router = Router();

export type PricingPlan = {
  id: string;
  name: string;
  tagline: string;
  priceLabel: string;
  billingLabel?: string;
  jobAllowance: string;
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
    jobAllowance: "2 job posts",
    features: [
      "2 job posts",
      "Company profile",
      "Applicants dashboard",
      "Recruiter dashboard",
    ],
    ctaLabel: "Start Free",
    ctaHref: "/signup/recruiter?plan=free",
  },
  {
    id: "single-job",
    name: "Single Job",
    tagline: "For one-off hiring",
    priceLabel: "₹499",
    billingLabel: "/ job",
    jobAllowance: "1 additional job • live 30 days",
    features: [
      "1 additional job post",
      "Job stays live for 30 days",
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
    jobAllowance: "3 active job posts",
    features: [
      "3 active job posts",
      "Company profile",
      "Applicants dashboard",
      "Recruiter dashboard",
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
    jobAllowance: "10 active job posts",
    features: [
      "10 active job posts",
      "Company branding",
      "Applicants dashboard",
      "Recruiter dashboard",
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
    jobAllowance: "10 active job posts",
    features: [
      "10 active job posts",
      "Talent database search",
      "Up to 50 resume reviews",
      "Recruiter dashboard",
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
    features: [
      "15 job postings",
      "6-month plan",
      "12-month option available",
      "Recruiter dashboard",
    ],
    note: "12-month pricing is available on request.",
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
    features: [
      "Bulk hiring",
      "Multiple recruiter accounts",
      "Company profile",
      "Recruiter dashboard",
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
      updatedAt: "2026-09-16",
    },
  });
});

export default router;
