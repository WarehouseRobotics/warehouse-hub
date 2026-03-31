import { Router } from "express";

import { validateBody } from "../middleware/validate.js";
import { contactInputSchema, contactPatchSchema } from "../schemas/contact.js";
import {
  createContact,
  getContact,
  listContacts,
  softDeleteContact,
  updateContact,
} from "../services/contacts.js";

export const contactsRouter = Router();

contactsRouter.get("/", (request, response) => {
  response.json(
    listContacts({
      query: typeof request.query.query === "string" ? request.query.query : undefined,
      role: typeof request.query.role === "string" ? request.query.role : undefined,
      type: typeof request.query.type === "string" ? request.query.type : undefined,
      parentContactId:
        typeof request.query.parentContactId === "string" ? request.query.parentContactId : undefined,
    }),
  );
});

contactsRouter.post("/", validateBody(contactInputSchema), (request, response) => {
  response.status(201).json(createContact(request.body));
});

contactsRouter.get("/:id", (request, response) => {
  const id = Array.isArray(request.params.id) ? request.params.id[0] : request.params.id;
  response.json(getContact(id));
});

contactsRouter.patch("/:id", validateBody(contactPatchSchema), (request, response) => {
  const id = Array.isArray(request.params.id) ? request.params.id[0] : request.params.id;
  response.json(updateContact(id, request.body));
});

contactsRouter.delete("/:id", (request, response) => {
  const id = Array.isArray(request.params.id) ? request.params.id[0] : request.params.id;
  softDeleteContact(id);
  response.status(204).send();
});
