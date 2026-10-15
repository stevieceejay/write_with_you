-- Approved initial PostgreSQL schema. UUIDs and @updatedAt values are supplied by Prisma.
BEGIN;

CREATE TYPE "EssayStage" AS ENUM ('PLAN', 'DRAFT', 'REVISE', 'REVIEW');
CREATE TYPE "VersionKind" AS ENUM ('WORKING', 'SNAPSHOT');
CREATE TYPE "OutlineRole" AS ENUM ('THESIS', 'MAIN_IDEA', 'REASON', 'EVIDENCE', 'EXAMPLE', 'EXPLANATION', 'TRANSITION', 'INTRODUCTION', 'CONCLUSION');
CREATE TYPE "ContentOrigin" AS ENUM ('STUDENT', 'AI', 'MIXED');
CREATE TYPE "PlanningStep" AS ENUM ('TOPIC', 'AUDIENCE', 'PURPOSE', 'THESIS', 'REASONS', 'SUPPORTING_DETAILS', 'COMPLETE');
CREATE TYPE "MessageRole" AS ENUM ('STUDENT', 'ASSISTANT');
CREATE TYPE "AnnotationReview" AS ENUM ('SUGGESTED', 'CONFIRMED', 'DISMISSED');
CREATE TYPE "MappingStatus" AS ENUM ('CURRENT', 'STALE');
CREATE TYPE "RelationshipType" AS ENUM ('SUPPORTS', 'EXPLAINS', 'EXEMPLIFIES', 'CONTRASTS', 'CONCLUDES');
CREATE TYPE "AIRequestStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');
CREATE TYPE "ProposalStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'STALE');
CREATE TYPE "VerificationStatus" AS ENUM ('UNVERIFIED', 'STUDENT_CONFIRMED', 'VERIFIED', 'DISPUTED');

CREATE TABLE "User" (
  "id" UUID NOT NULL,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id"),
  "authProvider" VARCHAR(80) NOT NULL,
  "authSubject" VARCHAR(255) NOT NULL,
  "email" VARCHAR(320) NOT NULL,
  "displayName" VARCHAR(120),
  "emailVerifiedAt" TIMESTAMPTZ(3),
  "timezone" VARCHAR(80) NOT NULL DEFAULT 'UTC',
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  "deletionRequestedAt" TIMESTAMPTZ(3)
);

CREATE TABLE "Subject" (
  "id" UUID NOT NULL,
  CONSTRAINT "Subject_pkey" PRIMARY KEY ("id"),
  "userId" UUID NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "normalizedName" VARCHAR(120) NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL
);

CREATE TABLE "Essay" (
  "id" UUID NOT NULL,
  CONSTRAINT "Essay_pkey" PRIMARY KEY ("id"),
  "userId" UUID NOT NULL,
  "subjectId" UUID,
  "title" VARCHAR(300) NOT NULL DEFAULT 'Untitled essay',
  "workflowStage" "EssayStage" NOT NULL DEFAULT 'PLAN',
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  "lastOpenedAt" TIMESTAMPTZ(3),
  "deletedAt" TIMESTAMPTZ(3)
);

CREATE TABLE "EssayVersion" (
  "id" UUID NOT NULL,
  CONSTRAINT "EssayVersion_pkey" PRIMARY KEY ("id"),
  "essayId" UUID NOT NULL,
  "parentVersionId" UUID,
  "kind" "VersionKind" NOT NULL DEFAULT 'WORKING',
  "label" VARCHAR(160),
  "topic" TEXT,
  "audience" VARCHAR(200),
  "purpose" VARCHAR(200),
  "essayType" VARCHAR(80),
  "documentJson" JSONB NOT NULL,
  "plainText" TEXT NOT NULL DEFAULT '',
  "formatting" JSONB NOT NULL DEFAULT '{}',
  "schemaVersion" INTEGER NOT NULL DEFAULT 1,
  "lockVersion" INTEGER NOT NULL DEFAULT 0,
  "origin" "ContentOrigin" NOT NULL DEFAULT 'STUDENT',
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  "sealedAt" TIMESTAMPTZ(3)
);

