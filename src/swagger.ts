import swaggerJsdoc from "swagger-jsdoc";

const idParameter = [
  { name: "id", in: "path", required: true, schema: { type: "string" } },
];

const entitySchema = {
  type: "object",
  additionalProperties: true,
  properties: {
    id: { type: "string", example: "JOB-101" },
    createdAt: { type: "string", format: "date-time" },
    updatedAt: { type: "string", format: "date-time" },
  },
};

const listResponse = {
  type: "object",
  properties: {
    data: { type: "array", items: entitySchema },
    meta: {
      type: "object",
      properties: {
        total: { type: "integer" },
        page: { type: "integer" },
        limit: { type: "integer" },
      },
    },
  },
};

const singleResponse = {
  type: "object",
  properties: { data: entitySchema },
};

const errorResponse = {
  description: "Request failed",
  content: {
    "application/json": {
      schema: {
        type: "object",
        properties: { error: { type: "string" } },
      },
    },
  },
};

function simpleGet(tag: string, summary: string) {
  return {
    get: {
      tags: [tag],
      summary,
      responses: { "200": { description: "Success" } },
    },
  };
}

function actionOperation(tag: string, summary: string) {
  return {
    tags: [tag],
    summary,
    parameters: idParameter,
    responses: { "200": { description: "Success" }, "404": errorResponse },
  };
}

function booleanOperation(tag: string, field: string) {
  return {
    tags: [tag],
    summary: `Update ${field}`,
    parameters: idParameter,
    requestBody: {
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: { [field]: { type: "boolean" } },
          },
        },
      },
    },
    responses: { "200": { description: "Updated" }, "404": errorResponse },
  };
}

function statusOperation(tag: string, allowed: string[]) {
  return {
    tags: [tag],
    summary: "Update status",
    parameters: idParameter,
    requestBody: {
      required: true,
      content: {
        "application/json": {
          schema: {
            type: "object",
            required: ["status"],
            properties: { status: { type: "string", enum: allowed } },
          },
        },
      },
    },
    responses: {
      "200": { description: "Updated" },
      "400": errorResponse,
      "404": errorResponse,
    },
  };
}

function crudPaths(base: string, tag: string) {
  return {
    [base]: {
      get: {
        tags: [tag],
        summary: `List ${tag.toLowerCase()}`,
        parameters: [
          { name: "search", in: "query", schema: { type: "string" } },
          { name: "status", in: "query", schema: { type: "string" } },
          { name: "page", in: "query", schema: { type: "integer", default: 1 } },
          { name: "limit", in: "query", schema: { type: "integer", default: 50 } },
          { name: "sort", in: "query", schema: { type: "string", example: "createdAt:desc" } },
        ],
        responses: {
          "200": {
            description: "List returned",
            content: { "application/json": { schema: listResponse } },
          },
        },
      },
      post: {
        tags: [tag],
        summary: `Create ${tag.slice(0, -1)}`,
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { type: "object", additionalProperties: true },
            },
          },
        },
        responses: {
          "201": {
            description: "Created",
            content: { "application/json": { schema: singleResponse } },
          },
          "400": errorResponse,
        },
      },
    },
    [`${base}/{id}`]: {
      get: {
        tags: [tag],
        summary: `Get ${tag.slice(0, -1)} by ID`,
        parameters: idParameter,
        responses: {
          "200": {
            description: "Found",
            content: { "application/json": { schema: singleResponse } },
          },
          "404": errorResponse,
        },
      },
      put: {
        tags: [tag],
        summary: `Replace ${tag.slice(0, -1)}`,
        parameters: idParameter,
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { type: "object", additionalProperties: true },
            },
          },
        },
        responses: {
          "200": { description: "Updated" },
          "400": errorResponse,
          "404": errorResponse,
        },
      },
      patch: {
        tags: [tag],
        summary: `Partially update ${tag.slice(0, -1)}`,
        parameters: idParameter,
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { type: "object", additionalProperties: true },
            },
          },
        },
        responses: {
          "200": { description: "Updated" },
          "404": errorResponse,
        },
      },
      delete: {
        tags: [tag],
        summary: `Delete ${tag.slice(0, -1)}`,
        parameters: idParameter,
        responses: {
          "200": { description: "Deleted" },
          "404": errorResponse,
        },
      },
    },
  };
}

const settingsRequest = {
  type: "object",
  properties: {
    siteName: { type: "string", example: "SolarNaukri" },
    contactEmail: { type: "string", format: "email" },
    emailAlerts: { type: "boolean" },
    autoApproveVerified: { type: "boolean" },
    weeklyDigest: { type: "boolean" },
  },
};

