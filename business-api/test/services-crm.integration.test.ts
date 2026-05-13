import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { mockUploadFile, resetTestState, restoreServiceTestEnvironment } from "./helpers/services.js";

describe("business-api CRM service flows", () => {
  beforeEach(async () => {
    await resetTestState();
  });

  afterEach(async () => {
    await restoreServiceTestEnvironment();
  });

  it("computes deal totals, generates invoice numbers, and manages task hierarchies", async () => {
    const { upsertCompanyCard } = await import("../src/services/company-card.js");
    const { createContact } = await import("../src/services/contacts.js");
    const { createDeal } = await import("../src/services/deals.js");
    const { generateSalesInvoice, updateSalesInvoice } = await import("../src/services/sales-invoices.js");
    const { createProject } = await import("../src/services/projects.js");
    const { createTask, getTask, updateTask } = await import("../src/services/tasks.js");
    const { findSimilar } = await import("../src/lib/embeddings.js");

    const company = upsertCompanyCard({
      legalName: "Northwind Robotics SL",
      displayName: "Northwind Robotics",
      taxId: "B12345678",
      address: {
        street1: "Calle de Alcala 42",
        city: "Madrid",
        postalCode: "28014",
        countryCode: "ES",
      },
      invoiceDefaults: {
        currency: "EUR",
        paymentTermsDays: 30,
        vatMode: "standard",
      },
    });

    const customer = createContact({
      type: "company",
      status: "active",
      roles: ["customer"],
      displayName: "Acme Retail GmbH",
      legalName: "Acme Retail GmbH",
      taxId: "DE123456789",
      email: "ap@acme-retail.example",
    });

    const deal = createDeal({
      customerContactId: customer.contactId,
      title: "Warehouse audit and automation proposal",
      stage: "won",
      currency: "EUR",
      expectedCloseDate: "2026-04-02",
      lineItems: [
        {
          description: "Warehouse operations audit",
          quantity: "1",
          unitPrice: "900.00",
          taxRate: "21.00",
        },
        {
          description: "Automation recommendations workshop",
          quantity: 1,
          unitPrice: "600.00",
          taxRate: "21.00",
        },
      ],
      notes: "Approved by procurement.",
    });

    expect(deal.totals).toEqual({
      net: "1500.00",
      tax: "315.00",
      gross: "1815.00",
    });

    const invoice = generateSalesInvoice({
      customerContactId: customer.contactId,
      dealId: deal.dealId,
      issueDate: "2026-04-02",
      serviceDate: "2026-03-31",
      paymentTermsDays: 30,
      invoiceNumberStrategy: "next",
    });

    expect(invoice.invoiceNumber).toBe("2026-0001");
    expect(invoice.totals.gross).toBe("1815.00");
    expect(invoice.customerDisplayName).toBe("Acme Retail GmbH");
    expect(updateSalesInvoice(invoice.salesInvoiceId, { status: "finalized" }).status).toBe("finalized");

    await new Promise((resolve) => setTimeout(resolve, 25));
    const similarInvoices = await findSimilar("sales_invoice", "Acme warehouse audit proposal", 2);
    expect(similarInvoices[0]?.entityId).toBe(invoice.salesInvoiceId);

    const project = createProject({
      ownerEntityId: company.companyId,
      ownerEntityType: "company_card",
      name: "Implementation",
      status: "active",
    });
    const task = createTask({
      projectId: project.projectId,
      title: "Prepare rollout",
      status: "open",
      priority: "medium",
    });
    createTask({
      projectId: project.projectId,
      parentTaskId: task.taskId,
      title: "Collect signoff",
      status: "open",
      priority: "medium",
    });

    expect(getTask(task.taskId).subtasks).toHaveLength(1);
    expect(updateTask(task.taskId, { status: "done" }).status).toBe("done");
    expect(updateTask(task.taskId, { status: "open" }).status).toBe("open");
  });

  it("creates, lists, updates, and deletes generic comments without changing entity payloads", async () => {
    const { upsertCompanyCard, getCompanyCard } = await import("../src/services/company-card.js");
    const { createComment, getComment, listComments, softDeleteComment, updateComment } = await import("../src/services/comments.js");
    const { createContact, getContact } = await import("../src/services/contacts.js");
    const { createDeal } = await import("../src/services/deals.js");
    const { uploadDocument, getDocumentMeta } = await import("../src/services/documents.js");
    const { createExpense } = await import("../src/services/expenses.js");
    const { createPayroll } = await import("../src/services/payrolls.js");
    const { createProject, getProject } = await import("../src/services/projects.js");
    const { generateSalesInvoice } = await import("../src/services/sales-invoices.js");
    const { createTask, getTask } = await import("../src/services/tasks.js");

    const company = upsertCompanyCard({
      legalName: "Northwind Robotics SL",
      displayName: "Northwind Robotics",
      taxId: "B12345678",
      address: {
        street1: "Calle de Alcala 42",
        city: "Madrid",
        postalCode: "28014",
        countryCode: "ES",
      },
      invoiceDefaults: {
        currency: "EUR",
        paymentTermsDays: 30,
        vatMode: "standard",
      },
    });

    const supplier = createContact({
      type: "company",
      status: "active",
      roles: ["supplier"],
      displayName: "Papeleria Centro SL",
      legalName: "Papeleria Centro SL",
      email: "orders@papeleria.example",
    });

    const employee = createContact({
      type: "person",
      status: "active",
      parentContactId: supplier.contactId,
      roles: ["employee"],
      displayName: "Lucia Perez",
      email: "lucia@papeleria.example",
    });

    const customer = createContact({
      type: "company",
      status: "active",
      roles: ["customer"],
      displayName: "Acme Retail GmbH",
      legalName: "Acme Retail GmbH",
      taxId: "DE123456789",
      email: "ap@acme-retail.example",
    });

    const document = uploadDocument(
      mockUploadFile("invoice.pdf", "application/pdf", "pdf-data", 8),
      {
        kind: "expense_invoice",
        source: "email_forward",
      },
    );

    const expense = createExpense({
      supplierContactId: supplier.contactId,
      documentId: document.documentId,
      invoiceNumber: "FC-2026-0042",
      invoiceDate: "2026-03-25",
      dueDate: "2026-04-24",
      currency: "EUR",
      totals: {
        net: "120.00",
        tax: "25.20",
        gross: "145.20",
      },
      category: "office_supplies",
      status: "recorded",
    });

    const payroll = createPayroll({
      employeeContactId: employee.contactId,
      periodStart: "2026-03-01",
      periodEnd: "2026-03-31",
      paymentDate: "2026-03-31",
      countryCode: "ES",
      currency: "EUR",
      grossSalary: "3000.00",
      netSalary: "2310.00",
      employeeTaxWithheld: "390.00",
      employeeSocialContributions: "180.00",
      employerSocialContributions: "900.00",
      otherDeductions: "120.00",
      otherEarnings: "0.00",
      rawLines: [],
      notes: "March payroll",
      status: "recorded",
    });

    const deal = createDeal({
      customerContactId: customer.contactId,
      title: "Warehouse audit and automation proposal",
      stage: "won",
      currency: "EUR",
      expectedCloseDate: "2026-04-02",
      lineItems: [
        {
          description: "Warehouse operations audit",
          quantity: "1",
          unitPrice: "900.00",
          taxRate: "21.00",
        },
      ],
      notes: "Approved by procurement.",
    });

    const salesInvoice = generateSalesInvoice({
      customerContactId: customer.contactId,
      dealId: deal.dealId,
      issueDate: "2026-04-02",
      paymentTermsDays: 30,
      invoiceNumberStrategy: "next",
    });

    const project = createProject({
      ownerEntityId: company.companyId,
      ownerEntityType: "company_card",
      name: "Implementation",
      status: "active",
    });

    const task = createTask({
      projectId: project.projectId,
      title: "Prepare rollout",
      status: "open",
      priority: "medium",
    });

    const representativeComment = createComment({
      commentableType: "task",
      commentableSlug: task.slug,
      body: "Customer asked to delay by one week.",
      authorName: "Hub developer",
      authorContactSlug: customer.slug,
    });

    expect(representativeComment.commentableId).toBe(task.taskId);
    expect(representativeComment.commentableSlug).toBe(task.slug);
    expect(representativeComment.authorContactId).toBe(customer.contactId);
    expect(getComment(representativeComment.slug).commentId).toBe(representativeComment.commentId);

    const createdPerType = [
      createComment({
        commentableType: "company_card",
        commentableId: company.companyId,
        body: "Owned company profile reviewed.",
        authorName: "Ops lead",
      }),
      createComment({
        commentableType: "contact",
        commentableSlug: customer.slug,
        body: "Key customer stakeholder confirmed.",
        authorName: "Sales agent",
      }),
      createComment({
        commentableType: "document",
        commentableId: document.documentId,
        body: "OCR looked clean on first pass.",
        authorName: "Doc bot",
      }),
      createComment({
        commentableType: "expense",
        commentableSlug: expense.slug,
        body: "Need supplier clarification on VAT line.",
        authorName: "Accounting agent",
      }),
      createComment({
        commentableType: "payroll",
        commentableId: payroll.payrollId,
        body: "Employee confirmed receipt.",
        authorName: "Payroll bot",
      }),
      createComment({
        commentableType: "deal",
        commentableSlug: deal.slug,
        body: "Procurement approved the proposal.",
        authorName: "Sales agent",
      }),
      createComment({
        commentableType: "sales_invoice",
        commentableId: salesInvoice.salesInvoiceId,
        body: "Invoice ready for sending.",
        authorName: "Billing agent",
      }),
      createComment({
        commentableType: "project",
        commentableSlug: project.slug,
        body: "Implementation kickoff booked.",
        authorName: "PM bot",
      }),
    ];

    expect(createdPerType).toHaveLength(8);
    expect(listComments({ commentableType: "task", commentableSlug: task.slug })).toEqual([
      expect.objectContaining({ commentId: representativeComment.commentId }),
    ]);
    expect(listComments({ authorContactId: customer.contactId })).toEqual([
      expect.objectContaining({ commentId: representativeComment.commentId }),
    ]);

    const updated = updateComment(representativeComment.commentId, {
      body: "Customer asked to delay by two weeks.",
      authorName: "Hub developer agent",
      authorContactId: null,
    });
    expect(updated.body).toBe("Customer asked to delay by two weeks.");
    expect(updated.authorName).toBe("Hub developer agent");
    expect(updated.authorContactId).toBeNull();

    softDeleteComment(representativeComment.commentId);
    expect(listComments({ commentableType: "task", commentableId: task.taskId })).toEqual([]);

    expect(getTask(task.taskId)).not.toHaveProperty("comments");
    expect(getContact(customer.contactId)).not.toHaveProperty("comments");
    expect(getDocumentMeta(document.documentId)).not.toHaveProperty("comments");
    expect(getProject(project.projectId)).not.toHaveProperty("comments");
    expect(getCompanyCard()).not.toHaveProperty("comments");

    expect(() => listComments({ commentableId: task.taskId })).toThrow(/commentableType is required/i);
    expect(() =>
      createComment({
        commentableType: "task",
        commentableId: "task_missing",
        body: "Missing task target.",
        authorName: "Hub developer",
      }),
    ).toThrow(/Task not found/i);
    expect(() =>
      createComment({
        commentableType: "task",
        commentableId: task.taskId,
        body: "Invalid author contact.",
        authorName: "Hub developer",
        authorContactSlug: "missing-contact",
      }),
    ).toThrow(/Contact not found/i);
    expect(() =>
      createComment({
        commentableType: "unknown" as never,
        commentableId: task.taskId,
        body: "Unsupported type.",
        authorName: "Hub developer",
      }),
    ).toThrow(/Unsupported commentable type/i);
  });
});