CREATE TABLE "OutlineNode" (
  "id" UUID NOT NULL,
  CONSTRAINT "OutlineNode_pkey" PRIMARY KEY ("id"),
  "versionId" UUID NOT NULL,
  "nodeKey" UUID NOT NULL,
  "parentId" UUID,
  "position" INTEGER NOT NULL,
  "role" "OutlineRole" NOT NULL,
  "content" TEXT NOT NULL,
  "origin" "ContentOrigin" NOT NULL DEFAULT 'STUDENT',
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL
);

CREATE TABLE "PlanningSession" (
  "id" UUID NOT NULL,
  CONSTRAINT "PlanningSession_pkey" PRIMARY KEY ("id"),
  "versionId" UUID NOT NULL,
  "step" "PlanningStep" NOT NULL DEFAULT 'TOPIC',
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL
);

CREATE TABLE "PlanningMessage" (
  "id" UUID NOT NULL,
  CONSTRAINT "PlanningMessage_pkey" PRIMARY KEY ("id"),
  "sessionId" UUID NOT NULL,
  "role" "MessageRole" NOT NULL,
  "step" "PlanningStep",
  "content" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "Annotation" (
  "id" UUID NOT NULL,
  CONSTRAINT "Annotation_pkey" PRIMARY KEY ("id"),
  "versionId" UUID NOT NULL,
  "outlineNodeId" UUID,
  "annotationKey" UUID NOT NULL,
  "role" "OutlineRole" NOT NULL,
  "anchor" JSONB NOT NULL,
  "explanation" TEXT,
  "basedOnLockVersion" INTEGER NOT NULL,
  "origin" "ContentOrigin" NOT NULL DEFAULT 'AI',
  "reviewStatus" "AnnotationReview" NOT NULL DEFAULT 'SUGGESTED',
  "mappingStatus" "MappingStatus" NOT NULL DEFAULT 'CURRENT',
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "IdeaRelationship" (
  "id" UUID NOT NULL,
  CONSTRAINT "IdeaRelationship_pkey" PRIMARY KEY ("id"),
  "versionId" UUID NOT NULL,
  "fromAnnotationId" UUID NOT NULL,
  "toAnnotationId" UUID NOT NULL,
  "type" "RelationshipType" NOT NULL,
  "explanation" TEXT,
  "origin" "ContentOrigin" NOT NULL DEFAULT 'AI',
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "Source" (
  "id" UUID NOT NULL,
  CONSTRAINT "Source_pkey" PRIMARY KEY ("id"),
  "essayId" UUID NOT NULL,
  "title" TEXT NOT NULL,
  "authors" JSONB NOT NULL DEFAULT '[]',
  "url" TEXT,
  "publicationDate" VARCHAR(40),
  "accessedAt" TIMESTAMPTZ(3),
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL
);

CREATE TABLE "EvidenceLink" (
  "id" UUID NOT NULL,
  CONSTRAINT "EvidenceLink_pkey" PRIMARY KEY ("id"),
  "essayId" UUID NOT NULL,
  "versionId" UUID NOT NULL,
  "annotationId" UUID NOT NULL,
  "sourceId" UUID NOT NULL,
  "quotation" TEXT,
  "locator" VARCHAR(200),
  "citationSnapshot" JSONB NOT NULL,
  "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "AIRequest" (
  "id" UUID NOT NULL,
  CONSTRAINT "AIRequest_pkey" PRIMARY KEY ("id"),
  "essayId" UUID NOT NULL,
  "versionId" UUID,
  "basedOnLockVersion" INTEGER,
  "operation" VARCHAR(80) NOT NULL,
  "status" "AIRequestStatus" NOT NULL DEFAULT 'QUEUED',
  "model" VARCHAR(120) NOT NULL,
  "promptVersion" VARCHAR(80) NOT NULL,
  "idempotencyKey" VARCHAR(160) NOT NULL,
  "providerRequestId" VARCHAR(255),
  "inputTokens" INTEGER,
  "outputTokens" INTEGER,
  "errorCode" VARCHAR(120),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMPTZ(3)
);

CREATE TABLE "AIProposal" (
  "id" UUID NOT NULL,
  CONSTRAINT "AIProposal_pkey" PRIMARY KEY ("id"),
  "essayId" UUID NOT NULL,
  "targetVersionId" UUID NOT NULL,
  "requestId" UUID,
  "basedOnLockVersion" INTEGER NOT NULL,
  "operation" VARCHAR(80) NOT NULL,
  "changes" JSONB NOT NULL,
  "rationale" TEXT,
  "status" "ProposalStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMPTZ(3)
);

CREATE UNIQUE INDEX "User_email_key" ON "User" ("email");
CREATE UNIQUE INDEX "User_authProvider_authSubject_key" ON "User" ("authProvider", "authSubject");
CREATE UNIQUE INDEX "Subject_userId_normalizedName_key" ON "Subject" ("userId", "normalizedName");
CREATE UNIQUE INDEX "Subject_id_userId_key" ON "Subject" ("id", "userId");
CREATE INDEX "Essay_userId_deletedAt_updatedAt_idx" ON "Essay" ("userId", "deletedAt", "updatedAt" DESC);
CREATE INDEX "Essay_userId_subjectId_deletedAt_updatedAt_idx" ON "Essay" ("userId", "subjectId", "deletedAt", "updatedAt" DESC);
CREATE UNIQUE INDEX "EssayVersion_id_essayId_key" ON "EssayVersion" ("id", "essayId");
CREATE INDEX "EssayVersion_essayId_kind_createdAt_idx" ON "EssayVersion" ("essayId", "kind", "createdAt" DESC);
CREATE INDEX "EssayVersion_parentVersionId_essayId_idx" ON "EssayVersion" ("parentVersionId", "essayId");
CREATE UNIQUE INDEX "OutlineNode_id_versionId_key" ON "OutlineNode" ("id", "versionId");
CREATE UNIQUE INDEX "OutlineNode_versionId_nodeKey_key" ON "OutlineNode" ("versionId", "nodeKey");
CREATE INDEX "OutlineNode_versionId_parentId_position_idx" ON "OutlineNode" ("versionId", "parentId", "position");
CREATE UNIQUE INDEX "PlanningSession_versionId_key" ON "PlanningSession" ("versionId");
CREATE INDEX "PlanningMessage_sessionId_createdAt_id_idx" ON "PlanningMessage" ("sessionId", "createdAt", "id");
CREATE UNIQUE INDEX "Annotation_id_versionId_key" ON "Annotation" ("id", "versionId");
CREATE UNIQUE INDEX "Annotation_versionId_annotationKey_key" ON "Annotation" ("versionId", "annotationKey");
CREATE INDEX "Annotation_versionId_role_mappingStatus_idx" ON "Annotation" ("versionId", "role", "mappingStatus");
CREATE INDEX "Annotation_outlineNodeId_versionId_idx" ON "Annotation" ("outlineNodeId", "versionId");
CREATE UNIQUE INDEX "IdeaRelationship_unique_link" ON "IdeaRelationship" ("versionId", "fromAnnotationId", "toAnnotationId", "type");
CREATE INDEX "IdeaRelationship_fromAnnotationId_versionId_idx" ON "IdeaRelationship" ("fromAnnotationId", "versionId");
CREATE INDEX "IdeaRelationship_toAnnotationId_versionId_idx" ON "IdeaRelationship" ("toAnnotationId", "versionId");
CREATE UNIQUE INDEX "Source_id_essayId_key" ON "Source" ("id", "essayId");
CREATE INDEX "Source_essayId_idx" ON "Source" ("essayId");
CREATE INDEX "EvidenceLink_versionId_idx" ON "EvidenceLink" ("versionId");
CREATE INDEX "EvidenceLink_annotationId_versionId_idx" ON "EvidenceLink" ("annotationId", "versionId");
CREATE INDEX "EvidenceLink_sourceId_essayId_idx" ON "EvidenceLink" ("sourceId", "essayId");
CREATE UNIQUE INDEX "AIRequest_id_essayId_key" ON "AIRequest" ("id", "essayId");
CREATE UNIQUE INDEX "AIRequest_essayId_idempotencyKey_key" ON "AIRequest" ("essayId", "idempotencyKey");
CREATE INDEX "AIRequest_essayId_createdAt_idx" ON "AIRequest" ("essayId", "createdAt" DESC);
CREATE INDEX "AIRequest_versionId_essayId_idx" ON "AIRequest" ("versionId", "essayId");
CREATE INDEX "AIRequest_status_createdAt_idx" ON "AIRequest" ("status", "createdAt");
CREATE INDEX "AIProposal_targetVersionId_status_createdAt_idx" ON "AIProposal" ("targetVersionId", "status", "createdAt");
CREATE INDEX "AIProposal_requestId_essayId_idx" ON "AIProposal" ("requestId", "essayId");

ALTER TABLE "Subject" ADD CONSTRAINT "Subject_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Essay" ADD CONSTRAINT "Essay_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Essay" ADD CONSTRAINT "Essay_subjectId_userId_fkey" FOREIGN KEY ("subjectId", "userId") REFERENCES "Subject" ("id", "userId") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "EssayVersion" ADD CONSTRAINT "EssayVersion_essayId_fkey" FOREIGN KEY ("essayId") REFERENCES "Essay" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EssayVersion" ADD CONSTRAINT "EssayVersion_parentVersionId_essayId_fkey" FOREIGN KEY ("parentVersionId", "essayId") REFERENCES "EssayVersion" ("id", "essayId") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "OutlineNode" ADD CONSTRAINT "OutlineNode_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "EssayVersion" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OutlineNode" ADD CONSTRAINT "OutlineNode_parentId_versionId_fkey" FOREIGN KEY ("parentId", "versionId") REFERENCES "OutlineNode" ("id", "versionId") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "PlanningSession" ADD CONSTRAINT "PlanningSession_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "EssayVersion" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlanningMessage" ADD CONSTRAINT "PlanningMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "PlanningSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Annotation" ADD CONSTRAINT "Annotation_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "EssayVersion" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Annotation" ADD CONSTRAINT "Annotation_outlineNodeId_versionId_fkey" FOREIGN KEY ("outlineNodeId", "versionId") REFERENCES "OutlineNode" ("id", "versionId") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "IdeaRelationship" ADD CONSTRAINT "IdeaRelationship_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "EssayVersion" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IdeaRelationship" ADD CONSTRAINT "IdeaRelationship_fromAnnotationId_versionId_fkey" FOREIGN KEY ("fromAnnotationId", "versionId") REFERENCES "Annotation" ("id", "versionId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IdeaRelationship" ADD CONSTRAINT "IdeaRelationship_toAnnotationId_versionId_fkey" FOREIGN KEY ("toAnnotationId", "versionId") REFERENCES "Annotation" ("id", "versionId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Source" ADD CONSTRAINT "Source_essayId_fkey" FOREIGN KEY ("essayId") REFERENCES "Essay" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EvidenceLink" ADD CONSTRAINT "EvidenceLink_versionId_essayId_fkey" FOREIGN KEY ("versionId", "essayId") REFERENCES "EssayVersion" ("id", "essayId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EvidenceLink" ADD CONSTRAINT "EvidenceLink_annotationId_versionId_fkey" FOREIGN KEY ("annotationId", "versionId") REFERENCES "Annotation" ("id", "versionId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EvidenceLink" ADD CONSTRAINT "EvidenceLink_sourceId_essayId_fkey" FOREIGN KEY ("sourceId", "essayId") REFERENCES "Source" ("id", "essayId") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "AIRequest" ADD CONSTRAINT "AIRequest_essayId_fkey" FOREIGN KEY ("essayId") REFERENCES "Essay" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AIRequest" ADD CONSTRAINT "AIRequest_versionId_essayId_fkey" FOREIGN KEY ("versionId", "essayId") REFERENCES "EssayVersion" ("id", "essayId") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "AIProposal" ADD CONSTRAINT "AIProposal_targetVersionId_essayId_fkey" FOREIGN KEY ("targetVersionId", "essayId") REFERENCES "EssayVersion" ("id", "essayId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AIProposal" ADD CONSTRAINT "AIProposal_requestId_essayId_fkey" FOREIGN KEY ("requestId", "essayId") REFERENCES "AIRequest" ("id", "essayId") ON DELETE NO ACTION ON UPDATE CASCADE;

COMMIT;