const paths: Record<string, any> = {
  "/health": simpleGet("Health", "Health check"),
  ...crudPaths("/api/admin/jobs", "Jobs"),
  ...crudPaths("/api/admin/candidates", "Candidates"),
  ...crudPaths("/api/admin/job-seekers", "Employeess"),
  ...crudPaths("/api/admin/employers", "Employers"),
  ...crudPaths("/api/admin/Employers", "Employers"),
  ...crudPaths("/api/admin/companies", "Companies"),
  ...crudPaths("/api/admin/categories", "Categories"),
  ...crudPaths("/api/admin/ambassadors", "Ambassadors"),
  ...crudPaths("/api/admin/applications", "Applications"),
  ...crudPaths("/api/admin/activities", "Activities"),

  "/api/admin/jobs/{id}/status": {
    patch: statusOperation("Jobs", ["Pending", "Active", "Closed"]),
  },
  "/api/admin/jobs/{id}/featured": {
    patch: {
      tags: ["Jobs"],
      summary: "Update featured job",
      parameters: idParameter,
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: { featured: { type: "boolean" } },
            },
          },
        },
      },
      responses: { "200": { description: "Updated" }, "404": errorResponse },
    },
  },
  "/api/admin/candidates/{id}/verify": {
    patch: booleanOperation("Candidates", "verified"),
  },
  "/api/admin/candidates/{id}/status": {
    patch: statusOperation("Candidates", ["Active", "Suspended"]),
  },
  "/api/admin/employers/{id}/verify": {
    patch: booleanOperation("Employers", "verified"),
  },
  "/api/admin/employers/{id}/status": {
    patch: statusOperation("Employers", ["Approved", "Pending Verification", "Suspended"]),
  },
  "/api/admin/companies/{id}/verify": {
    patch: booleanOperation("Companies", "verified"),
  },
  "/api/admin/companies/{id}/status": {
    patch: statusOperation("Companies", ["Active", "Pending", "Suspended"]),
  },
  "/api/admin/categories/{id}/status": {
    patch: statusOperation("Categories", ["Active", "Inactive"]),
  },
  "/api/admin/ambassadors/{id}/status": {
    patch: statusOperation("Ambassadors", ["Active", "Pending", "Suspended"]),
  },
  "/api/admin/applications/{id}/status": {
    patch: statusOperation("Applications", ["Applied", "Screening", "Interview", "Offer", "Joined", "Rejected"]),
  },

  "/api/admin/dashboard/summary": simpleGet("Dashboard", "Dashboard summary"),
  "/api/admin/dashboard/snapshot": simpleGet("Dashboard", "Platform snapshot"),
  "/api/admin/dashboard/recent-activity": simpleGet("Dashboard", "Recent admin activity"),

  "/api/admin/analytics/traffic": simpleGet("Analytics", "Traffic overview"),
  "/api/admin/analytics/pages": simpleGet("Analytics", "Pages analytics"),
  "/api/admin/analytics/sources": simpleGet("Analytics", "Traffic sources"),
  "/api/admin/analytics/devices": simpleGet("Analytics", "Device analytics"),
  "/api/admin/analytics/visitors": simpleGet("Analytics", "Visitor activity"),

  "/api/admin/verification/companies": simpleGet("Verification", "Pending company verification"),
  "/api/admin/verification/companies/{id}/approve": {
    patch: actionOperation("Verification", "Approve company verification"),
  },
  "/api/admin/verification/companies/{id}/reject": {
    patch: {
      ...actionOperation("Verification", "Reject company verification"),
      requestBody: {
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: { reason: { type: "string" } },
            },
          },
        },
      },
    },
  },

  "/api/admin/settings": {
    get: {
      tags: ["Settings"],
      summary: "Get platform settings",
      responses: { "200": { description: "Settings returned" } },
    },
    put: {
      tags: ["Settings"],
      summary: "Replace platform settings",
      requestBody: {
        required: true,
        content: { "application/json": { schema: settingsRequest } },
      },
      responses: { "200": { description: "Settings updated" } },
    },
    patch: {
      tags: ["Settings"],
      summary: "Partially update platform settings",
      requestBody: {
        required: true,
        content: { "application/json": { schema: settingsRequest } },
      },
      responses: { "200": { description: "Settings updated" } },
    },
  },
};

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: "3.0.3",
    info: {
      title: "SolarNaukri Admin Backend API",
      version: "2.1.0",
      description:
        "Complete admin API for SolarNaukri jobs, talent, employers, companies, categories, ambassadors, applications, analytics, settings and verification.",
    },
    servers: [
      { url: "http://localhost:5000", description: "Local development server" },
    ],
    tags: [
      "Health",
      "Dashboard",
      "Jobs",
      "Candidates",
      "Employeess",
      "Employers",
      "Employers",
      "Companies",
      "Categories",
      "Ambassadors",
      "Applications",
      "Activities",
      "Analytics",
      "Verification",
      "Settings",
    ].map((name) => ({ name })),
    paths,
  },
  apis: [],
};

export const swaggerSpec = swaggerJsdoc(options);
