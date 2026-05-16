import { Router } from "express";
import { contactInputSchema, contactPatchSchema, contactResolveInputSchema, type ContactType } from "@warehouse-hub/business-schemas";

import { validateBody } from "../middleware/validate.js";
import {
  createContact,
  getContact,
  listContacts,
  resolveContact,
  softDeleteContact,
  updateContact,
} from "../services/contacts.js";
import { requireScope } from "../middleware/auth.js";

export const contactsRouter = Router();

function parseContactType(value: unknown): ContactType | undefined {
  return value === "person" || value === "company" ? value : undefined;
}

contactsRouter.get("/", requireScope("read"), (request, response) => {
  response.json(
    listContacts({
      query: typeof request.query.query === "string" ? request.query.query : undefined,
      role: typeof request.query.role === "string" ? request.query.role : undefined,
      type: parseContactType(request.query.type),
      parentContactId:
        typeof request.query.parentContactId === "string" ? request.query.parentContactId : undefined,
    }),
  );
});

contactsRouter.post("/", requireScope("write"), validateBody(contactInputSchema), (request, response) => {
  const contact = createContact(request.body);
  response.locals.audit = {
    action: "contact.create",
    objectType: "contact",
    objectId: contact.contactId,
  };
  response.status(201).json(contact);
});

contactsRouter.post("/resolve", requireScope("write"), validateBody(contactResolveInputSchema), (request, response) => {
  const contact = resolveContact(request.body);
  response.locals.audit = {
    action: "contact.resolve",
    objectType: "contact",
    objectId: contact.contactId,
  };
  response.json(contact);
});

contactsRouter.get("/:id", requireScope("read"), (request, response) => {
  const id = Array.isArray(request.params.id) ? request.params.id[0] : request.params.id;
  response.json(getContact(id));
});

contactsRouter.patch("/:id", requireScope("write"), validateBody(contactPatchSchema), (request, response) => {
  const id = Array.isArray(request.params.id) ? request.params.id[0] : request.params.id;
  const contact = updateContact(id, request.body);
  response.locals.audit = {
    action: "contact.update",
    objectType: "contact",
    objectId: contact.contactId,
  };
  response.json(contact);
});

contactsRouter.delete("/:id", requireScope("write"), (request, response) => {
  const id = Array.isArray(request.params.id) ? request.params.id[0] : request.params.id;
  const contact = getContact(id);
  softDeleteContact(id);
  response.locals.audit = {
    action: "contact.delete",
    objectType: "contact",
    objectId: contact.contactId,
  };
  response.status(204).send();
});
