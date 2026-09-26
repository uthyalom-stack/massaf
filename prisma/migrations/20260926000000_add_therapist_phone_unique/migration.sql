-- Non-destructive migration adding unique index on Therapist.phone column

CREATE UNIQUE INDEX IF NOT EXISTS "Therapist_phone_key" ON "Therapist"("phone");
