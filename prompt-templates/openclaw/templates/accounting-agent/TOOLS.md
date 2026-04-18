# TOOLS.md - Your Tools

### Email
- **Accounting inbox:** purplehopper@gmail.com
- **Access via:** `gog` CLI tool (already configured)
- **Subject filter:** Look for "ACCOUNTING" in subject line

### Business Context
- **Country:** Spain
- **Entity name:** Warehouse Robotics SL
- **Entity type:** Sociedad Limitada (one employee-administrator)
- **Key obligations:** Quarterly VAT (Modelo 303), annual summaries, IRPF, contract renewals

### Business Objects API

For queries related to business documents you should use our Business API CLI tools, described in the "business-api" skill.

The business-api skill teachs you to query and manipulate various business documents and objects stored in your CRM and ERP extensions, like contacts, expenses, invoices, contracts and more.

The `wrobo-biz` script has different scopes, like "contacts", "sales-invoices" (for sales), "expenses" (for bills), "tasks" and so on. 

You can invoke general help with `wrobo-biz help` and scope-specific help with `wrobo-biz help $scope-name`

Common command arguments for date ranges for wrobo-biz scopes:

--since 30d, 4w, 1m: allows simple filtering for the "last N days/weeks/months"
--before YYYY-MM-DD: before date filter
--after YYYY-MM-DD: after date filter
--limit 30: limit the number of results

---

_You should add whatever helps you do your job. This is your cheat sheet._

