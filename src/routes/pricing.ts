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

  note: "Launch offer includes 2 complimentary job posts with 5-day validity and access to 10 resumes. After the first 10 resumes, additional resume access is chargeable at ₹299 per resume.",

  ctaLabel: "Avail Complimentary Offer",
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
      "Every job -stays live for 30 days",
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
    priceLabel: "₹1,499",
    billingLabel: "/ month",
    jobAllowance: "3 job posts",
    jobLiveDays: 30,
    features: [
      "3 job posts",
      "Every job stays live for 30 days",
      "Company profile",
      "Applicants & recruiter dashboard",
    ],
    recommended: true,
    ctaLabel: "Choose Starter",
    ctaHref: "/signup/recruiter?plan=starter",
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
      "Applicants & recruiter dashboard",
    ],
    recommended: false,
    ctaLabel: "Choose Growth",
    ctaHref: "/signup/recruiter?plan=growth",
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
      "250 CV accesses",
      "250 top CVs across 7 job postings"
    ],

    bestseller: true,

    note: "The Pro plan is valid for 3 months and includes 7 job postings with access to up to 250 CVs. Recruiters can search the talent database and receive up to 250 top CVs across the 7 job postings.",

    ctaLabel: "Choose Pro",
    ctaHref: "/signup/recruiter?plan=pro",
  },
  {
    id: "pro-plus",
    name: "Pro Plus",
    tagline: "For high-volume talent sourcing",

    priceLabel: "₹29,999",
    billingLabel: "/ 6 months",

    jobAllowance: "15 job postings",
    jobLiveDays: 30,

    features: [
      "15 job postings",
      "Every job stays live for 30 days",
      "100 resume reviews per month",
      "600 total resume reviews for 6 months",
      "Talent database search",
      "Company branding",
      "Recruiter dashboard"
    ],

    note: "The Pro Plus plan is valid for 6 months and includes 15 job postings with 100 resume reviews every month, up to 600 resume reviews in total.",

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
      updatedAt: "2026-09-16",
    },
  });
});

export default router;
