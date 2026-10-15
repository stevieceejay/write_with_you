-- PostgreSQL rules that cannot be fully expressed in the Prisma schema.
BEGIN;

CREATE UNIQUE INDEX "EssayVersion_one_working_per_essay"
  ON "EssayVersion" ("essayId") WHERE "kind" = 'WORKING';

CREATE INDEX "EssayVersion_working_text_search"
  ON "EssayVersion" USING GIN (to_tsvector('simple'::regconfig, "plainText"))
  WHERE "kind" = 'WORKING';

CREATE INDEX "Essay_title_search"
  ON "Essay" USING GIN (to_tsvector('simple'::regconfig, "title"));

ALTER TABLE "User" ADD CONSTRAINT "User_normalized_email"
  CHECK ("email" = lower(btrim("email")) AND length("email") > 0);
ALTER TABLE "Subject" ADD CONSTRAINT "Subject_normalized_name"
  CHECK ("normalizedName" = lower(btrim("name")) AND length("normalizedName") > 0);
ALTER TABLE "EssayVersion"
  ADD CONSTRAINT "EssayVersion_nonnegative_lock" CHECK ("lockVersion" >= 0),
  ADD CONSTRAINT "EssayVersion_positive_schema" CHECK ("schemaVersion" >= 1),
  ADD CONSTRAINT "EssayVersion_no_self_parent" CHECK ("parentVersionId" IS DISTINCT FROM "id"),
  ADD CONSTRAINT "EssayVersion_working_unsealed" CHECK ("kind" <> 'WORKING' OR "sealedAt" IS NULL),
  ADD CONSTRAINT "EssayVersion_document_object" CHECK (jsonb_typeof("documentJson") = 'object'),
  ADD CONSTRAINT "EssayVersion_formatting_object" CHECK (jsonb_typeof("formatting") = 'object');
ALTER TABLE "OutlineNode"
  ADD CONSTRAINT "OutlineNode_nonnegative_position" CHECK ("position" >= 0),
  ADD CONSTRAINT "OutlineNode_no_self_parent" CHECK ("parentId" IS DISTINCT FROM "id");
ALTER TABLE "Annotation"
  ADD CONSTRAINT "Annotation_nonnegative_lock" CHECK ("basedOnLockVersion" >= 0),
  ADD CONSTRAINT "Annotation_anchor_object" CHECK (jsonb_typeof("anchor") = 'object');
ALTER TABLE "IdeaRelationship" ADD CONSTRAINT "IdeaRelationship_no_self_link"
  CHECK ("fromAnnotationId" <> "toAnnotationId");
ALTER TABLE "Source"
  ADD CONSTRAINT "Source_authors_array" CHECK (jsonb_typeof("authors") = 'array'),
  ADD CONSTRAINT "Source_metadata_object" CHECK (jsonb_typeof("metadata") = 'object');
ALTER TABLE "EvidenceLink" ADD CONSTRAINT "EvidenceLink_citation_object"
  CHECK (jsonb_typeof("citationSnapshot") = 'object');
ALTER TABLE "AIRequest"
  ADD CONSTRAINT "AIRequest_nonnegative_input" CHECK ("inputTokens" IS NULL OR "inputTokens" >= 0),
  ADD CONSTRAINT "AIRequest_nonnegative_output" CHECK ("outputTokens" IS NULL OR "outputTokens" >= 0),
  ADD CONSTRAINT "AIRequest_nonnegative_lock" CHECK ("basedOnLockVersion" IS NULL OR "basedOnLockVersion" >= 0);
ALTER TABLE "AIProposal" ADD CONSTRAINT "AIProposal_nonnegative_lock"
  CHECK ("basedOnLockVersion" >= 0);

-- Lock the version before editing its children, serializing edits with sealing.
-- Missing parents are allowed here only to let FK checks/cascaded deletes finish.
CREATE FUNCTION wwy_assert_version_editable(target_id uuid) RETURNS void
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE sealed timestamptz;
BEGIN
  SELECT "sealedAt" INTO sealed FROM public."EssayVersion"
  WHERE "id" = target_id FOR UPDATE;
  IF FOUND AND sealed IS NOT NULL THEN
    RAISE EXCEPTION 'Saved snapshots are immutable; copy into a working version first'
      USING ERRCODE = '23514';
  END IF;
END;
$$;

