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
  bestseller?: boolean;
  note?: string;
  ctaLabel: string;
  ctaHref: string;
};

const plans: PricingPlan[] = [
  {
    id: "free",
    name: "Free Job Listing",
    tagline: "Launch Offer for Employers",
    priceLabel: "₹0",
    billingLabel: "Launch Offer",
    jobAllowance: "2 FREE job posts",
    jobLiveDays: 5,
    features: [
      "2 FREE job posts",
      "Each job stays live for 5 days",
      "10 FREE resume accesses",
      "Company profile",
      "Complimentary launch offer",
      "After 10 resumes: ₹299 per resume"
    ],
    ctaLabel: "Avail Complimentary Offer",
    ctaHref: "/signup/Employer?plan=free",
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
      "Employer dashboard",
    ],
    ctaLabel: "Post One Job",
    ctaHref: "/checkout?plan=single-job",
  },
  {
    id: "starter",
    name: "Starter",
    tagline: "For small hiring teams",
    priceLabel: "₹1,499",
    billingLabel: "/ month",
    jobAllowance: "3 job posts",
    jobLiveDays: 30,
    features: [
      "3 job posts",
      "Every job stays live for 30 days",
      "Company profile",
      "Applicants & Employer dashboard",
    ],
    recommended: true,
    ctaLabel: "Choose Starter",
    ctaHref: "/checkout?plan=starter",
  },
  {
    id: "growth",
    name: "Growth",
    tagline: "For teams hiring regularly",
    priceLabel: "₹2,999",
    billingLabel: "/ month",
    jobAllowance: "7 job posts",
    jobLiveDays: 30,
    features: [
      "7 job posts",
      "Every job stays live for 30 days",
      "Company branding",
      "Applicants & Employer dashboard",
    ],
    recommended: false,
    ctaLabel: "Choose Growth",
    ctaHref: "/checkout?plan=growth",
  },
  {
    id: "pro",
    name: "Pro",
    tagline: "For advanced talent sourcing",
    priceLabel: "₹9,999",
    billingLabel: "/ 3 months",
    jobAllowance: "7 job postings",
    jobLiveDays: 30,
    features: [
      "7 job postings",
      "Every job stays live for 30 days",
      "Talent database search",
      "Company branding",
      "250 top CVs across 7 job postings",
      "10 Talent Passports"
    ],
    bestseller: true,
    ctaLabel: "Choose Pro",
    ctaHref: "/checkout?plan=pro",
  },
  {
    id: "pro-plus",
    name: "Pro Plus",
    tagline: "For high-volume talent sourcing",
    priceLabel: "₹29,999",
    billingLabel: "/ 6 months",
    jobAllowance: "10 job postings",
    jobLiveDays: 30,
    features: [
      "10 job postings",
      "Every job stays live for 30 days",
      "100 resume reviews per month",
      "500 total resume reviews for 6 months",
      "Talent database search",
      "Company branding",
      "Employer dashboard",
      "50 Talent Passports"
    ],
    ctaLabel: "Choose Pro Plus",
    ctaHref: "/checkout?plan=pro-plus",
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
      "Multiple Employer accounts",
      "Dedicated hiring support"
    ],
    ctaLabel: "Speak To Our Customer Care Executive",
    ctaHref: "https://wa.me/919983807331",
  },
];

router.get("/", (_req, res) => {
  res.json({
    data: plans,
    meta: {
      currency: "INR",
      country: "IN",
      jobLiveDays: 30,
      updatedAt: "2026-09-17",
    },
  });
});

export default router;
