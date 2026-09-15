import swaggerJsdoc from "swagger-jsdoc";

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: "3.0.3",

    info: {
      title: "SolarNaukri Admin Backend API",
      version: "1.0.0",
      description:
        "API documentation for SolarNaukri admin backend including employers, candidates, jobs and activity APIs.",
    },

    servers: [
      {
        url: "http://localhost:5000",
        description: "Local development server",
      },
    ],

    tags: [
      {
        name: "Health",
        description: "Server health APIs",
      },
      {
        name: "Employers",
        description: "Employer administration APIs",
      },
      {
        name: "Candidates",
        description: "Candidate administration APIs",
      },
      {
        name: "Jobs",
        description: "Job administration APIs",
      },
      {
        name: "Activities",
        description: "Admin activity APIs",
      },
    ],

    components: {
      schemas: {
        Employer: {
          type: "object",
          properties: {
            id: {
              type: "string",
              example: "EMP-301",
            },
            companyName: {
              type: "string",
              example: "GreenRay Enterprises",
            },
            contactPerson: {
              type: "string",
              example: "Rajesh Kumar",
            },
            email: {
              type: "string",
              example: "rajesh@greenray.in",
            },
            location: {
              type: "string",
              example: "Jaipur, Rajasthan",
            },
            jobsPosted: {
              type: "integer",
              example: 12,
            },
            verified: {
              type: "boolean",
              example: true,
            },
            joinedDate: {
              type: "string",
              example: "2026-06-10",
            },
            status: {
              type: "string",
              example: "Approved",
            },
          },
        },

        Candidate: {
          type: "object",
          properties: {
            id: {
              type: "string",
              example: "CAN-201",
            },
            name: {
              type: "string",
              example: "Priya Sharma",
            },
            email: {
              type: "string",
              example: "priya.sharma@example.com",
            },
            phone: {
              type: "string",
              example: "+91 98765 43210",
            },
            role: {
              type: "string",
              example: "Solar Design Engineer",
            },
            location: {
              type: "string",
              example: "Ahmedabad, Gujarat",
            },
            experience: {
              type: "string",
              example: "6 years",
            },
            verified: {
              type: "boolean",
              example: true,
            },
            joinedDate: {
              type: "string",
              example: "2026-08-14",
            },
            skills: {
              type: "array",
              items: {
                type: "string",
              },
              example: ["PVsyst", "AutoCAD", "HelioScope"],
            },
            profileCompletion: {
              type: "integer",
              example: 96,
            },
            resumeStrength: {
              type: "integer",
              example: 91,
            },
            talentPassportScore: {
              type: "integer",
              example: 88,
            },
            accountStatus: {
              type: "string",
              example: "Active",
            },
            applicationsCount: {
              type: "integer",
              example: 12,
            },
            savedJobsCount: {
              type: "integer",
              example: 8,
            },
            profileViews: {
              type: "integer",
              example: 34,
            },
          },
        },

        Job: {
          type: "object",
          properties: {
            id: {
              type: "string",
              example: "JOB-101",
            },
            role: {
              type: "string",
              example: "Solar Design Engineer",
            },
            company: {
              type: "string",
              example: "GreenRay Enterprises",
            },
            location: {
              type: "string",
              example: "Jaipur, Rajasthan",
            },
            type: {
              type: "string",
              example: "Full Time",
            },
            salary: {
              type: "string",
              example: "₹6 - 9 LPA",
            },
            postedDate: {
              type: "string",
              example: "2026-09-06",
            },
            applications: {
              type: "integer",
              example: 34,
            },
            status: {
              type: "string",
              example: "Active",
            },
            featured: {
              type: "boolean",
              example: true,
            },
          },
        },

        Activity: {
          type: "object",
          properties: {
            id: {
              type: "string",
              example: "ACT-1",
            },
            type: {
              type: "string",
              example: "employer",
            },
            title: {
              type: "string",
              example: "New employer registered",
            },
            description: {
              type: "string",
              example:
                "SunPeak Energy submitted company verification documents",
            },
            time: {
              type: "string",
              example: "12 min ago",
            },
          },
        },

        Error: {
          type: "object",
          properties: {
            error: {
              type: "string",
            },
          },
        },
      },
    },

    paths: {
      "/health": {
        get: {
          tags: ["Health"],
          summary: "Health check",
          description: "Check whether the API server is running.",

          responses: {
            "200": {
              description: "Server is healthy",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      status: {
                        type: "string",
                        example: "ok",
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },

      "/api/admin/employers": {
        get: {
          tags: ["Employers"],
          summary: "Get all employers",

          responses: {
            "200": {
              description: "Employer list",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      data: {
                        type: "array",
                        items: {
                          $ref: "#/components/schemas/Employer",
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },

      "/api/admin/employers/{id}/verify": {
        patch: {
          tags: ["Employers"],
          summary: "Verify or unverify employer",

          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: {
                type: "string",
              },
              example: "EMP-303",
            },
          ],

          responses: {
            "200": {
              description: "Employer verification status updated",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      data: {
                        $ref: "#/components/schemas/Employer",
                      },
                    },
                  },
                },
              },
            },

            "404": {
              description: "Employer not found",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/Error",
                  },
                },
              },
            },
          },
        },
      },

      "/api/admin/candidates": {
        get: {
          tags: ["Candidates"],
          summary: "Get all candidates",

          responses: {
            "200": {
              description: "Candidate list",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      data: {
                        type: "array",
                        items: {
                          $ref: "#/components/schemas/Candidate",
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },

      "/api/admin/candidates/{id}": {
        delete: {
          tags: ["Candidates"],
          summary: "Delete candidate",

          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: {
                type: "string",
              },
              example: "CAN-201",
            },
          ],

          responses: {
            "200": {
              description: "Candidate deleted successfully",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: {
                        type: "boolean",
                        example: true,
                      },
                    },
                  },
                },
              },
            },

            "404": {
              description: "Candidate not found",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/Error",
                  },
                },
              },
            },
          },
        },
      },

      "/api/admin/jobs": {
        get: {
          tags: ["Jobs"],
          summary: "Get all jobs",

          responses: {
            "200": {
              description: "Job list",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      data: {
                        type: "array",
                        items: {
                          $ref: "#/components/schemas/Job",
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },

      "/api/admin/jobs/{id}/status": {
        patch: {
          tags: ["Jobs"],
          summary: "Update job status",

          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: {
                type: "string",
              },
              example: "JOB-103",
            },
          ],

          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["status"],
                  properties: {
                    status: {
                      type: "string",
                      enum: ["Pending", "Active", "Closed"],
                      example: "Active",
                    },
                  },
                },
              },
            },
          },

          responses: {
            "200": {
              description: "Job status updated",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      data: {
                        $ref: "#/components/schemas/Job",
                      },
                    },
                  },
                },
              },
            },

            "404": {
              description: "Job not found",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/Error",
                  },
                },
              },
            },
          },
        },
      },

      "/api/admin/activities": {
        get: {
          tags: ["Activities"],
          summary: "Get recent admin activities",

          responses: {
            "200": {
              description: "Activity list",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      data: {
                        type: "array",
                        items: {
                          $ref: "#/components/schemas/Activity",
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },

  apis: [],
};

export const swaggerSpec = swaggerJsdoc(options);