CREATE FUNCTION wwy_guard_version() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE parent_kind public."VersionKind"; parent_sealed timestamptz;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."sealedAt" IS NOT NULL AND EXISTS (
      SELECT 1 FROM public."Essay" WHERE "id" = OLD."essayId"
    ) THEN
      RAISE EXCEPTION 'Cannot delete a saved snapshot independently of its essay'
        USING ERRCODE = '23514';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD."sealedAt" IS NOT NULL THEN
      RAISE EXCEPTION 'Saved snapshots are immutable' USING ERRCODE = '23514';
    END IF;
    IF NEW."id" <> OLD."id" OR NEW."essayId" <> OLD."essayId" OR NEW."kind" <> OLD."kind" THEN
      RAISE EXCEPTION 'Version identity, essay, and kind cannot change' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF NEW."parentVersionId" IS NOT NULL THEN
    SELECT "kind", "sealedAt" INTO parent_kind, parent_sealed
    FROM public."EssayVersion"
    WHERE "id" = NEW."parentVersionId" AND "essayId" = NEW."essayId";
    IF FOUND AND (parent_kind <> 'SNAPSHOT' OR parent_sealed IS NULL) THEN
      RAISE EXCEPTION 'A version parent must be a sealed snapshot'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "wwy_guard_version"
BEFORE INSERT OR UPDATE OR DELETE ON "EssayVersion"
FOR EACH ROW EXECUTE FUNCTION wwy_guard_version();

-- Snapshot assembly is atomic: create, copy child rows, then seal before commit.
CREATE FUNCTION wwy_require_sealed_snapshot() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public."EssayVersion"
    WHERE "id" = NEW."id" AND "kind" = 'SNAPSHOT' AND "sealedAt" IS NULL
  ) THEN
    RAISE EXCEPTION 'A snapshot must be sealed before transaction commit'
      USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "wwy_snapshot_must_be_sealed"
AFTER INSERT OR UPDATE ON "EssayVersion"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION wwy_require_sealed_snapshot();

CREATE FUNCTION wwy_guard_version_child() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE row_data jsonb; target_id uuid;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    row_data := to_jsonb(OLD);
    IF TG_ARGV[0] = 'sessionId' THEN
      SELECT "versionId" INTO target_id FROM public."PlanningSession"
      WHERE "id" = (row_data ->> 'sessionId')::uuid;
    ELSE
      target_id := (row_data ->> 'versionId')::uuid;
    END IF;
    PERFORM public.wwy_assert_version_editable(target_id);
  END IF;
  IF TG_OP <> 'DELETE' THEN
    row_data := to_jsonb(NEW);
    IF TG_ARGV[0] = 'sessionId' THEN
      SELECT "versionId" INTO target_id FROM public."PlanningSession"
      WHERE "id" = (row_data ->> 'sessionId')::uuid;
    ELSE
      target_id := (row_data ->> 'versionId')::uuid;
    END IF;
    PERFORM public.wwy_assert_version_editable(target_id);
    RETURN NEW;
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER "a_wwy_guard_outline" BEFORE INSERT OR UPDATE OR DELETE ON "OutlineNode"
  FOR EACH ROW EXECUTE FUNCTION wwy_guard_version_child('versionId');
CREATE TRIGGER "wwy_guard_annotation" BEFORE INSERT OR UPDATE OR DELETE ON "Annotation"
  FOR EACH ROW EXECUTE FUNCTION wwy_guard_version_child('versionId');
CREATE TRIGGER "wwy_guard_relationship" BEFORE INSERT OR UPDATE OR DELETE ON "IdeaRelationship"
  FOR EACH ROW EXECUTE FUNCTION wwy_guard_version_child('versionId');
CREATE TRIGGER "wwy_guard_evidence" BEFORE INSERT OR UPDATE OR DELETE ON "EvidenceLink"
  FOR EACH ROW EXECUTE FUNCTION wwy_guard_version_child('versionId');
CREATE TRIGGER "wwy_guard_planning_session" BEFORE INSERT OR UPDATE OR DELETE ON "PlanningSession"
  FOR EACH ROW EXECUTE FUNCTION wwy_guard_version_child('versionId');
CREATE TRIGGER "wwy_guard_planning_message" BEFORE INSERT OR UPDATE OR DELETE ON "PlanningMessage"
  FOR EACH ROW EXECUTE FUNCTION wwy_guard_version_child('sessionId');

CREATE FUNCTION wwy_prevent_outline_cycle() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF NEW."parentId" IS NOT NULL AND EXISTS (
    WITH RECURSIVE ancestors AS (
      SELECT "id", "parentId" FROM public."OutlineNode"
      WHERE "id" = NEW."parentId" AND "versionId" = NEW."versionId"
      UNION
      SELECT n."id", n."parentId" FROM public."OutlineNode" n
      JOIN ancestors a ON n."id" = a."parentId"
      WHERE n."versionId" = NEW."versionId"
    )
    SELECT 1 FROM ancestors WHERE "id" = NEW."id"
  ) THEN
    RAISE EXCEPTION 'Outline nodes cannot form a cycle' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

-- Runs after a_wwy_guard_outline, which serializes changes on the version row.
CREATE TRIGGER "b_wwy_prevent_outline_cycle"
BEFORE INSERT OR UPDATE ON "OutlineNode"
FOR EACH ROW EXECUTE FUNCTION wwy_prevent_outline_cycle();

COMMIT;
