-- Ensure the Xrule tenant exists (initial setup only)
INSERT INTO "Tenant" ("name")
VALUES ('Xrule')
ON CONFLICT ("name") DO NOTHING;
